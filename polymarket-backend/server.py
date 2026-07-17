"""
server.py — InvestPal Polymarket Trade Engine HTTP Server
Run: python run.py
"""
import json, logging, os, sys, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Monkey-patch OrderArgs.dict for py-clob-client Pydantic v2 compat
try:
    from py_clob_client.clob_types import OrderArgs
    import dataclasses
    if not hasattr(OrderArgs, 'dict'):
        OrderArgs.dict = lambda self: dataclasses.asdict(self)
except Exception:
    pass

from core.polymarket   import (run_poly_loop, get_cached, full_scan_and_cache,
                                fetch_orderbook, fetch_clob_price, fetch_positions,
                                place_order, cancel_order, get_open_orders,
                                get_cache_age_minutes)
from core.trade_engine import (get_picks, get_results, get_tracked,
                                save_tracked, resolve_pick, reset_all)
from core.martingale   import (get_state, reset_state, calc_stake,
                                record_outcome, recovery_table, update_config)
from core.bot          import (get_config as get_bot_cfg, save_config as save_bot_cfg,
                                get_bot_state, run_cycle, reset_bot, run_bot_loop)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s"
)
log = logging.getLogger("server")

PORT     = 8090
STATIC   = os.path.join(os.path.dirname(__file__), "web", "static")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ENV_FILE = os.path.join(os.path.dirname(__file__), ".env")
CFG_FILE = os.path.join(DATA_DIR, "config.json")
os.makedirs(DATA_DIR, exist_ok=True)

DEFAULT_CFG = {
    "base_stake": 0.1, "factor": 2.1, "max_steps": 6,
    "bankroll": 100, "alert_mins": 60, "balance_filter": 0.30
}


# ── Config ────────────────────────────────────────────────────────────────────
def load_cfg():
    try:
        with open(CFG_FILE) as f:
            return {**DEFAULT_CFG, **json.load(f)}
    except:
        return DEFAULT_CFG.copy()

def save_cfg(d):
    c = load_cfg(); c.update(d)
    with open(CFG_FILE, 'w') as f: json.dump(c, f, indent=2)


# ── .env helpers ──────────────────────────────────────────────────────────────
def load_env():
    env = {}
    if not os.path.isfile(ENV_FILE): return env
    for line in open(ENV_FILE):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def save_env(updates):
    env = load_env(); env.update(updates)
    with open(ENV_FILE, 'w') as f:
        f.writelines(f"{k}={v}\n" for k, v in env.items())
    for k, v in updates.items(): os.environ[k] = v

def get_pk():
    return load_env().get("POLYMARKET_PRIVATE_KEY", "") or os.getenv("POLYMARKET_PRIVATE_KEY", "")

def get_funder():
    return load_env().get("POLYMARKET_FUNDER_ADDRESS", "") or os.getenv("POLYMARKET_FUNDER_ADDRESS", "")


# ── Wallet Integration & Balance Fetcher ──────────────────────────────────────
def get_wallet_address_and_balance(private_key_or_mnemonic):
    import requests
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    
    clean_key = private_key_or_mnemonic.strip()
    
    # Try seed phrase first (usually spaces-separated words)
    if len(clean_key.split()) >= 12:
        try:
            acct = Account.from_mnemonic(clean_key)
            pk = acct.key.hex()
            addr = acct.address
        except Exception as e:
            return {"ok": False, "error": f"Invalid seed phrase: {e}"}
    else:
        # Hex private key
        if not clean_key.startswith("0x") and len(clean_key) == 64:
            clean_key = "0x" + clean_key
        try:
            acct = Account.from_key(clean_key)
            pk = clean_key
            addr = acct.address
        except Exception as e:
            return {"ok": False, "error": f"Invalid private key: {e}"}
            
    # Query balances using the Tenderly gateway
    rpc_url = "https://polygon.gateway.tenderly.co"
    
    def token_balance(contract_addr):
        payload = {
            "jsonrpc": "2.0",
            "method": "eth_call",
            "params": [
                {
                    "to": contract_addr,
                    "data": f"0x70a08231000000000000000000000000{addr[2:].lower()}"
                },
                "latest"
            ],
            "id": 1
        }
        try:
            r = requests.post(rpc_url, json=payload, timeout=6)
            res = r.json()
            if "result" in res:
                val = int(res["result"], 16)
                return round(val / 1000000.0, 2)
        except:
            pass
        return 0.0
        
    def matic_balance():
        payload = {
            "jsonrpc": "2.0",
            "method": "eth_getBalance",
            "params": [addr, "latest"],
            "id": 1
        }
        try:
            r = requests.post(rpc_url, json=payload, timeout=6)
            res = r.json()
            if "result" in res:
                val = int(res["result"], 16)
                return round(val / 1e18, 4)
        except:
            pass
        return 0.0
        
    usdc = token_balance("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359") # Native USDC
    usdc_e = token_balance("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174") # Bridged USDC.e
    
    return {
        "ok": True,
        "address": addr,
        "usdc": usdc,
        "usdc_e": usdc_e,
        "total_usdc": round(usdc + usdc_e, 2),
        "private_key_preview": f"0x...{pk[-6:]}" if pk else ""
    }


