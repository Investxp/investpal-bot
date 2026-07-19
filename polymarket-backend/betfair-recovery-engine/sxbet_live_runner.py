"""
sxbet_live_runner.py: Non-blocking, production-ready runner for the SX Bet
Linear Recovery Engine.

What this does:
  1. Loads private key from .env and initialises SXBetClient.
  2. Builds and registers recovery lines in the SQLite database.
  3. Periodically (every tick):
     - Checks and settles any pending bets (non-blocking).
     - Polls active markets and places the next stage bet if a line is free and liquid.
     - Processes operator commands (PAUSE/RESUME/RESET) issued from the dashboard.

Hedge Mode (unified):
  A single `sxbet-hedge` LineConfig auto-configures BOTH legs (A and B) from
  the same starting parameters. No more separate hedge-A / hedge-B entries.

Run: python sxbet_live_runner.py
"""
import os
import sys
import time
import json
import requests
from copy import deepcopy
from datetime import datetime, timezone
from typing import List, Dict, Tuple

# Load environment variables from .env
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())

PRIVATE_KEY = os.environ.get("SX_PRIVATE_KEY", "")
if not PRIVATE_KEY or PRIVATE_KEY == "PASTE_YOUR_PRIVATE_KEY_HERE":
    print("ERROR: Set SX_PRIVATE_KEY in .env first.")
    sys.exit(1)

from sxbet_client import SXBetClient
from db import Database
from models import (
    BetOutcome, BetRecord, LineConfig, LineState, RecoveryMode, Side, StakeDecision
)
from recovery_engine import RecoveryEngine

TICK_SECONDS = 30
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recovery_engine.db")
SCANNER_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scanner_log.json")
SCANNER_LOG_MAX = 25  # ring buffer size

# ---------------------------------------------------------------------------
# Unified Hedge Mode Helper
# ---------------------------------------------------------------------------

def make_hedge_leg(parent_cfg: LineConfig, leg_side: Side) -> LineConfig:
    """
    Clone a parent LineConfig into a single-leg version for hedge execution.
    The leg_side is the only thing that differs between the two legs.
    All risk parameters (base_stake, min_odds, max_odds, max_stage, etc.)
    are inherited identically from the parent config.
    """
    leg = deepcopy(parent_cfg)
    leg.line_id = f"{parent_cfg.line_id}-{leg_side.value}"
    leg.default_side = leg_side
    leg.mode = RecoveryMode.HEDGE   # keeps the mode tag for DB clarity
    return leg


class HedgeBundle:
    """
    Wraps a parent LineConfig and spawns + synchronises two leg RecoveryEngines
    (Leg A and Leg B) whose configs are always auto-mirrored from the parent.
    """

    def __init__(self, parent_cfg: LineConfig, db: Database):
        self.parent_cfg = parent_cfg
        self.db = db
        self.line_id = parent_cfg.line_id

        cfg_a = make_hedge_leg(parent_cfg, Side.A)
        cfg_b = make_hedge_leg(parent_cfg, Side.B)

        # Persist both leg configs so the dashboard / API can see them
        db.save_config(cfg_a)
        db.save_config(cfg_b)

        state_a = db.load_state(cfg_a.line_id)
        state_b = db.load_state(cfg_b.line_id)

        self.engine_a = RecoveryEngine(cfg_a, state=state_a)
        self.engine_b = RecoveryEngine(cfg_b, state=state_b)

        db.save_state(self.engine_a.state)
        db.save_state(self.engine_b.state)

    def sync_config_from_db(self):
        """
        Re-read the PARENT config from DB each tick so live changes
        (e.g. from the dashboard strategy tuner) are picked up by both legs.
        """
        fresh_parent = self.db.load_config(self.line_id)
        if fresh_parent:
            self.parent_cfg = fresh_parent
            cfg_a = make_hedge_leg(fresh_parent, Side.A)
            cfg_b = make_hedge_leg(fresh_parent, Side.B)
            # Update leg configs and calculators in-place
            self.engine_a.config = cfg_a
            self.engine_a.calculator.config = cfg_a
            self.engine_b.config = cfg_b
            self.engine_b.calculator.config = cfg_b

    @property
    def is_paused(self) -> bool:
        return self.engine_a.state.paused or self.engine_b.state.paused

    def apply_pending_commands(self):
        for engine in (self.engine_a, self.engine_b):
            cmd = self.db.pop_command(engine.config.line_id)
            if not cmd:
                # Also check parent line_id for unified commands
                cmd = self.db.pop_command(self.line_id)
            if cmd == "PAUSE":
                engine.state.paused = True
                engine.state.pause_reason = "manually paused from dashboard"
            elif cmd == "RESUME":
                engine.state.paused = False
                engine.state.pause_reason = None
            elif cmd == "RESET":
                engine.manual_reset()
            if cmd:
                self.db.save_state(engine.state)
                print(f"[{self.line_id}] Processed command for {engine.config.line_id}: {cmd}")

    def log_event(self, msg: str):
        print(f"[HEDGE:{self.line_id}] {msg}")


