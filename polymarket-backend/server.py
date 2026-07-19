"""
server.py — InvestPal Polymarket Trade Engine HTTP Server
Run: python run.py
"""
import json, logging, os, sys, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# CLOB V2 — no monkey patches needed

from core.polymarket   import (run_poly_loop, get_cached, full_scan_and_cache,
                                fetch_orderbook, fetch_clob_price, fetch_positions,
                                place_order, cancel_order, get_open_orders,
                                get_balance_allowance, update_balance_allowance, approve_usdc,
                                get_cache_age_minutes, get_proxy, set_proxy,
                                setup_deposit_wallet, place_order_poly1271,
                                approve_token_for_onramp, wrap_usdce_to_pusd,
                                transfer_pusd, swap_native_usdc_for_usdce,
                                submit_wallet_batch, sign_wallet_batch,
                                ensure_deposit_balance, get_deposit_wallet_balance,
                                chain_id, _rpc,
                                COLLATERAL_ONRAMP, USDC_E, V2_COLLATERAL)
from core.trade_engine import (get_picks, get_results, get_tracked,
                                save_tracked, resolve_pick, reset_all)
from core.martingale   import (get_state, reset_state, calc_stake,
                                record_outcome, recovery_table, update_config)
from core.bot          import (get_config as get_bot_cfg, save_config as save_bot_cfg,
                                get_bot_state, run_cycle, reset_bot, run_bot_loop)
from core import position_manager, balance_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s"
)
log = logging.getLogger("server")
SERVER_START_TIME = time.time()