def run_24h_backtest(base_stake=10.0, recovery_factor=2.0, max_steps=6, initial_bankroll=1000.0):
    import requests, json
    from core.polymarket import SPORT_TAGS, parse_market
    
    gamma_url = "https://gamma-api.polymarket.com/events"
    parsed_markets = []
    seen = set()
    
    for tag in SPORT_TAGS:
        params = {
            "active": "false",
            "closed": "true",
            "tag_slug": tag,
            "limit": 15
        }
        try:
            r = requests.get(gamma_url, params=params, timeout=5)
            if r.ok:
                d = r.json()
                evts = d if isinstance(d, list) else d.get("events", [])
                for ev in evts:
                    title = ev.get("title", ev.get("name", ""))
                    for m in ev.get("markets", []):
                        mid = m.get("id")
                        if not mid or mid in seen:
                            continue
                        seen.add(mid)
                        
                        prices = m.get("outcomePrices", [])
                        if isinstance(prices, str):
                            try: prices = json.loads(prices)
                            except: continue
                        if not prices or len(prices) < 2:
                            continue
                        try:
                            pA = float(prices[0])
                            pB = float(prices[1])
                        except:
                            continue
                        if pA != 1.0 and pB != 1.0:
                            continue
                            
                        outcome_is_A = (pA == 1.0)
                        p = parse_market(m, title, force_sports=True, allow_closed=True)
                        if p:
                            p['outcome_is_A'] = outcome_is_A
                            parsed_markets.append(p)
        except Exception as e:
            pass
            
    parsed_markets.sort(key=lambda x: x.get('end_date', ''))
    
    bankroll = initial_bankroll
    streak_a = 0
    streak_b = 0
    trades_run = []
    wins = 0
    losses = 0
    
    for m in parsed_markets:
        stake_a = round(base_stake * (recovery_factor ** streak_a), 2)
        stake_b = round(base_stake * (recovery_factor ** streak_b), 2)
        total_stake = round(stake_a + stake_b, 2)
        
        if bankroll < total_stake:
            break
            
        outcome_is_A = m['outcome_is_A']
        oA = m.get('oA', 2.0)
        oB = m.get('oB', 2.0)
        
        if outcome_is_A:
            net_pnl = round((oA - 1.0) * stake_a - stake_b, 2)
            streak_a = 0
            streak_b = min(streak_b + 1, max_steps)
        else:
            net_pnl = round((oB - 1.0) * stake_b - stake_a, 2)
            streak_a = min(streak_a + 1, max_steps)
            streak_b = 0
            
        bankroll = round(bankroll + net_pnl, 2)
        if net_pnl >= 0: wins += 1
        else: losses += 1
            
        trades_run.append({
            "time": m.get("time", "-"),
            "date": m.get("date", "-"),
            "sport": m.get("sport", "Sports"),
            "name": m.get("question") or m.get("name"),
            "stake_a": stake_a,
            "stake_b": stake_b,
            "outcome": "YES" if outcome_is_A else "NO",
            "pnl": net_pnl,
            "bankroll": bankroll
        })
        
    total_trades = len(trades_run)
    win_rate = round((wins / total_trades) * 100, 1) if total_trades > 0 else 0.0
    
    return {
        "ok": True,
        "initial_bankroll": initial_bankroll,
        "final_bankroll": bankroll,
        "total_pnl": round(bankroll - initial_bankroll, 2),
        "trades_run": total_trades,
        "wins": wins,
        "losses": losses,
        "win_rate": f"{win_rate}%",
        "trades": trades_run
    }