# ---------------------------------------------------------------------------
# Line configuration
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Scanner log helper
# ---------------------------------------------------------------------------

def log_scanner_event(event: dict):
    """Append a market scan event to the scanner_log.json ring buffer."""
    try:
        if os.path.exists(SCANNER_LOG):
            with open(SCANNER_LOG, "r") as f:
                log = json.load(f)
        else:
            log = []
        log.append(event)
        log = log[-SCANNER_LOG_MAX:]  # keep only latest
        with open(SCANNER_LOG, "w") as f:
            json.dump(log, f, indent=2)
    except Exception as e:
        print(f"[-] scanner_log write error: {e}")


def score_market_quotes(quotes: dict) -> int:
    """
    Score a market's quotes 0-100.
    Sweet spot: both sides between 1.5–5.0, volume >= 5 USDC each.
    Returns 0 if either side is illiquid or odds are outside our window.
    """
    qa = quotes.get(Side.A)
    qb = quotes.get(Side.B)
    if not qa or not qb:
        return 0
    if qa.matched_volume < 5.0 or qb.matched_volume < 5.0:
        return 0
    if not (1.4 <= qa.decimal_odds <= 6.5):
        return 0
    if not (1.4 <= qb.decimal_odds <= 6.5):
        return 0
    # Prefer tight markets: score based on how close to the sweet spot (2.0)
    centre_a = 1.0 - min(abs(qa.decimal_odds - 2.0) / 4.0, 1.0)
    centre_b = 1.0 - min(abs(qb.decimal_odds - 2.0) / 4.0, 1.0)
    vol_score = min((qa.matched_volume + qb.matched_volume) / 100.0, 1.0)
    return int((centre_a + centre_b + vol_score) / 3.0 * 100)