PORT     = 8090  # Internal port; Nginx proxies Render's PORT to this
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
    # Remove keys set to empty string (value cleared)
    env = {k: v for k, v in env.items() if v}
    with open(ENV_FILE, 'w') as f:
        f.writelines(f"{k}={v}\n" for k, v in env.items())
    for k, v in updates.items():
        if v:
            os.environ[k] = v
        else:
            os.environ.pop(k, None)

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

    def _inject_pharmacy_html(self):
        full = os.path.join(STATIC, "pharmacy.html")
        if not os.path.isfile(full):
            self.send_response(404); self.end_headers(); return
        body = open(full, "rb").read().decode("utf-8")
        script = '<script>window.QEMRX_API="/pharmacy-api";</script>\n'
        body = body.replace("</head>", script + "</head>", 1)
        raw = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

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

        elif path == "/api/polymarket/test-connection":
            import requests as req
            proxy = get_proxy()
            proxies = {"http": proxy, "https": proxy} if proxy else None
            results = {}
            for url in ["https://clob.polymarket.com/", "https://clob.polymarket.com/feature-flags",
                        "https://gamma-api.polymarket.com/events?limit=1"]:
                try:
                    r = req.get(url, proxies=proxies, timeout=10)
                    results[url] = {"status": r.status_code, "ok": r.ok}
                except Exception as e:
                    results[url] = {"error": str(e)[:100]}
            self._json({
                "ok": True,
                "proxy_configured": bool(proxy),
                "proxy_url": proxy,
                "results": results,
            })

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

        elif path == "/api/polymarket/balance-allowance":
            pk = get_pk()
            self._json(get_balance_allowance(pk) if pk else {"error": "No key"})

        elif path == "/api/polymarket/allowance-update":
            pk = get_pk()
            amount = qs.get("amount", [None])[0]
            self._json(update_balance_allowance(pk, amount) if pk else {"error": "No key"})

        elif path == "/api/polymarket/approve":
            pk = get_pk()
            amount = qs.get("amount", ["100"])[0]
            self._json(approve_usdc(pk, int(amount)) if pk else {"error": "No key"})

        elif path == "/api/polymarket/deposit-status":
            pk = get_pk()
            if not pk:
                self._json({"ok": False, "error": "No key"}); return
            dw = get_funder()
            if not dw:
                self._json({"ok": False, "error": "No deposit wallet."}); return
            import requests
            rpc = "https://polygon.gateway.tenderly.co"
            def bal(contract_addr):
                payload = {"jsonrpc":"2.0","method":"eth_call","params":[{"to":contract_addr,"data":f"0x70a08231000000000000000000000000{dw[2:].lower()}"},"latest"],"id":1}
                r = requests.post(rpc, json=payload, timeout=6)
                if "result" in r.json():
                    return int(r.json()["result"], 16) / 1e6
                return 0.0
            pusd_bal = bal(V2_COLLATERAL)
            matic = 0.0
            try:
                r = requests.post(rpc, json={"jsonrpc":"2.0","method":"eth_getBalance","params":[dw,"latest"],"id":1}, timeout=6)
                if "result" in r.json(): matic = int(r.json()["result"], 16) / 1e18
            except: pass
            eoa = None
            from eth_account import Account
            Account.enable_unaudited_hdwallet_features()
            try: eoa = Account.from_key(pk).address
            except: pass
            self._json({
                "ok": True,
                "deposit_wallet": dw,
                "pusd_balance": pusd_bal,
                "matic_balance": matic,
                "eoa_address": eoa,
            })

        elif path == "/api/env":
            env  = load_env()
            pk   = env.get("POLYMARKET_PRIVATE_KEY", "")
            bk   = env.get("POLYMARKET_BUILDER_KEY", "")
            self._json({
                "has_private_key":    bool(pk and len(pk) > 10),
                "private_key_preview": f"0x...{pk[-6:]}" if pk and len(pk) > 10 else "",
                "funder_address":     env.get("POLYMARKET_FUNDER_ADDRESS", ""),
                "has_builder_key":    bool(bk),
                "builder_key_preview": f"{bk[:8]}...{bk[-4:]}" if bk else "",
                "chain_id":           int(env.get("CHAIN_ID", "137")),
                "trading_enabled":    bool(pk and len(pk) > 10),
            })

        elif path == "/api/wallet/balance":
            pk = get_pk()
            if pk:
                self._json(get_wallet_address_and_balance(pk))
            else:
                self._json({"ok": True, "address": "", "usdc": 0.0, "usdc_e": 0.0, "total_usdc": 0.0})

        elif path == "/api/proxy":
            self._json({"ok": True, "proxy_url": get_proxy()})

        elif path == "/api/dashboard":
            pk = get_pk()
            dw = get_funder()
            pos_summary = position_manager.get_summary()
            bal_status = balance_manager.get_status()
            pusd_bal = 0.0
            matic_bal = 0.0
            if dw:
                pusd_bal = get_deposit_wallet_balance(dw) / 1e6
                import requests
                try:
                    r = requests.post("https://polygon.gateway.tenderly.co", json={"jsonrpc":"2.0","method":"eth_getBalance","params":[dw,"latest"],"id":1}, timeout=6)
                    if r.ok: matic_bal = int(r.json().get("result","0x0"), 16) / 1e18
                except: pass
            self._json({
                "ok": True,
                "positions": pos_summary,
                "balance": {"pusd": pusd_bal, "matic": matic_bal, "deposit_wallet": dw or "", "eoa": (pk[:42] if pk and pk.startswith("0x") and len(pk) >= 42 else "")},
                "wallet_balance": bal_status,
                "bot_state": get_bot_state(),
                "bot_config": get_bot_cfg(),
                "orders": get_open_orders(pk) if pk else [],
            })

        elif path == "/api/health":
            self._json({
                "status": "ok",
                "uptime": time.time() - SERVER_START_TIME,
                "cache_age_mins": round(get_cache_age_minutes(), 1),
                "market_count": len(get_cached()),
                "position_count": position_manager.get_summary().get("open_positions", 0),
                "has_keys": bool(get_pk()),
                "has_dw": bool(get_funder()),
            })

        elif path == "/api/positions":
            self._json({"positions": position_manager.get_positions(include_closed=True), "summary": position_manager.get_summary()})

        elif path == "/api/orders":
            self._json({"orders": position_manager.get_orders()})

        elif path in ("/pharmacy", "/pharmacy/"):
            self._inject_pharmacy_html()

        elif path in ("/bets", "/bets/"):
            self._static("/bets.html")

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
            if "use_tor" in body:
                updates["POLYMARKET_USE_TOR"] = "true" if body.get("use_tor") else ""
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
            if body.get("funder_address"):    updates["POLYMARKET_FUNDER_ADDRESS"] = body["funder_address"]
            if body.get("builder_key"):        updates["POLYMARKET_BUILDER_KEY"] = body["builder_key"]
            if body.get("builder_secret"):     updates["POLYMARKET_BUILDER_SECRET"] = body["builder_secret"]
            if body.get("builder_passphrase"): updates["POLYMARKET_BUILDER_PASSPHRASE"] = body["builder_passphrase"]
            if body.get("chain_id"):           updates["CHAIN_ID"] = str(body["chain_id"])
            if updates: save_env(updates)
            env = load_env(); pk = env.get("POLYMARKET_PRIVATE_KEY", "")
            bk = env.get("POLYMARKET_BUILDER_KEY", "")
            self._json({
                "ok":                 True,
                "has_private_key":    bool(pk and len(pk) > 10),
                "private_key_preview": f"0x...{pk[-6:]}" if pk and len(pk) > 10 else "",
                "funder_address":     env.get("POLYMARKET_FUNDER_ADDRESS", ""),
                "has_builder_key":    bool(bk),
                "builder_key_preview": f"{bk[:8]}...{bk[-4:]}" if bk else "",
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

        elif path == "/api/bot/enable":
            cfg = get_bot_cfg()
            cfg["bot_enabled"] = body.get("enabled", True)
            cfg["bot_mode"] = body.get("mode", cfg.get("bot_mode", "simulation"))
            cfg["order_type"] = body.get("order_type", cfg.get("order_type", "standard"))
            cfg["auto_fund"] = body.get("auto_fund", cfg.get("auto_fund", True))
            if "interval_seconds" in body: cfg["interval_seconds"] = int(body["interval_seconds"])
            if "min_pusd" in body: cfg["min_pusd"] = float(body["min_pusd"])
            save_bot_cfg(cfg)
            self._json({"ok": True, "config": cfg})

        elif path == "/api/bot/health":
            pk = get_pk()
            dw = get_funder()
            health = {"ok": True, "bot_enabled": get_bot_cfg().get("bot_enabled", False), "has_pk": bool(pk), "has_dw": bool(dw)}
            if pk and dw:
                bal = get_deposit_wallet_balance(dw) / 1e6
                health["pusd_balance"] = bal
                health["needs_funding"] = (bal * 1e6) < 1000000
            self._json(health)

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

        elif path == "/api/polymarket/order/poly1271":
            pk = body.get("private_key") or get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            dw = body.get("deposit_wallet") or get_funder()
            if not dw:
                self._json({"ok": False, "error": "No deposit wallet. Set funder_address."}); return
            self._json(place_order_poly1271(
                token_id=body.get("token_id", ""),
                side=body.get("side", "BUY"),
                price=float(body.get("price", 0.5)),
                size_usdc=float(body.get("size_usdc", body.get("size", 10))),
                private_key=pk,
                deposit_wallet=dw,
            ))

        elif path == "/api/polymarket/fund-deposit-wallet":
            pk = body.get("private_key") or get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            dw = body.get("deposit_wallet") or get_funder()
            if not dw:
                self._json({"ok": False, "error": "No deposit wallet. Set funder_address."}); return
            amount = float(body.get("amount", 1))
            self._json(setup_deposit_wallet(pk, dw, amount))

        elif path == "/api/polymarket/deposit/usdc-e":
            pk = body.get("private_key") or get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            dw = body.get("deposit_wallet") or get_funder()
            amount = float(body.get("amount", 1))
            from core.polymarket import approve_token_for_onramp, wrap_usdce_to_pusd, transfer_pusd
            try:
                tx1 = approve_token_for_onramp(pk, int(amount))
                tx2 = wrap_usdce_to_pusd(pk, int(amount))
                tx3 = transfer_pusd(pk, dw, int(amount)) if dw else None
                self._json({"ok": True, "approve_tx": tx1, "wrap_tx": tx2, "transfer_tx": tx3})
            except Exception as e:
                self._json({"ok": False, "error": str(e)})

        elif path == "/api/polymarket/deposit/matic":
            pk = body.get("private_key") or get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            amount = float(body.get("amount", 5))
            import requests, json
            from eth_account import Account
            Account.enable_unaudited_hdwallet_features()
            acct = Account.from_key(pk)
            addr = acct.address
            rpc = _rpc()
            # Get quote from Paraswap: MATIC → USDC
            u = "https://apiv5.paraswap.io"
            matic_addr = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
            usdc_n = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
            amt = int(amount * 10**18)
            price_r = requests.get(f"{u}/prices/", params={
                "srcToken": matic_addr, "destToken": usdc_n, "amount": str(amt),
                "srcDecimals": "18", "destDecimals": "6", "side": "SELL", "network": str(chain_id()),
            }, timeout=15)
            if not price_r.ok:
                self._json({"ok": False, "error": f"Paraswap price: {price_r.text[:200]}"}); return
            price_data = price_r.json()
            tx_r = requests.post(f"{u}/transactions/{chain_id()}", json={
                "srcToken": matic_addr, "destToken": usdc_n,
                "srcAmount": str(amt), "destAmount": price_data["priceRoute"]["destAmount"],
                "priceRoute": price_data["priceRoute"],
                "userAddress": addr, "receiver": addr,
            }, timeout=30)
            if not tx_r.ok:
                self._json({"ok": False, "error": f"Paraswap tx: {tx_r.text[:200]}"}); return
            tx_data = tx_r.json()
            from core.polymarket import _send_tx
            swap_value = int(tx_data.get("value", "0"), 16) if isinstance(tx_data.get("value"), str) else tx_data.get("value", 0)
            swap_hash = _send_tx(tx_data["to"], tx_data["data"], private_key, value=swap_value)
            self._json({"ok": True, "tx": swap_hash, "note": f"Swapped {amount} MATIC → USDC"})

        elif path == "/api/polymarket/withdraw/pusd":
            pk = body.get("private_key") or get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            amount = float(body.get("amount", 1))
            to = body.get("to", "")
            from core.polymarket import transfer_pusd
            tx = transfer_pusd(pk, to, int(amount))
            self._json({"ok": True, "tx": tx, "note": f"Transferred {amount} pUSD to {to}"})

        elif path == "/api/polymarket/withdraw/usdce":
            pk = body.get("private_key") or get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            amount = float(body.get("amount", 1))
            from core.polymarket import _send_tx, USDC_E, V2_COLLATERAL, COLLATERAL_ONRAMP
            # Unwrap pUSD → USDC.e via CollateralOnramp
            from eth_account import Account
            Account.enable_unaudited_hdwallet_features()
            acct = Account.from_key(pk)
            addr = acct.address
            asset_pad = USDC_E[2:].lower().zfill(64)
            to_pad = addr[2:].lower().zfill(64)
            amt_hex = hex(int(amount * 10**6))[2:].zfill(64)
            data = f"0xba793a8b{asset_pad}{to_pad}{amt_hex}"
            tx = _send_tx(COLLATERAL_ONRAMP, data, private_key)
            self._json({"ok": True, "tx": tx, "note": f"Unwrapped {amount} pUSD → USDC.e to {addr}"})

        elif path == "/api/polymarket/submit-wallet-batch":
            pk = body.get("private_key") or get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            dw = body.get("deposit_wallet") or get_funder()
            if not dw:
                self._json({"ok": False, "error": "No deposit wallet."}); return
            calls = body.get("calls", [])
            nonce = int(body.get("nonce", 0))
            deadline = int(body.get("deadline", int(time.time()) + 300))
            self._json(submit_wallet_batch(calls, dw, nonce, deadline, pk))

        elif path == "/api/polymarket/approve-token-onramp":
            pk = get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            amount = float(body.get("amount", 10))
            self._json({"ok": True, "tx": approve_token_for_onramp(pk, int(amount))})

        elif path == "/api/polymarket/wrap-pusd":
            pk = get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            amount = float(body.get("amount", 10))
            recipient = body.get("recipient", None)
            self._json({"ok": True, "tx": wrap_usdce_to_pusd(pk, int(amount), recipient)})

        elif path == "/api/polymarket/transfer-pusd":
            pk = get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key."}); return
            to = body.get("to", get_funder())
            amount = float(body.get("amount", 10))
            self._json({"ok": True, "tx": transfer_pusd(pk, to, int(amount))})

        elif path == "/api/polymarket/cancel":
            pk = get_pk()
            if not pk:
                self._json({"ok": False, "error": "No wallet key configured."}); return
            self._json(cancel_order(body.get("order_id", ""), pk))

        elif path == "/api/polymarket/refresh":
            markets = full_scan_and_cache(enrich=bool(body.get("enrich", True)))
            self._json({"ok": True, "count": len(markets)})

        elif path == "/api/proxy":
            proxy_url = body.get("proxy_url", "")
            relay_url = body.get("relay_url", "")
            use_tor = body.get("use_tor", "")
            set_proxy(proxy_url)
            updates = {"POLYMARKET_PROXY": proxy_url}
            if relay_url is not None: updates["POLYMARKET_RELAY"] = relay_url
            # Explicitly set or clear Tor env var
            updates["POLYMARKET_USE_TOR"] = "true" if use_tor else ""
            save_env(updates)
            self._json({"ok": True, "proxy_url": proxy_url, "relay_url": relay_url, "use_tor": use_tor})

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
            # Clear stale cache so fresh data is always fetched
            import os as _os
            from core.polymarket import CACHE as _CACHE
            if _os.path.exists(_CACHE):
                _os.remove(_CACHE)
                log.info("Cleared stale market cache")
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