# ── Handler ───────────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass   # silence access log

    def _json(self, data, code=200):
        body = json.dumps(data, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n) if n else b"{}"
        try: return json.loads(raw)
        except: return {}

    def _static(self, path):
        if path in ("/", ""): path = "/index.html"
        full = os.path.join(STATIC, path.lstrip("/"))
        if not os.path.isfile(full):
            self.send_response(404); self.end_headers(); return
        ext  = os.path.splitext(full)[1].lstrip(".")
        mime = {"html": "text/html", "js": "application/javascript",
                "css":  "text/css",  "json": "application/json",
                "png":  "image/png", "ico": "image/x-icon"}.get(ext, "text/plain")
        body = open(full, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    PREFIX = "/polymarket"

    # ── GET ───────────────────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/")
        # Strip reverse-proxy prefix so the app works behind /polymarket/*
        if path.startswith(self.PREFIX):
            path = path[len(self.PREFIX):] or "/"
        qs     = parse_qs(parsed.query)

        if path == "/api/feed":
            markets = get_cached()
            state   = get_state()
            tracked = get_tracked()
            cfg     = load_cfg()
            bf      = float(cfg.get("balance_filter", 0.30))
            cands   = sorted(
                [m for m in markets if abs(m.get("oA",0) - m.get("oB",0)) <= bf],
                key=lambda m: abs(m.get("oA",0) - m.get("oB",0))
            )
            self._json({
                "feed":          markets,
                "suggested":     cands[0] if cands else None,
                "state":         state,
                "tracked_picks": tracked,
                "current_stake_a": calc_stake(state.get("streak_a", 0), state),
                "current_stake_b": calc_stake(state.get("streak_b", 0), state),
                "cache_age_mins":  round(get_cache_age_minutes(), 1),
                "market_count":    len(markets),
            })

        elif path == "/api/status":
            state = get_state()
            self._json({
                **state,
                "current_stake_a": calc_stake(state["streak_a"], state),
                "current_stake_b": calc_stake(state["streak_b"], state),
                "recovery_table":  recovery_table(),
                "trades":          get_results()[:50],
                "won":             state["wins"],
                "lost":            state["losses"],
                "total_profit":    state["total_pnl"],
            })

        elif path == "/api/config":
            self._json({"config": load_cfg()})

        elif path == "/api/track":
            self._json({"tracked_picks": get_tracked()})

        elif path == "/api/picks":
            self._json({"picks": [p for p in get_picks() if p["status"] == "pending"]})

        elif path == "/api/results":
            self._json({"results": get_results()})

        elif path == "/api/sports-categories":
            from core.polymarket import SPORT_TAGS
            markets = get_cached()
            cat_counts = {}
            for m in markets:
                s = m.get("sport", "Other")
                cat_counts[s] = cat_counts.get(s, 0) + 1
            cats = [{"name": s, "count": c, "slug": s.lower().replace("/", "-")} for s, c in sorted(cat_counts.items(), key=lambda x: -x[1])]
            self._json({"categories": cats, "tags": SPORT_TAGS})

        elif path == "/api/bot/config":
            self._json(get_bot_cfg())

        elif path == "/api/bot/state":
            self._json(get_bot_state())

        elif path == "/api/polymarket/orderbook":
            tid = qs.get("token_id", [""])[0]
            self._json(fetch_orderbook(tid) if tid else {"error": "token_id required"})

        elif path == "/api/polymarket/price":
            tid = qs.get("token_id", [""])[0]
            self._json(fetch_clob_price(tid) if tid else {"error": "token_id required"})

        elif path == "/api/polymarket/positions":
            pk   = get_pk()
            addr = get_funder() or (pk[:42] if pk.startswith("0x") and len(pk) >= 42 else "")
            self._json({"positions": fetch_positions(addr) if addr else []})

        elif path == "/api/polymarket/orders":
            pk = get_pk()
            self._json({"orders": get_open_orders(pk) if pk else []})

        elif path == "/api/env":
            env  = load_env()
            pk   = env.get("POLYMARKET_PRIVATE_KEY", "")
            self._json({
                "has_private_key":    bool(pk and len(pk) > 10),
                "private_key_preview": f"0x...{pk[-6:]}" if pk and len(pk) > 10 else "",
                "funder_address":     env.get("POLYMARKET_FUNDER_ADDRESS", ""),
                "chain_id":           int(env.get("CHAIN_ID", "137")),
                "trading_enabled":    bool(pk and len(pk) > 10),
            })

        elif path == "/api/wallet/balance":
            pk = get_pk()
            if pk:
                self._json(get_wallet_address_and_balance(pk))
            else:
                self._json({"ok": True, "address": "", "usdc": 0.0, "usdc_e": 0.0, "total_usdc": 0.0})

        elif path.startswith("/api/"):
            self._json({"error": "unknown endpoint"}, 404)

        else:
            self._static(path)

    # ── POST ──────────────────────────────────────────────────────────────────
    def do_POST(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip("/")
        if path.startswith(self.PREFIX):
            path = path[len(self.PREFIX):] or "/"
        body   = self._body()

        if path == "/api/config":
            cfg = load_cfg(); cfg.update(body)
            save_cfg(cfg)
            update_config(
                bankroll  = cfg.get("bankroll"),
                base_stake= cfg.get("base_stake"),
                factor    = cfg.get("factor"),
                max_steps = cfg.get("max_steps"),
            )
            self._json({"ok": True, "config": cfg})

        elif path == "/api/env":
            updates = {}
            pk_input = body.get("private_key", "").strip()
            if pk_input:
                if len(pk_input.split()) >= 12:
                    from eth_account import Account
                    Account.enable_unaudited_hdwallet_features()
                    try:
                        acct = Account.from_mnemonic(pk_input)
                        updates["POLYMARKET_PRIVATE_KEY"] = acct.key.hex()
                    except Exception as e:
                        self._json({"ok": False, "error": f"Invalid mnemonic: {e}"})
                        return
                else:
                    updates["POLYMARKET_PRIVATE_KEY"] = pk_input
            if body.get("funder_address"): updates["POLYMARKET_FUNDER_ADDRESS"] = body["funder_address"]
            if body.get("chain_id"):       updates["CHAIN_ID"] = str(body["chain_id"])
            if updates: save_env(updates)
            env = load_env(); pk = env.get("POLYMARKET_PRIVATE_KEY", "")
            self._json({
                "ok":                 True,
                "has_private_key":    bool(pk and len(pk) > 10),
                "private_key_preview": f"0x...{pk[-6:]}" if pk and len(pk) > 10 else "",
                "funder_address":     env.get("POLYMARKET_FUNDER_ADDRESS", ""),
                "trading_enabled":    bool(pk and len(pk) > 10),
            })

        elif path == "/api/backtest":
            base_stake = float(body.get("base_stake", 10.0))
            recovery_factor = float(body.get("recovery_factor", 2.0))
            max_steps = int(body.get("max_steps", 6))
            bankroll = float(body.get("bankroll", 1000.0))
            res = run_24h_backtest(base_stake, recovery_factor, max_steps, bankroll)
            self._json(res)

        elif path == "/api/outcome":
            won   = bool(body.get("won", False))
            side  = body.get("bet_side", "A")
            trade = body.get("trade", {})
            state = get_state()
            streak= state["streak_a"] if side == "A" else state["streak_b"]
            stake = calc_stake(streak, state)
            odds  = float(trade.get("oA" if side=="A" else "oB",
                          trade.get("yes_odds" if side=="A" else "no_odds", 1.9)))
            pnl   = round((odds - 1) * stake if won else -stake, 2)
            new_state = record_outcome(side, won, odds, stake)
            self._json({
                "ok": True,
                "trade": {"won": won, "side": side, "odds": odds,
                          "stake": stake, "profit": pnl,
                          "balance_after": new_state["bankroll"]},
                "state": new_state,
            })

        elif path == "/api/track":
            pid     = body.get("pid", "")
            on      = body.get("on", False)
            ev      = body.get("ev", {})
            tracked = get_tracked()
            if on and ev:
                state = get_state()
                tracked[pid] = {
                    **ev,
                    "status": "pending",
                    "stakeA": calc_stake(state["streak_a"], state),
                    "stakeB": calc_stake(state["streak_b"], state),
                    "added":  time.strftime("%Y-%m-%d %H:%M:%S"),
                }
            elif not on and pid in tracked and tracked[pid].get("status") == "pending":
                del tracked[pid]
            save_tracked(tracked)
            self._json({"ok": True, "tracked_picks": tracked})

        elif path == "/api/track/clear":
            tracked = {k: v for k, v in get_tracked().items() if v.get("status") == "pending"}
            save_tracked(tracked)
            self._json({"ok": True, "tracked_picks": tracked})

        elif path == "/api/resolve":
            r = resolve_pick(body.get("pick_id",""), bool(body.get("won",False)), body.get("side","A"))
            self._json({"ok": bool(r), "resolved": r})

        elif path == "/api/reset":
            cfg   = load_cfg()
            state = reset_state(
                cfg.get("bankroll", 200),
                cfg.get("base_stake", 10),
                cfg.get("factor", 2.1),
                cfg.get("max_steps", 6),
            )
            reset_all()
            self._json({"ok": True, "state": state})

        elif path == "/api/simulate_losses":
            steps = int(body.get("steps", 6))
            state = get_state()
            for _ in range(steps):
                stake = calc_stake(state["streak_a"], state)
                state = record_outcome("A", False, 1.9, stake)
            self._json({"ok": True, "state": state})

        elif path == "/api/bot/config":
            save_bot_cfg(body)
            self._json({"ok": True, "config": get_bot_cfg()})

        elif path == "/api/bot/run":
            markets = get_cached()
            state   = run_cycle(markets)
            self._json({"ok": True, **state})

        elif path == "/api/bot/reset":
            self._json({"ok": True, **reset_bot()})

        elif path == "/api/polymarket/order":
            pk = body.get("private_key") or get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key. Configure in Settings tab."}); return
            result = place_order(
                token_id   = body.get("token_id", ""),
                side       = body.get("side", "BUY"),
                price      = float(body.get("price", 0.5)),
                size_usdc  = float(body.get("size_usdc", body.get("size", 10))),
                private_key= pk,
                funder     = body.get("funder") or get_funder(),
            )
            self._json(result)

        elif path == "/api/polymarket/cancel":
            pk = get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key configured."}); return
            self._json(cancel_order(body.get("order_id", ""), pk))

        elif path == "/api/polymarket/refresh":
            markets = full_scan_and_cache(enrich=bool(body.get("enrich", True)))
            self._json({"ok": True, "count": len(markets)})

        else:
            self._json({"error": "unknown endpoint"}, 404)


# ── Background threads + entry point ─────────────────────────────────────────
def main():
    stop = threading.Event()

    threads = [
        threading.Thread(
            target=run_poly_loop,
            args=(stop, 600),
            daemon=True, name="PolyScan"
        ),
        threading.Thread(
            target=run_bot_loop,
            args=(stop, get_cached),
            daemon=True, name="Bot"
        ),
    ]
    for t in threads: t.start()

    # Warm up cache on startup — run in a thread so the server starts immediately
    def warmup():
        try:
            log.info("Initial Polymarket scan starting…")
            full_scan_and_cache(enrich=True)
        except Exception as e:
            log.warning(f"Initial scan failed (expected on first run or no internet): {e}")
    threading.Thread(target=warmup, daemon=True, name="Warmup").start()

    server = HTTPServer(("0.0.0.0", PORT), Handler)
    log.info(f"╔══════════════════════════════════════════╗")
    log.info(f"║  InvestPal Polymarket Engine running     ║")
    log.info(f"║  http://localhost:{PORT}                   ║")
    log.info(f"╚══════════════════════════════════════════╝")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down…")
        stop.set()
        server.shutdown()


if __name__ == "__main__":
    main()