def scan_best_market(client, active_markets: list, cfg, traded_hashes: set,
                    require_both_sides: bool = False):
    """
    Scan the active market list using bulk API requests and return
    (best_market_dict, best_quotes_dict) for the highest-scoring market.
    """
    allow_in_play = load_allow_in_play()
    now = time.time()

    # 1. Filter active markets to find eligible ones
    eligible_markets = []
    eligible_hashes = []
    for market in active_markets:
        mh = market.get("marketHash")
        if not mh or mh in traded_hashes:
            continue
        sport_label = market.get("sportLabel", "").lower()
        if sport_label != cfg.sport.lower():
            continue

        # Check in-play setting
        game_time = market.get("gameTime", 0)
        in_play = game_time < now
        if in_play and not allow_in_play:
            continue

        eligible_markets.append(market)
        eligible_hashes.append(mh)

    if not eligible_hashes:
        return None, None

    # 2. Fetch quotes in bulk
    try:
        bulk_quotes = client.get_quotes_bulk(eligible_hashes)
    except Exception as e:
        print(f"[-] Error fetching bulk quotes in scanner: {e}")
        return None, None

    # 3. Evaluate and score each market
    best_market = None
    best_quotes = None
    best_score = 0

    for market in eligible_markets:
        mh = market["marketHash"]
        quotes = bulk_quotes.get(mh)
        if not quotes:
            continue

        score = score_market_quotes(quotes)
        desc = f"{market.get('teamOneName', 'Outcome 1')} vs {market.get('teamTwoName', 'Outcome 2')}"
        league = market.get('leagueLabel', '')
        game_time = market.get("gameTime", 0)
        in_play = game_time < now

        if score == 0:
            log_scanner_event({
                "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "market_hash": mh[:18] + "...",
                "description": desc,
                "league": league,
                "in_play": in_play,
                "game_time": game_time,
                "sport": cfg.sport.lower(),
                "side_a_odds": round(quotes.get(Side.A).decimal_odds, 4) if quotes.get(Side.A) else 0,
                "side_b_odds": round(quotes.get(Side.B).decimal_odds, 4) if quotes.get(Side.B) else 0,
                "side_a_vol": round(quotes.get(Side.A).matched_volume, 2) if quotes.get(Side.A) else 0,
                "side_b_vol": round(quotes.get(Side.B).matched_volume, 2) if quotes.get(Side.B) else 0,
                "status": "SKIPPED",
                "line_id": cfg.line_id
            })
            continue

        if require_both_sides:
            qa, qb = quotes.get(Side.A), quotes.get(Side.B)
            if not qa or not qb or qa.matched_volume < cfg.min_matched_volume or qb.matched_volume < cfg.min_matched_volume:
                continue
        else:
            side = Side.A  # will be overridden per-engine below
            q = quotes.get(side)
            if not q or q.matched_volume < cfg.min_matched_volume:
                continue

        if score > best_score:
            best_score = score
            best_market = market
            best_quotes = quotes
            log_scanner_event({
                "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "market_hash": mh[:18] + "...",
                "description": desc,
                "league": league,
                "in_play": in_play,
                "game_time": game_time,
                "sport": cfg.sport.lower(),
                "side_a_odds": round(quotes.get(Side.A).decimal_odds, 4) if quotes.get(Side.A) else 0,
                "side_b_odds": round(quotes.get(Side.B).decimal_odds, 4) if quotes.get(Side.B) else 0,
                "side_a_vol": round(quotes.get(Side.A).matched_volume, 2) if quotes.get(Side.A) else 0,
                "side_b_vol": round(quotes.get(Side.B).matched_volume, 2) if quotes.get(Side.B) else 0,
                "status": "CANDIDATE",
                "score": score,
                "line_id": cfg.line_id
            })

    return best_market, best_quotes


def build_lines() -> Tuple[List[LineConfig], List[LineConfig]]:
    """
    Returns (single_lines, hedge_parent_configs).
    Parameters tuned for SX Bet mainnet: conservative stake, tight odds window,
    meaningful minimum liquidity.
    """
    # --- SINGLE lines ---
    line_a = LineConfig(
        line_id="sxbet-single-A",
        sport="soccer",
        market_type="MATCH_ODDS",
        mode=RecoveryMode.SINGLE,
        default_side=Side.A,
        base_stake=1.0,
        target_margin=1.0,
        commission_rate=0.0,
        min_odds=1.5,
        max_odds=6.0,
        max_stage=5,
        bankroll_alloc=100.0,
        min_matched_volume=5.0,
    )
    line_b = LineConfig(
        line_id="sxbet-single-B",
        sport="soccer",
        market_type="MATCH_ODDS",
        mode=RecoveryMode.SINGLE,
        default_side=Side.B,
        base_stake=1.0,
        target_margin=1.0,
        commission_rate=0.0,
        min_odds=1.5,
        max_odds=6.0,
        max_stage=5,
        bankroll_alloc=100.0,
        min_matched_volume=5.0,
    )

    # --- UNIFIED HEDGE parent config ---
    hedge_parent = LineConfig(
        line_id="sxbet-hedge",
        sport="soccer",
        market_type="MATCH_ODDS",
        mode=RecoveryMode.HEDGE,
        default_side=Side.A,
        base_stake=1.0,
        target_margin=1.0,
        commission_rate=0.0,
        min_odds=1.5,
        max_odds=6.0,
        max_stage=5,
        bankroll_alloc=100.0,
        min_matched_volume=5.0,
    )

    return [line_a, line_b], [hedge_parent]


