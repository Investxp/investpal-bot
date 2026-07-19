"""
live_runner.py: a continuous loop (dry-run odds, no account) that advances
both demo lines one event at a time, persisting state after every single
bet so the dashboard can watch it happen in near-real-time, and checking
for dashboard-issued commands (pause/resume/reset) on every tick.

This is a demo/integration-test harness. When you're ready to go live,
the loop body's `client.get_quotes` / `place_back_bet` / `settle` calls
get replaced with `LiveBetfairClient` calls -- everything else (engine,
db persistence, command handling) stays the same.

Run: python3 live_runner.py
Stop with Ctrl+C.
"""
import os
import time

from betfair_client import DryRunBetfairClient
from db import Database
from models import BetOutcome, LineConfig, RecoveryMode, Side
from recovery_engine import RecoveryEngine
from simulate import dumb_ai_side_selector

TICK_SECONDS = 3
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "recovery_engine.db")


def build_lines():
    single_cfg = LineConfig(
        line_id="basketball-single-A",
        sport="basketball",
        market_type="MATCH_ODDS",
        mode=RecoveryMode.SINGLE,
        default_side=Side.A,
        base_stake=2.0,
        target_margin=1.0,
        commission_rate=0.05,
        max_stage=6,
        bankroll_alloc=1000.0,
    )
    hybrid_cfg = LineConfig(
        line_id="tennis-hybrid-ai",
        sport="tennis",
        market_type="MATCH_ODDS",
        mode=RecoveryMode.HYBRID_AI,
        base_stake=2.0,
        target_margin=1.0,
        commission_rate=0.05,
        max_stage=6,
        bankroll_alloc=1000.0,
        confidence_threshold=0.55,
    )
    return [single_cfg, hybrid_cfg]


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


def main():
    db = Database(path=DB_PATH)
    configs = build_lines()
    engines = []
    clients = {}
    for cfg in configs:
        db.save_config(cfg)
        existing = db.load_state(cfg.line_id)
        engine = RecoveryEngine(cfg, state=existing)
        engines.append(engine)
        clients[cfg.line_id] = DryRunBetfairClient()
        db.save_state(engine.state)

    print(f"Live runner started, {len(engines)} lines, "
          f"tick={TICK_SECONDS}s. Ctrl+C to stop.")
    print(f"DB: {DB_PATH}")

    tick = 0
    try:
        while True:
            tick += 1
            for engine in engines:
                apply_pending_command(engine, db)
                if engine.state.paused:
                    continue

                client = clients[engine.config.line_id]
                event_id = f"{engine.config.line_id}-evt-{tick}"
                quotes = client.get_quotes(event_id)
                selector = dumb_ai_side_selector if \
                    engine.config.mode == RecoveryMode.HYBRID_AI else None
                decision = engine.next_decision(event_id, quotes, side_selector=selector)

                if decision.rejected:
                    print(f"[{engine.config.line_id}] tick {tick}: SKIP "
                          f"({decision.rejection_reason})")
                    db.save_state(engine.state)
                    continue

                bet_id = client.place_back_bet(
                    event_id, decision.side, decision.stake, decision.odds)
                outcome = client.settle(event_id, bet_id)
                record = engine.apply_outcome(decision, outcome)
                record.bet_id = bet_id

                db.log_bet(record)
                db.save_state(engine.state)

                print(f"[{engine.config.line_id}] tick {tick}: "
                      f"{outcome.value.upper()} side={decision.side.value} "
                      f"stake={decision.stake:.2f} stage={decision.stage} "
                      f"pnl={record.pnl:+.2f} cum_loss={engine.state.cumulative_loss:.2f}"
                      + (f" -- PAUSED: {engine.state.pause_reason}"
                         if engine.state.paused else ""))

            time.sleep(TICK_SECONDS)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