def apply_pending_command(engine: RecoveryEngine, db: Database):
    cmd = db.pop_command(engine.config.line_id)
    if cmd == "PAUSE":
        engine.state.paused = True
        engine.state.pause_reason = "manually paused from dashboard"
    elif cmd == "RESUME":
        engine.state.paused = False
        engine.state.pause_reason = None
    elif cmd == "RESET":
        engine.manual_reset()
    if cmd:
        db.save_state(engine.state)
        print(f"[{engine.config.line_id}] Processed operator command: {cmd}")


def load_auto_execution() -> bool:
    config_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "copytrade_config.json")
    if os.path.exists(config_file):
        try:
            with open(config_file, "r") as f:
                data = json.load(f)
                return data.get("auto_execution", True)
        except Exception:
            pass
    return True


def load_network_env() -> str:
    config_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "copytrade_config.json")
    if os.path.exists(config_file):
        try:
            with open(config_file, "r") as f:
                data = json.load(f)
                return data.get("network", "testnet").lower()
        except Exception:
            pass
    return "testnet"


def load_allow_in_play() -> bool:
    config_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "copytrade_config.json")
    if os.path.exists(config_file):
        try:
            with open(config_file, "r") as f:
                data = json.load(f)
                return data.get("allow_in_play", True)
        except Exception:
            pass
    return True


def fetch_all_active_markets(client) -> list:
    url = f"{client.base_url}/markets/active"
    params = {}
    all_markets = []
    loops = 0
    while True:
        try:
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json().get("data", {})
            markets = data.get("markets", [])
            all_markets.extend(markets)
            nk = data.get("nextKey")
            loops += 1
            if not nk or loops >= 15:
                break
            params["paginationKey"] = nk
            time.sleep(0.05)
        except Exception as e:
            print(f"[-] Error fetching active markets (loop {loops}): {e}")
            break
    return all_markets


def push_notification(msg_type: str, message: str, details: dict = None):
    """Append a notification to the queue file for the dashboard to consume."""
    notif_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "notifications.json")
    try:
        if os.path.exists(notif_file):
            with open(notif_file, "r") as f:
                queue = json.load(f)
        else:
            queue = []
        queue.append({
            "type": msg_type,
            "message": message,
            "details": details or {},
            "ts": datetime.utcnow().isoformat() + "Z",
            "read": False
        })
        # Keep last 50 notifications
        queue = queue[-50:]
        with open(notif_file, "w") as f:
            json.dump(queue, f, indent=2)
    except Exception as e:
        print(f"[-] Failed to push notification: {e}")


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    db = Database(path=DB_PATH)
    single_cfgs, hedge_parents = build_lines()

    # Sync network config from file first
    sx_env = load_network_env()
    os.environ["SX_ENV"] = sx_env
    is_testnet = (sx_env != "mainnet")
    print(f"[1] Initialising SXBetClient (Environment: {sx_env.upper()})...")
    client = SXBetClient(private_key=PRIVATE_KEY, testnet=is_testnet)
    print(f"    Wallet address : {client.address}")
    print(f"    USDC token     : {client.base_token}")
    db.log_audit_event("runner_start", f"Live runner starting in {sx_env.upper()} mode")

    # --- Register and load SINGLE engines ---
    single_engines: Dict[str, RecoveryEngine] = {}
    for cfg in single_cfgs:
        db.save_config(cfg)
        existing = db.load_state(cfg.line_id)
        if existing is None:
            # New Single lines start PAUSED by default so Hedge mode runs
            from models import LineState
            existing = LineState(line_id=cfg.line_id, paused=True, pause_reason="Single lines paused by default. Use Hedged mode.")
        single_engines[cfg.line_id] = RecoveryEngine(cfg, state=existing)
        db.save_state(single_engines[cfg.line_id].state)
        print(f"    [SINGLE] Loaded line {cfg.line_id} (Stage: {single_engines[cfg.line_id].state.stage}, PnL: {single_engines[cfg.line_id].state.total_realized_pnl:.2f})")

    # --- Register and load HEDGE bundles ---
    hedge_bundles: Dict[str, HedgeBundle] = {}
    for parent_cfg in hedge_parents:
        db.save_config(parent_cfg)
        bundle = HedgeBundle(parent_cfg, db)
        hedge_bundles[parent_cfg.line_id] = bundle
        print(f"    [HEDGE]  Loaded bundle {parent_cfg.line_id} -> Leg A (Stage: {bundle.engine_a.state.stage}) + Leg B (Stage: {bundle.engine_b.state.stage})")

    print(f"\n[2] Live SX Bet recovery runner started. Tick interval: {TICK_SECONDS}s.")
    print(f"    Dashboard points to: {DB_PATH}")
    print("    Ctrl+C to stop.\n")

    tick = 0
    current_env = sx_env
    try:
        while True:
            tick += 1

            # Check network toggles dynamically
            fresh_env = load_network_env()
            if fresh_env != current_env:
                print(f"\n[Engine] Network environment switched from {current_env.upper()} to {fresh_env.upper()}!")
                db.log_audit_event("toggle_network", f"Runner switched active environment to {fresh_env}")
                current_env = fresh_env
                is_testnet = (fresh_env != "mainnet")
                client = SXBetClient(private_key=PRIVATE_KEY, testnet=is_testnet)
                print(f"    New Wallet address : {client.address}")
                print(f"    New USDC token     : {client.base_token}")
                push_notification(
                    "system_alert",
                    f"⚙️ Network switched: Live runner active on {fresh_env.upper()}",
                    {"network": fresh_env}
                )

            # ================================================================
            # A. Settle Pending Bets (Non-blocking)
            # ================================================================
            pending_bets = db.get_pending_bets()
            for b in pending_bets:
                line_id = b["line_id"]
                bet_id = b["bet_id"]
                event_id = b["event_id"]

                # Find the right engine (could be single or a hedge leg)
                engine = single_engines.get(line_id)
                if engine is None:
                    for bundle in hedge_bundles.values():
                        if bundle.engine_a.config.line_id == line_id:
                            engine = bundle.engine_a
                            break
                        if bundle.engine_b.config.line_id == line_id:
                            engine = bundle.engine_b
                            break

                if engine is None:
                    continue

                print(f"[{line_id}] Checking pending trade status (Hash: {bet_id})...")
                outcome = client.check_bet_status(bet_id)
                if outcome is not None:
                    print(f"[{line_id}] Bet resolved: {outcome.value.upper()}")
                    decision = StakeDecision(
                        line_id=line_id,
                        event_id=event_id,
                        side=Side(b["side"]),
                        stake=b["stake"],
                        odds=b["odds"],
                        stage=b["stage"],
                        rejected=False
                    )
                    record = engine.apply_outcome(decision, outcome)
                    record.bet_id = bet_id

                    db.save_state(engine.state)
                    db.update_bet_outcome(bet_id, outcome, record.pnl)
                    db.log_audit_event("settle_bet", f"Bet settled for {line_id} (Stage {b['stage']}): {outcome.value.upper()} | PnL: {record.pnl:+.2f} USDC")
                    print(f"[{line_id}] State updated → Stage: {engine.state.stage}, Loss: {engine.state.cumulative_loss:.2f}")

                    # Push settlement notification
                    emoji = "🏆" if outcome == BetOutcome.WIN else "❌"
                    push_notification(
                        "bet_settled",
                        f"{emoji} Bet settled: {outcome.value.upper()} on {line_id} | PnL: {record.pnl:+.2f} USDC",
                        {"line_id": line_id, "outcome": outcome.value, "pnl": record.pnl, "bet_id": bet_id}
                    )

            # ================================================================
            # B. Auto-Execution Guard
            # ================================================================
            if not load_auto_execution():
                if tick % 4 == 0 or tick == 1:
                    print("[Engine] Autopilot stands by (Observation Mode). Skipping autonomous execution.")
                time.sleep(TICK_SECONDS)
                continue

            # ================================================================
            # C. Fetch Active Markets (Paginated)
            # ================================================================
            active_markets = fetch_all_active_markets(client)

            # ================================================================
            # D. Process SINGLE lines
            # ================================================================
            for line_id, engine in single_engines.items():
                # Reload config from DB to pick up live tuning changes
                cfg = db.load_config(line_id)
                if cfg:
                    engine.config = cfg
                    engine.calculator.config = cfg

                apply_pending_command(engine, db)

                if engine.state.paused:
                    continue

                line_pending = [b for b in db.get_pending_bets() if b["line_id"] == line_id]
                if line_pending:
                    continue

                history_events = {b["event_id"] for b in db.history(line_id)}

                target_market, target_quotes = scan_best_market(
                    client, active_markets, engine.config,
                    traded_hashes=history_events,
                    require_both_sides=False
                )

                if not target_market:
                    continue

                mh = target_market["marketHash"]
                decision = engine.next_decision(mh, target_quotes)
                if decision.rejected:
                    print(f"[{line_id}] Candidate skipped: {decision.rejection_reason}")
                    continue

                print(f"\n[{line_id}] Placing bet on event {mh} Side {decision.side.value} Stage {decision.stage}...")
                try:
                    bet_id = client.place_back_bet(mh, decision.side, decision.stake, decision.odds)
                    print(f"    Submitted! Tx Hash: {bet_id}")

                    record = BetRecord(
                        line_id=line_id, event_id=mh,
                        side=decision.side, stake=decision.stake,
                        odds=decision.odds, stage=decision.stage,
                        outcome=None, pnl=0.0, bet_id=bet_id
                    )
                    db.log_bet(record)
                    db.save_state(engine.state)
                    db.log_audit_event("place_bet", f"Placed bet on {line_id} (Side {decision.side.value}) - Stake: {decision.stake:.2f} USDC @ {decision.odds:.2f} (Stage {decision.stage})")

                    push_notification(
                        "bet_placed",
                        f"📥 Bet placed on {line_id} | Side {decision.side.value} | Stake: {decision.stake:.2f} @ {decision.odds:.2f}",
                        {"line_id": line_id, "stake": decision.stake, "odds": decision.odds,
                         "side": decision.side.value, "bet_id": bet_id}
                    )
                except Exception as e:
                    print(f"[-] Failed to place bet on {mh}: {e}")

            # ================================================================
            # E. Process HEDGE bundles (unified, auto-configured)
            # ================================================================
            for bundle_id, bundle in hedge_bundles.items():
                # Sync config from parent DB entry → auto-mirrors to both legs
                bundle.sync_config_from_db()
                bundle.apply_pending_commands()

                if bundle.is_paused:
                    continue

                # Skip if either leg has an active pending bet
                leg_ids = (bundle.engine_a.config.line_id, bundle.engine_b.config.line_id)
                legs_pending = [b for b in db.get_pending_bets() if b["line_id"] in leg_ids]
                if legs_pending:
                    continue

                # Build a combined history of market hashes both legs have traded
                history_a = {b["event_id"] for b in db.history(bundle.engine_a.config.line_id)}
                history_b = {b["event_id"] for b in db.history(bundle.engine_b.config.line_id)}
                traded_markets = history_a | history_b

                target_market = None
                target_quotes = None
                cfg = bundle.parent_cfg

                target_market, target_quotes = scan_best_market(
                    client, active_markets, cfg,
                    traded_hashes=traded_markets,
                    require_both_sides=True
                )

                if not target_market:
                    continue

                mh = target_market["marketHash"]
                dec_a = bundle.engine_a.next_decision(mh, target_quotes)
                dec_b = bundle.engine_b.next_decision(mh, target_quotes)

                if dec_a.rejected or dec_b.rejected:
                    reason = dec_a.rejection_reason or dec_b.rejection_reason
                    bundle.log_event(f"Skipping market {mh}: {reason}")
                    continue

                bundle.log_event(f"Placing DUAL bets on {mh} (A Stage {dec_a.stage} @ {dec_a.odds:.2f} | B Stage {dec_b.stage} @ {dec_b.odds:.2f})...")
                bet_a = None
                bet_b = None
                
                # 1. Attempt to place Leg A
                try:
                    bet_a = client.place_back_bet(mh, Side.A, dec_a.stake, dec_a.odds)
                    bundle.log_event(f"    Leg A submitted! Hash: {bet_a}")
                    
                    # Log Leg A immediately to the database so it's not orphaned
                    record_a = BetRecord(
                        line_id=bundle.engine_a.config.line_id, event_id=mh,
                        side=dec_a.side, stake=dec_a.stake,
                        odds=dec_a.odds, stage=dec_a.stage,
                        outcome=None, pnl=0.0, bet_id=bet_a
                    )
                    db.log_bet(record_a)
                    db.save_state(bundle.engine_a.state)
                except Exception as e:
                    bundle.log_event(f"FAILED to place Leg A on {mh}: {e}")
                    db.log_audit_event("place_hedge_failed_a", f"Failed to place Leg A on {bundle_id}: {e}")
                    # Since Leg A failed, we do NOT place Leg B to avoid unhedged exposure
                    continue
                
                # 2. Attempt to place Leg B
                try:
                    bet_b = client.place_back_bet(mh, Side.B, dec_b.stake, dec_b.odds)
                    bundle.log_event(f"    Leg B submitted! Hash: {bet_b}")
                    
                    # Log Leg B immediately
                    record_b = BetRecord(
                        line_id=bundle.engine_b.config.line_id, event_id=mh,
                        side=dec_b.side, stake=dec_b.stake,
                        odds=dec_b.odds, stage=dec_b.stage,
                        outcome=None, pnl=0.0, bet_id=bet_b
                    )
                    db.log_bet(record_b)
                    db.save_state(bundle.engine_b.state)
                except Exception as e:
                    bundle.log_event(f"FAILED to place Leg B on {mh} after Leg A was placed: {e}")
                    db.log_audit_event("place_hedge_failed_b", f"Leg A placed ({bet_a}) but Leg B failed to place: {e}")
                    
                    # Pause Leg B immediately due to mismatch
                    bundle.engine_b.state.paused = True
                    bundle.engine_b.state.pause_reason = f"Hedge mismatch: Leg A placed ({bet_a}) but Leg B failed to place ({e}). Manual review required."
                    db.save_state(bundle.engine_b.state)
                    
                    # Also pause Leg A (or keep it pending but paused to prevent new stages from placing)
                    bundle.engine_a.state.paused = True
                    bundle.engine_a.state.pause_reason = f"Hedge mismatch: Leg A placed successfully but Leg B failed to place. Manual review required."
                    db.save_state(bundle.engine_a.state)
                    
                    push_notification(
                        "system_alert",
                        f"⚠️ Hedge mismatch on {bundle_id}: Leg A placed but Leg B failed. Pausing strategy.",
                        {"bundle_id": bundle_id, "error": str(e)}
                    )
                    continue

                # Both succeeded! Log success audit and push notification
                db.log_audit_event("place_hedge", f"Placed unified hedge dual bets on {bundle_id} - A: {dec_a.stake:.2f} USDC @ {dec_a.odds:.2f} | B: {dec_b.stake:.2f} USDC @ {dec_b.odds:.2f}")

                push_notification(
                    "hedge_placed",
                    f"🔀 Hedge placed on {bundle_id} | A: {dec_a.stake:.2f} @ {dec_a.odds:.2f} | B: {dec_b.stake:.2f} @ {dec_b.odds:.2f}",
                    {"bundle_id": bundle_id, "market": mh,
                     "leg_a": {"stake": dec_a.stake, "odds": dec_a.odds},
                     "leg_b": {"stake": dec_b.stake, "odds": dec_b.odds}}
                )

            time.sleep(TICK_SECONDS)
    except KeyboardInterrupt:
        print("\nRunner stopped.")


if __name__ == "__main__":
    main()
