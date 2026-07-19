"""
core/polymarket.py — Polymarket Gamma + _clob() integration
NOTE: All APIs return 403 from cloud IPs. Run server.py locally (residential IP).
"""
import os,json,logging,time,requests,random
from datetime import datetime,timezone

log=logging.getLogger("polymarket")
GAMMA="https://gamma-api.polymarket.com"
DATA_BASE="https://data-api.polymarket.com"
CHAIN_ID=137

def _clob():
    relay = os.environ.get("POLYMARKET_RELAY","") or ""
    if relay:
        return relay
    mode = os.environ.get("INVESTPAL_MODE","")
    if mode == "testnet":
        return "https://clob-staging.polymarket.com"
    return "https://clob.polymarket.com"

def _rpc():
    mode = os.environ.get("INVESTPAL_MODE","")
    if mode == "testnet":
        return "https://polygon-mumbai.gateway.tenderly.co"
    return "https://polygon.gateway.tenderly.co"

def chain_id():
    mode = os.environ.get("INVESTPAL_MODE","")
    if mode == "testnet":
        return 80001
    return int(os.environ.get("CHAIN_ID", "137")) or 137
DATA_DIR=os.path.join(os.path.dirname(__file__),'..','data')
CACHE=os.path.join(DATA_DIR,'poly_cache.json')
PROXY_FILE=os.path.join(DATA_DIR,'proxy.json')
os.makedirs(DATA_DIR,exist_ok=True)

def get_proxy():
    env_proxy = os.environ.get("POLYMARKET_PROXY","") or ""
    if env_proxy: return env_proxy
    try:
        with open(PROXY_FILE) as f: return json.load(f).get("proxy_url","") or ""
    except: return ""

def set_proxy(url):
    os.makedirs(DATA_DIR,exist_ok=True)
    with open(PROXY_FILE,'w') as f: json.dump({"proxy_url":url},f)

def _proxied_session():
    s = requests.Session()
    proxy = get_proxy()
    if os.environ.get("POLYMARKET_USE_TOR",""):
        try:
            import socket
            sock = socket.socket()
            sock.settimeout(2)
            sock.connect(('127.0.0.1', 9050))
            sock.close()
            proxy = "socks5h://127.0.0.1:9050"
            log.info("Tor available, routing through SOCKS5 127.0.0.1:9050")
        except Exception as e:
            log.warning(f"Tor unavailable (127.0.0.1:9050): {e}. Falling back to direct/proxy.")
    if proxy:
        s.proxies = {"http": proxy, "https": proxy}
    return s

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0"
]

class SmartSession(requests.Session):
    def request(self, method, url, **kwargs):
        headers = kwargs.get("headers", {})
        headers.update({
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "application/json",
            "Referer": "https://polymarket.com/",
            "Origin": "https://polymarket.com"
        })
        kwargs["headers"] = headers
        
        retries = 3
        delay = 1.0
        r = None
        for attempt in range(retries):
            try:
                r = super().request(method, url, **kwargs)
                if r.status_code == 403:
                    log.warning(f"403 Forbidden on {method} {url} (Attempt {attempt+1}/{retries}). Rotating UA...")
                    time.sleep(delay)
                    delay *= 2
                    headers["User-Agent"] = random.choice(USER_AGENTS)
                    continue
                return r
            except Exception as e:
                if attempt == retries - 1:
                    raise e
                time.sleep(delay)
                delay *= 2
        return r

S = SmartSession()

# ── Sports tag slugs used by Polymarket ──
SPORT_TAGS = [
    "soccer","nba","nfl","tennis","cricket","golf","mma","boxing",
    "baseball","nhl","rugby","olympics","esports","horse-racing",
    "sports","basketball","formula-1","ufc","football"
]

# Hard exclusion keywords — discard anything that matches these
NON_SPORT_KW = [
    "election","president","senator","congress","supreme court","trump","biden","harris",
    "vote","referendum","primaries","chancellor","minister","parliament","political",
    "crypto","bitcoin","ethereum","stock","market cap","fed rate","interest rate",
    "gdp","inflation","recession","war","conflict","invasion","military",
    "award","oscar","grammy","emmy","nobel","academy award","box office",
    "celebrity","kardashian","taylor swift","covid","pandemic","vaccine"
]

SPORT_KW=[
    "match","win","champion","league","cup","goal","tennis","football","soccer",
    "nba","nfl","baseball","cricket","wimbledon","world cup","olympic","rugby",
    "boxing","ufc","mma","arsenal","chelsea","madrid","liverpool","barcelona",
    "manchester","lakers","celtics","warriors","nadal","djokovic","swiatek",
    "alcaraz","mbappe","haaland","ronaldo","messi","fight","race","tournament",
    "grand slam","golf","pga","f1","formula","verstappen","hamilton","nhl",
    "playoffs","championship","semifinal","final","knockout","bout","vs",
    "serie a","la liga","bundesliga","premier league","champions league",
    "super bowl","world series","stanley cup","masters","open tennis"
]

def _is_sports(t):
    import re
    words = set(re.findall(r'\b[a-z0-9\-]+\b', t.lower()))
    for k in NON_SPORT_KW:
        if " " in k:
            if k in t.lower(): return False
        elif k in words: return False
    for k in SPORT_KW:
        if " " in k:
            if k in t.lower(): return True
        elif k in words: return True
    return False

def fetch_by_tag(tag_slug, limit=50):
    """Fetch active markets by a specific Polymarket sports tag slug."""
    results = {}
    try:
        r = S.get(f"{GAMMA}/markets", params={
            "active":"true","closed":"false","limit":limit,
            "tag_slug":tag_slug,"order":"volume24hr","ascending":"false"
        }, timeout=15)
        if r.ok:
            d = r.json()
            for m in (d if isinstance(d,list) else d.get("markets",[])):
                mid = m.get("id","")
                # /markets endpoint has clobTokenIds — keep this version
                results[mid] = (m, "")
    except Exception as e:
        log.debug(f"fetch_by_tag markets {tag_slug}: {e}")
    try:
        r = S.get(f"{GAMMA}/events", params={
            "active":"true","closed":"false","limit":limit,
            "tag_slug":tag_slug,"order":"volume24hr","ascending":"false"
        }, timeout=15)
        if r.ok:
            d = r.json()
            for ev in (d if isinstance(d,list) else d.get("events",[])):
                title = ev.get("title",ev.get("name",""))
                for m in ev.get("markets",[]):
                    mid = m.get("id","")
                    # Only add if not already in results (/markets data preferred)
                    if mid not in results:
                        results[mid] = (m, title)
    except Exception as e:
        log.debug(f"fetch_by_tag events {tag_slug}: {e}")
    return list(results.values())

def fetch_events(limit=100):
    try:
        r=S.get(f"{GAMMA}/events",params={"active":"true","closed":"false","limit":limit,"order":"endDate","ascending":"true"},timeout=15)
        r.raise_for_status(); d=r.json()
        return d if isinstance(d,list) else d.get("events",[])
    except Exception as e: log.warning(f"fetch_events: {e}"); return []

def fetch_markets(limit=100):
    try:
        r=S.get(f"{GAMMA}/markets",params={"active":"true","closed":"false","limit":limit,"tag_slug":"sports","order":"endDate","ascending":"true"},timeout=15)
        r.raise_for_status(); d=r.json()
        return d if isinstance(d,list) else d.get("markets",[])
    except Exception as e: log.warning(f"fetch_markets: {e}"); return []

def fetch_clob_price(token_id):
    out={"buy":None,"sell":None,"mid":None}
    try:
        for side in("buy","sell"):
            r=S.get(f"{_clob()}/price",params={"token_id":token_id,"side":side},timeout=8)
            if r.ok: out[side]=float(r.json().get("price",0.5))
        if out["buy"] and out["sell"]: out["mid"]=round((out["buy"]+out["sell"])/2,4)
        elif out["buy"]: out["mid"]=out["buy"]
    except: pass
    return out

def fetch_orderbook(token_id):
    try:
        r=S.get(f"{_clob()}/book",params={"token_id":token_id},timeout=10)
        r.raise_for_status(); return r.json()
    except: return {}

def fetch_positions(addr):
    try:
        r=S.get(f"{DATA_BASE}/positions",params={"user":addr},timeout=10)
        r.raise_for_status(); d=r.json()
        return d if isinstance(d,list) else d.get("positions",[])
    except Exception as e: log.warning(f"fetch_positions: {e}"); return []

def _parse_end(end_date):
    if not end_date or len(end_date)<10: return "-","-"
    try:
        dt=datetime.fromisoformat(end_date.replace("Z","+00:00"))
        return dt.strftime("%H:%M"),dt.strftime("%a %d %b")
    except: return end_date[11:16] if len(end_date)>16 else "-",end_date[:10]

def _p2o(p):
    if p<=0.001: return 999.0
    if p>=0.999: return 1.001
    return round(1.0/p,2)

def _sport(txt):
    t=txt.lower()
    if any(k in t for k in ["tennis","wimbledon","atp","wta","grand slam","nadal","djokovic","swiatek","alcaraz"]): return "Tennis"
    if any(k in t for k in ["nba","basketball","lakers","celtics","warriors","heat","bulls","knicks"]): return "Basketball"
    if any(k in t for k in ["nfl","american football","superbowl","super bowl","touchdown","chiefs","eagles"]): return "NFL"
    if any(k in t for k in ["soccer","football","goal","premier league","la liga","bundesliga","world cup","champions league","arsenal","chelsea","madrid","liverpool","mbappe","haaland","messi","ronaldo","copa","serie a"]): return "Football"
    if any(k in t for k in ["cricket","ipl","test match","odi","t20"]): return "Cricket"
    if any(k in t for k in ["ufc","boxing","mma","fight","knockout","bout","fury","usyk"]): return "UFC/Boxing"
    if any(k in t for k in ["f1","formula 1","formula1","grand prix","verstappen","hamilton","racing","leclerc"]): return "Racing"
    if any(k in t for k in ["mlb","baseball","world series","yankees","dodgers"]): return "Baseball"
    if any(k in t for k in ["golf","pga","masters","open","ryder","lpga"]): return "Golf"
    if any(k in t for k in ["nhl","hockey","stanley"]): return "Hockey"
    if any(k in t for k in ["olympic","olympics"]): return "Olympics"
    if any(k in t for k in ["rugby","six nations","all blacks"]): return "Rugby"
    if any(k in t for k in ["esport","league of legends","dota","csgo","counter-strike","valorant"]): return "Esports"
    return "Sports"

def parse_market(raw,event_title="",force_sports=False,allow_closed=False):
    try:
        q=raw.get("question",""); desc=raw.get("description","")
        if not q: return None
        if not allow_closed and (not raw.get("active",True) or raw.get("closed",False)): return None
        combined=(q+" "+desc+" "+event_title)
        if not force_sports and not _is_sports(combined): return None
        outcomes=raw.get("outcomes",[])
        if isinstance(outcomes,str):
            try: outcomes=json.loads(outcomes)
            except: outcomes=["Yes","No"]
        if len(outcomes)<2: return None
        prices_raw=raw.get("outcomePrices",[])
        if isinstance(prices_raw,str):
            try: prices_raw=json.loads(prices_raw)
            except: prices_raw=["0.5","0.5"]
        prices=[]
        for p in prices_raw[:2]:
            try: prices.append(float(p))
            except: prices.append(0.5)
        while len(prices)<2: prices.append(0.5)
        yp=max(0.001,min(0.999,prices[0])); np=max(0.001,min(0.999,prices[1]))
        yo=_p2o(yp); no=_p2o(np)
        end=raw.get("endDate",raw.get("end_date",""))
        time_s,date_s=_parse_end(end)
        sport=_sport(q+" "+event_title)
        tids_raw=raw.get("clobTokenIds",raw.get("clob_token_ids",[]))
        if isinstance(tids_raw, str):
            try: tids=json.loads(tids_raw)
            except: tids=[]
        elif isinstance(tids_raw, list):
            tids=tids_raw
        else:
            tids=[]
        vol24=float(raw.get("volume24hr",0) or 0)
        liq=float(raw.get("liquidity",0) or 0)
        mid=str(raw.get("id",""))
        slug=raw.get("slug","")
        return {
            "id":f"poly_{mid}","source":"polymarket","market_id":mid,"slug":slug,
            "question":q,"event_title":event_title,"yes_price":round(yp,4),"no_price":round(np,4),
            "yes_odds":yo,"no_odds":no,"oA":yo,"oB":no,
            "lA":outcomes[0],"lB":outcomes[1] if len(outcomes)>1 else "No",
            "volume24h":vol24,"liquidity":liq,"end_date":end,"time":time_s,"date":date_s,
            "token_ids":tids if isinstance(tids,list) else [],
            "name":q[:90],"home":outcomes[0],"away":outcomes[1] if len(outcomes)>1 else "No",
            "sport":sport,"market":"Prediction Market","status":"upcoming","score":"",
            "note":f"Polymarket · {sport} · Vol ${vol24:,.0f}/24h",
            "why":f"YES {yp*100:.1f}% / NO {np*100:.1f}% implied",
            "balance":abs(yo-no),"odds1":yo,"odds2":no,"desc1":outcomes[0],"desc2":outcomes[1] if len(outcomes)>1 else "No",
            "url": f"https://polymarket.com/market/{slug}" if slug else "https://polymarket.com",
        }
    except Exception as e: log.debug(f"parse_market: {e}"); return None

def scan_all(limit=200):
    results=[]; seen=set()
    log.info("Scanning sports tags on Polymarket Gamma API...")
    # PRIMARY: fetch by each sport tag slug
    for tag in SPORT_TAGS:
        try:
            pairs = fetch_by_tag(tag, limit=20)
            for (m, title) in pairs:
                p = parse_market(m, title, force_sports=True)
                if p and p["id"] not in seen:
                    seen.add(p["id"]); results.append(p)
            if pairs:
                log.debug(f"Tag '{tag}': {len(pairs)} raw from tag scan")
            time.sleep(random.uniform(0.3, 0.8))
        except Exception as e:
            log.debug(f"Tag scan error {tag}: {e}")
    log.info(f"Tag scan done: {len(results)} sports markets from tags")
    # SECONDARY: fetch all sports markets via generic endpoint (higher limit)
    try:
        r = S.get(f"{GAMMA}/markets", params={
            "active":"true","closed":"false","limit":300,
            "tag_slug":"sports","order":"volume24hr","ascending":"false"
        }, timeout=20)
        if r.ok:
            raw = r.json()
            all_mkts = raw if isinstance(raw,list) else raw.get("markets",[])
            for m in all_mkts:
                p = parse_market(m, "", force_sports=True)
                if p and p["id"] not in seen:
                    seen.add(p["id"]); results.append(p)
            log.info(f"Generic sports scan: {len(all_mkts)} raw, {len(results)} total")
    except Exception as e:
        log.warning(f"Generic sports scan: {e}")
    # TERTIARY: fetch events for additional coverage
    try:
        for ev in fetch_events(100):
            title=ev.get("title",ev.get("name",""))
            for m in ev.get("markets",[]):
                p=parse_market(m,title)
                if p and p["id"] not in seen: seen.add(p["id"]); results.append(p)
    except Exception as e:
        log.debug(f"Events fallback: {e}")
    # Sort by volume (highest first), then by end_date
    results.sort(key=lambda m: (-m.get("volume24h",0), m.get("end_date","9999")))
    log.info(f"Total sports markets: {len(results)}")
    return results





def enrich_with_live_prices(markets,max_enrich=20):
    done=0
    for m in markets:
        if done>=max_enrich: break
        tids=m.get("token_ids",[])
        if not tids: continue
        px=fetch_clob_price(tids[0])
        if px.get("mid"):
            yp=px["mid"]; np=round(1-yp,4)
            m.update({"yes_price":yp,"no_price":np,"oA":_p2o(yp),"oB":_p2o(np),"live_price":True})
        done+=1; time.sleep(0.15)
    return markets

def full_scan_and_cache(enrich=True):
    log.info("Polymarket full scan…")
    markets=scan_all(200)
    if enrich and markets: markets=enrich_with_live_prices(markets,20)
    _write_cache(markets)
    log.info(f"Scan done: {len(markets)} markets")
    return markets

def _write_cache(markets):
    try:
        with open(CACHE,'w') as f:
            json.dump({"updated":datetime.now(timezone.utc).isoformat(),"count":len(markets),"markets":markets},f,indent=2)
    except Exception as e: log.error(f"Cache write: {e}")

def get_cached():
    try:
        with open(CACHE) as f: return json.load(f).get("markets",[])
    except: return []

def get_cache_age_minutes():
    try:
        with open(CACHE) as f: d=json.load(f)
        updated=d.get("updated","")
        if not updated: return 999
        dt=datetime.fromisoformat(updated.replace("Z","+00:00"))
        return (datetime.now(timezone.utc)-dt).total_seconds()/60
    except: return 999

def run_poly_loop(stop_event,interval=90):
    while not stop_event.is_set():
        try:
            if get_cache_age_minutes()>1.5: full_scan_and_cache(enrich=True)
            else: log.debug("Cache fresh, skipping scan")
        except Exception as e: log.error(f"Poly loop: {e}")
        stop_event.wait(interval)

# ── TRADING (_clob() V2) ──
EXCHANGE_ADDR = "0xE111180000d2663C0091e4f400237545B87B996B"
NEG_RISK_ADDR = "0xe2222d279d744050d28e00520010520000310F59"
V2_COLLATERAL = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB"

# Deposit wallet / funding contract addresses
USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
COLLATERAL_ONRAMP = "0x93070a847efEf7F70739046A929D47a521F5B8ee"
DEPOSIT_WALLET_FACTORY = "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07"
QUICKSWAP_ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"

def _l1_sign(maker, private_key, ts, nonce):
    """EIP-712 typed data signing for _clob() V2 L1 auth."""
    from eth_account import Account
    from eth_account.messages import encode_typed_data
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    signable = encode_typed_data(
        domain_data={"name": "ClobAuthDomain", "version": "1", "chainId": chain_id()},
        message_types={
            "ClobAuth": [
                {"name": "address", "type": "address"},
                {"name": "timestamp", "type": "string"},
                {"name": "nonce", "type": "uint256"},
                {"name": "message", "type": "string"},
            ],
        },
        message_data={
            "address": maker,
            "timestamp": str(ts),
            "nonce": nonce,
            "message": "This message attests that I control the given wallet",
        },
    )
    signed = Account.sign_message(signable, private_key)
    return signed.signature.hex()

def _l2_sign(method, path, body, timestamp, secret):
    """HMAC-SHA256 for _clob() V2 L2 auth — base64 secret+output as py-clob-client."""
    import hmac, hashlib, base64
    secret_bytes = base64.urlsafe_b64decode(secret)
    msg = f"{timestamp}{method}{path}{body}".replace("'", '"')
    h = hmac.new(secret_bytes, msg.encode("utf-8"), hashlib.sha256)
    return base64.urlsafe_b64encode(h.digest()).decode("utf-8")

def _get_api_creds(private_key):
    """Obtain or derive _clob() V2 API credentials (L1 auth). Returns {apiKey, secret, passphrase, owner}."""
    import time, requests
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    maker = acct.address
    ts = int(time.time())
    nonce = ts
    sig = _l1_sign(maker, private_key, ts, nonce)
    headers = {
        "POLY_ADDRESS": maker,
        "POLY_SIGNATURE": f"0x{sig}",
        "POLY_TIMESTAMP": str(ts),
        "POLY_NONCE": str(nonce),
    }
    clob_host = _clob().rstrip("/")
    sess = _proxied_session()
    create = sess.post(f"{clob_host}/auth/api-key", json={"nonce": str(nonce)}, headers=headers, timeout=15)
    if create.ok:
        creds = create.json()
        log.info(f"POST /auth/api-key ok: keys={list(creds.keys())}")
    else:
        log.info(f"POST /auth/api-key failed ({create.status_code}), trying derive...")
        derive = sess.get(f"{clob_host}/auth/derive-api-key", params={"nonce": str(nonce)}, headers=headers, timeout=15)
        if not derive.ok:
            raise Exception(f"L1 auth failed: create={create.status_code} derive={derive.status_code}")
        creds = derive.json()
        log.info(f"GET /auth/derive-api-key ok: keys={list(creds.keys())}")
    api_key = creds.get("apiKey", creds.get("api_key", ""))
    api_secret = creds.get("secret", creds.get("api_secret", ""))
    api_passphrase = creds.get("passphrase", creds.get("api_passphrase", ""))
    api_owner = creds.get("owner", api_key)
    log.info(f"API creds: key={api_key[:12]}... owner={api_owner}")
    return {"apiKey": api_key, "secret": api_secret, "passphrase": api_passphrase, "owner": api_owner, "address": maker}

def _v2_l2_headers(method, path, body, creds, ts):
    """Build L2 headers for a V2 _clob() API request."""
    sig = _l2_sign(method, path, body, ts, creds["secret"])
    return {
        "POLY_ADDRESS": creds["address"],
        "POLY_SIGNATURE": sig,
        "POLY_TIMESTAMP": str(ts),
        "POLY_API_KEY": creds["apiKey"],
        "POLY_PASSPHRASE": creds["passphrase"],
        "Content-Type": "application/json",
    }

def place_order(token_id, side, price, size_usdc, private_key, funder=None):
    if not private_key: return {"ok":False,"error":"No private key. Configure in Settings tab."}
    log.info(f"place_order: token={token_id} side={side} price={price} size={size_usdc}")
    try:
        import time, json, requests
        from eth_account import Account
        Account.enable_unaudited_hdwallet_features()
        acct = Account.from_key(private_key)
        maker = acct.address
        clob_host = _clob().rstrip("/")
        # L1 auth → get API creds
        creds = _get_api_creds(private_key)
        log.info(f"API creds obtained: key={creds['apiKey'][:8]}...")
        # Check neg_risk
        sess = _proxied_session()
        neg_resp = sess.get(f"{clob_host}/neg-risk?token_id={token_id}", timeout=15)
        neg_risk = neg_resp.json().get("neg_risk", False) if neg_resp.ok else False
        log.info(f"neg_risk={neg_risk}")
        # Build and sign V2 order
        order_data = _build_order_v2(token_id, side, price, size_usdc, private_key, neg_risk)
        order_data["owner"] = creds["apiKey"]
        now_ts = int(time.time())
        body_str = json.dumps(order_data, separators=(",", ":"), ensure_ascii=False)
        l2_headers = _v2_l2_headers("POST", "/order", body_str, creds, now_ts)
        log.info(f"Posting V2 order to {clob_host}/order")
        order_resp = sess.post(f"{clob_host}/order", data=body_str, headers=l2_headers, timeout=30)
        log.info(f"Order response: status={order_resp.status_code}")
        if order_resp.ok:
            data = order_resp.json()
            return {"ok": True, "order_id": data.get("orderID",""), "response": data}
        return {"ok": False, "error": f"_clob() V2 order: {order_resp.status_code} {order_resp.text[:300]}"}
    except Exception as e:
        import traceback
        log.error(f"place_order: {e}\n{traceback.format_exc()}")
        return {"ok":False,"error":str(e)}

def _build_order_v2(token_id, side, price, size_usdc, private_key, neg_risk=False):
    """Build and EIP-712 sign a _clob() V2 order. Returns the full order envelope dict."""
    import time, json
    from eth_account import Account
    from eth_account.messages import encode_typed_data
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    maker = acct.address
    ts_ms = int(time.time() * 1000)
    usdc_decimals = 10**6
    is_buy = side.upper() == "BUY"
    if is_buy:
        maker_amount = int(size_usdc * usdc_decimals)
        taker_amount = int(size_usdc * usdc_decimals / price) if price > 0 else maker_amount
    else:
        maker_amount = int(size_usdc * usdc_decimals / price) if price > 0 else int(size_usdc * usdc_decimals)
        taker_amount = int(size_usdc * usdc_decimals)
    salt = ts_ms % (2**32)
    order_side = 0 if is_buy else 1
    verifying_contract = NEG_RISK_ADDR if neg_risk else EXCHANGE_ADDR
    signable = encode_typed_data(
        domain_data={
            "name": "Polymarket CTF Exchange",
            "version": "2",
            "chainId": chain_id(),
            "verifyingContract": verifying_contract,
        },
        message_types={
            "Order": [
                {"name": "salt", "type": "uint256"},
                {"name": "maker", "type": "address"},
                {"name": "signer", "type": "address"},
                {"name": "tokenId", "type": "uint256"},
                {"name": "makerAmount", "type": "uint256"},
                {"name": "takerAmount", "type": "uint256"},
                {"name": "side", "type": "uint8"},
                {"name": "timestamp", "type": "uint256"},
                {"name": "metadata", "type": "bytes32"},
                {"name": "builder", "type": "bytes32"},
                {"name": "signatureType", "type": "uint8"},
            ],
        },
        message_data={
            "salt": salt,
            "maker": maker,
            "signer": maker,
            "tokenId": token_id,
            "makerAmount": str(maker_amount),
            "takerAmount": str(taker_amount),
            "side": order_side,
            "timestamp": str(ts_ms),
            "metadata": "0x" + "0"*64,
            "builder": "0x" + "0"*64,
            "signatureType": 0,
        },
    )
    signed = Account.sign_message(signable, private_key)
    signature = signed.signature.hex()
    return {
        "order": {
            "salt": salt,
            "maker": maker,
            "signer": maker,
            "tokenId": token_id,
            "makerAmount": str(maker_amount),
            "takerAmount": str(taker_amount),
            "side": "BUY" if order_side else "SELL",
            "expiration": "0",
            "timestamp": str(ts_ms),
            "metadata": "0x" + "0"*64,
            "builder": "0x" + "0"*64,
            "signature": f"0x{signature}",
            "signatureType": 0,
        },
        "owner": maker,
        "orderType": "GTC",
        "deferExec": False,
        "postOnly": False,
    }

def cancel_order(order_id, private_key):
    try:
        import time, json
        creds = _get_api_creds(private_key)
        clob_host = _clob().rstrip("/")
        sess = _proxied_session()
        now_ts = int(time.time())
        body_str = json.dumps({"orderID": order_id}, separators=(",", ":"), ensure_ascii=False)
        l2_headers = _v2_l2_headers("DELETE", "/order", body_str, creds, now_ts)
        resp = sess.delete(f"{clob_host}/order", data=body_str, headers=l2_headers, timeout=15)
        return {"ok": resp.ok, "status": resp.status_code, "response": resp.json() if resp.ok else resp.text[:200]}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def get_balance_allowance(private_key):
    try:
        import time, urllib.parse
        creds = _get_api_creds(private_key)
        clob_host = _clob().rstrip("/")
        sess = _proxied_session()
        now_ts = int(time.time())
        l2_headers = _v2_l2_headers("GET", "/balance-allowance", "", creds, now_ts)
        resp = sess.get(f"{clob_host}/balance-allowance", headers=l2_headers, timeout=15)
        return {"ok": resp.ok, "status": resp.status_code, "data": resp.json() if resp.ok else resp.text[:300]}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def update_balance_allowance(private_key, amount=None):
    try:
        import time, urllib.parse
        creds = _get_api_creds(private_key)
        clob_host = _clob().rstrip("/")
        sess = _proxied_session()
        now_ts = int(time.time())
        params = {"signature_type": "0"}
        if amount: params["amount"] = str(amount)
        param_str = "?" + urllib.parse.urlencode(params)
        # HMAC path excludes query string (matches py-clob-client behavior)
        l2_headers = _v2_l2_headers("GET", "/balance-allowance/update", "", creds, now_ts)
        resp = sess.get(f"{clob_host}/balance-allowance/update{param_str}", headers=l2_headers, timeout=15)
        data = resp.text[:500] if resp.text.strip() else "(empty)"
        return {"ok": resp.ok, "status": resp.status_code, "data": data}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def approve_usdc(private_key, amount=100):
    """Approve USDC for the V2 exchange contract (on-chain tx via RPC)."""
    try:
        import requests as req
        from eth_account import Account
        Account.enable_unaudited_hdwallet_features()
        acct = Account.from_key(private_key)
        addr = acct.address
        # Use proxied session for RPC calls too (Tor doesn't affect RPC)
        rpc = _rpc()
        usdc = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
        exchange = EXCHANGE_ADDR
        amt_hex = hex(amount * 10**6)[2:].zfill(64)
        spender_pad = exchange[2:].lower().zfill(64)
        data = f"0x095ea7b3{spender_pad}{amt_hex}"
        nonce_r = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_getTransactionCount","params":[addr,"latest"],"id":1}, timeout=30).json()
        if "error" in nonce_r: return {"ok": False, "error": f"RPC nonce: {nonce_r['error']}"}
        nonce = int(nonce_r["result"], 16)
        gas_r = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":1}, timeout=30).json()
        if "error" in gas_r: return {"ok": False, "error": f"RPC gas: {gas_r['error']}"}
        gas_price = int(gas_r["result"], 16)
        tx = {"from":addr,"to":usdc,"data":data,"nonce":nonce,"gasPrice":gas_price,"chainId":137}
        gas_est = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_estimateGas","params":[tx],"id":1}, timeout=30).json()
        tx["gas"] = gas_est.get("result", 100000)
        signed = acct.sign_transaction(tx)
        raw_tx = getattr(signed, 'raw_transaction', None) or getattr(signed, 'rawTransaction', None)
        if not raw_tx:
            return {"ok": False, "error": f"Unknown signature attr: {[a for a in dir(signed) if not a.startswith('_')]}"}
        if isinstance(raw_tx, bytes): raw_hex = raw_tx.hex()
        else: raw_hex = str(raw_tx)
        if not raw_hex or raw_hex == "0x":
            return {"ok": False, "error": f"Empty raw tx. attr={type(raw_tx)} value={str(raw_tx)[:100]}"}
        if not raw_hex.startswith("0x"): raw_hex = "0x" + raw_hex
        send_r = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":[raw_hex],"id":1}, timeout=60).json()
        if "error" in send_r: return {"ok": False, "error": f"RPC send: {send_r['error']}"}
        tx_hash = send_r.get("result", "")
        return {"ok": bool(tx_hash), "tx": tx_hash, "note": f"Approved {amount} USDC for exchange"}
    except Exception as e:
        import traceback; return {"ok": False, "error": str(e), "trace": traceback.format_exc()[:200]}

# ── Builder / Relayer Helpers ──

def _get_builder_creds():
    key = os.environ.get("POLYMARKET_BUILDER_KEY", "") or ""
    secret = os.environ.get("POLYMARKET_BUILDER_SECRET", "") or ""
    passphrase = os.environ.get("POLYMARKET_BUILDER_PASSPHRASE", "") or ""
    return key, secret, passphrase

def _builder_headers(method, path, body=""):
    """Build headers for builder relayer API (POLY_BUILDER_*) matching py-builder-signing-sdk."""
    import hmac, hashlib, base64
    key, secret, passphrase = _get_builder_creds()
    if not key:
        raise Exception("Builder API key not configured (POLYMARKET_BUILDER_KEY)")
    ts = str(int(time.time()))  # SECONDS
    secret_bytes = base64.urlsafe_b64decode(secret)
    message = ts + method + path
    if body:
        message += str(body).replace("'", '"')
    h = hmac.new(secret_bytes, message.encode("utf-8"), hashlib.sha256)
    sig = base64.urlsafe_b64encode(h.digest()).decode("utf-8")
    return {
        "Content-Type": "application/json",
        "POLY_BUILDER_API_KEY": key,
        "POLY_BUILDER_TIMESTAMP": ts,
        "POLY_BUILDER_PASSPHRASE": passphrase,
        "POLY_BUILDER_SIGNATURE": sig,
    }

def _compute_domain_separator(domain):
    from eth_hash.auto import keccak as _keccak
    domain_typehash = _keccak(b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    return _keccak(
        domain_typehash +
        _keccak(domain["name"].encode()) +
        _keccak(domain["version"].encode()) +
        domain["chainId"].to_bytes(32, 'big') +
        bytes.fromhex(domain["verifyingContract"][2:].zfill(64))
    )

# ── WALLET Batch (Relayer) ──

def _get_wallet_nonce(deposit_wallet=None):
    """Fetch WALLET nonce from relayer."""
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    pk = os.getenv("POLYMARKET_PRIVATE_KEY", "")
    if not pk:
        raise Exception("No private key for nonce lookup")
    acct = Account.from_key(pk)
    addr = acct.address
    dw = deposit_wallet or os.getenv("POLYMARKET_FUNDER_ADDRESS", "")
    if not dw:
        raise Exception("No deposit wallet address for nonce lookup")
    relayer_host = "https://relayer-v2.polymarket.com"
    sess = _proxied_session()
    headers = _builder_headers("GET", f"/nonce?address={addr.lower()}&type=WALLET", "")
    r = sess.get(f"{relayer_host}/nonce", params={"address": addr.lower(), "type": "WALLET"}, headers=headers, timeout=15)
    if r.ok:
        data = r.json()
        return int(data.get("nonce", 0)) if isinstance(data, dict) else int(data)
    raise Exception(f"Nonce fetch failed: {r.status_code} {r.text[:200]}")

def sign_wallet_batch(calls, deposit_wallet, nonce, deadline, private_key):
    """EIP-712 sign a DepositWallet WALLET batch. Returns 0x-prefixed signature."""
    from eth_account import Account, messages
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    signable = messages.encode_typed_data(
        domain_data={
            "name": "DepositWallet",
            "version": "1",
            "chainId": chain_id(),
            "verifyingContract": deposit_wallet,
        },
        message_types={
            "Call": [
                {"name": "target", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "data", "type": "bytes"},
            ],
            "Batch": [
                {"name": "wallet", "type": "address"},
                {"name": "nonce", "type": "uint256"},
                {"name": "deadline", "type": "uint256"},
                {"name": "calls", "type": "Call[]"},
            ],
        },
        message_data={
            "wallet": deposit_wallet,
            "nonce": nonce,
            "deadline": deadline,
            "calls": [{"target": c["target"], "value": int(c["value"]), "data": c["data"]} for c in calls],
        },
    )
    signed = acct.sign_message(signable)
    return "0x" + signed.signature.hex()

def submit_wallet_batch(calls, deposit_wallet, nonce, deadline, private_key):
    """Sign a WALLET batch and submit to relayer."""
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    sig = sign_wallet_batch(calls, deposit_wallet, nonce, deadline, private_key)
    relayer_host = "https://relayer-v2.polymarket.com"
    sess = _proxied_session()
    body = {
        "type": "WALLET",
        "from": acct.address,
        "to": DEPOSIT_WALLET_FACTORY,
        "nonce": str(nonce),
        "signature": sig,
        "depositWalletParams": {
            "depositWallet": deposit_wallet,
            "deadline": str(deadline),
            "calls": [{"target": c["target"], "value": c["value"], "data": c["data"]} for c in calls],
        },
    }
    headers = _builder_headers("POST", "/submit", str(body))
    r = sess.post(f"{relayer_host}/submit", json=body, headers=headers, timeout=30)
    if r.ok:
        data = r.json()
        tx_id = data.get("transactionId", data.get("id", ""))
        log.info(f"WALLET batch submitted: tx_id={tx_id}")
        return {"ok": True, "transactionId": tx_id, "data": data}
    return {"ok": False, "error": f"Submit failed: {r.status_code} {r.text[:300]}"}

# ── On-chain funding helpers (EOA → USDC → pUSD → deposit wallet) ──

def _send_tx(to, data, private_key, value=0, gas_limit=None):
    """Send an on-chain tx via RPC. Returns tx hash."""
    import requests as req
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    addr = acct.address
    rpc = _rpc()
    # Use pending to avoid nonce collisions when sending multiple txs rapidly
    nonce_r = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_getTransactionCount","params":[addr,"pending"],"id":1}, timeout=30).json()
    nonce = int(nonce_r["result"], 16) if "result" in nonce_r else 0
    gas_r = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":1}, timeout=30).json()
    gas_price = int(gas_r.get("result", "0x59682f00"), 16)
    tx = {"from": addr, "to": to, "data": data, "nonce": nonce, "gasPrice": gas_price, "chainId": chain_id()}
    if value: tx["value"] = hex(value)
    if gas_limit:
        tx["gas"] = gas_limit
    else:
        est = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_estimateGas","params":[tx],"id":1}, timeout=30).json()
        tx["gas"] = int(est.get("result", "0x493e0"), 16) if "result" in est else 150000
    signed = acct.sign_transaction(tx)
    raw = getattr(signed, 'raw_transaction', None) or getattr(signed, 'rawTransaction', None)
    if isinstance(raw, bytes): raw_hex = raw.hex()
    else: raw_hex = str(raw)
    if not raw_hex.startswith("0x"): raw_hex = "0x" + raw_hex
    send = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":[raw_hex],"id":1}, timeout=60).json()
    if "error" in send:
        raise Exception(f"RPC send: {send['error']}")
    tx_hash = send.get("result", "")
    log.info(f"Tx sent: {tx_hash[:66]}")
    return tx_hash

def _erc20_approve_calldata(spender, amount=10**6):
    """Encode ERC-20 approve() calldata."""
    spender_pad = spender[2:].lower().zfill(64)
    amt_hex = hex(amount)[2:].zfill(64)
    return f"0x095ea7b3{spender_pad}{amt_hex}"

def approve_token_for_onramp(private_key, amount_usdc=10):
    """Approve USDC.e for the CollateralOnramp so it can wrap to pUSD."""
    return _send_tx(
        USDC_E,
        _erc20_approve_calldata(COLLATERAL_ONRAMP, int(amount_usdc * 10**6)),
        private_key,
    )

def wrap_usdce_to_pusd(private_key, amount_usdc=10, recipient=None):
    """Wrap USDC.e → pUSD via CollateralOnramp. Sends pUSD to recipient (or EOA)."""
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    to = recipient or acct.address
    asset_pad = USDC_E[2:].lower().zfill(64)
    to_pad = to[2:].lower().zfill(64)
    amt_hex = hex(int(amount_usdc * 10**6))[2:].zfill(64)
    data = f"0x62355638{asset_pad}{to_pad}{amt_hex}"
    return _send_tx(COLLATERAL_ONRAMP, data, private_key)

def transfer_pusd(private_key, to, amount_usdc=10):
    """Transfer pUSD from EOA to another address (e.g. deposit wallet)."""
    to_pad = to[2:].lower().zfill(64)
    amt_hex = hex(int(amount_usdc * 10**6))[2:].zfill(64)
    data = f"0xa9059cbb{to_pad}{amt_hex}"
    return _send_tx(V2_COLLATERAL, data, private_key)

def swap_native_usdc_for_usdce(private_key, amount_usdc=1):
    """Swap native USDC → USDC.e via Paraswap DEX aggregator."""
    import requests as req, time
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    addr = acct.address
    amt = int(int(amount_usdc) * 10**6)

    usdc_n = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
    usdc_e = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
    rpc = _rpc()
    tt_proxy = "0x216b4b4ba9f3e719726886d34a177484278bfcae"

    log.info("  Getting Paraswap price quote...")
    price_r = req.get("https://apiv5.paraswap.io/prices/", params={
        "srcToken": usdc_n, "destToken": usdc_e, "amount": str(amt),
        "srcDecimals": "6", "destDecimals": "6", "side": "SELL", "network": str(chain_id()),
    }, timeout=15)
    if not price_r.ok:
        raise Exception(f"Paraswap price failed: {price_r.status_code} {price_r.text[:200]}")
    price_data = price_r.json()

    # Approve TokenTransferProxy if needed
    allow_sel = "0xdd62ed3e" + addr[2:].lower().zfill(64) + tt_proxy[2:].lower().zfill(64)
    allow_r = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_call","params":[{"to": usdc_n, "data": allow_sel}, "latest"],"id":1}, timeout=10)
    current_allow = int(allow_r.json().get("result", "0x0"), 16) if allow_r.ok else 0
    if current_allow < amt:
        log.info("  Approving TokenTransferProxy via Paraswap...")
        approve_hash = _send_tx(usdc_n, _erc20_approve_calldata(tt_proxy, amt), private_key)
        for _ in range(60):
            time.sleep(1)
            rc = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":[approve_hash],"id":1}, timeout=10).json()
            if rc.get("result"):
                log.info(f"  Approve confirmed")
                break
        time.sleep(3)

    log.info("  Building Paraswap transaction...")
    tx_r = req.post(f"https://apiv5.paraswap.io/transactions/{chain_id()}", json={
        "srcToken": usdc_n, "destToken": usdc_e,
        "srcAmount": str(amt), "destAmount": price_data["priceRoute"]["destAmount"],
        "priceRoute": price_data["priceRoute"],
        "userAddress": addr, "receiver": addr,
    }, timeout=30)
    if not tx_r.ok:
        raise Exception(f"Paraswap tx build failed: {tx_r.status_code} {tx_r.text[:300]}")
    tx_data = tx_r.json()

    # Send the swap via _send_tx
    swap_value = int(tx_data.get("value", "0"), 16) if isinstance(tx_data.get("value"), str) else tx_data.get("value", 0)
    swap_hash = _send_tx(tx_data["to"], tx_data["data"], private_key, value=swap_value)
    log.info(f"  Paraswap tx: {swap_hash[:66]}")
    return swap_hash

def ensure_deposit_balance(private_key, deposit_wallet, min_balance=1000000, target_balance=1500000):
    """Check deposit wallet pUSD balance. If below min, auto-fund by swapping/wrapping/transferring.
    Returns dict with {funded, balance_before, balance_after, tx_log}.
    """
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    tx_log = []
    bal = get_deposit_wallet_balance(deposit_wallet)
    if bal >= min_balance:
        return {"funded": False, "balance": bal, "tx_log": tx_log, "ok": True}
    shortfall = target_balance - bal
    amount_needed = max(1.0, shortfall / 10**6 + 0.1)
    log.info(f"Deposit wallet low: {bal/10**6:.4f} pUSD. Funding ~${amount_needed:.2f}...")
    try:
        acct = Account.from_key(private_key)
        eoa = acct.address
        # Check how much native USDC the EOA has
        import requests as req
        rpc = _rpc()
        usdc_sel = "0x70a08231" + eoa[2:].lower().zfill(64)
        usdc_r = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_call","params":[{"to": USDC_NATIVE, "data": usdc_sel}, "latest"],"id":1}, timeout=10)
        usdc_bal = int(usdc_r.json().get("result","0x0"), 16) if usdc_r.ok else 0
        if usdc_bal < int(amount_needed * 10**6):
            log.warning(f"EOA only has {usdc_bal/10**6:.2f} native USDC, need {amount_needed:.2f}")
            return {"funded": False, "balance": bal, "tx_log": tx_log, "ok": False,
                    "error": f"EOA USDC balance {usdc_bal/10**6:.2f} < needed {amount_needed:.2f}"}
        tx_log.append("swap: native USDC → USDC.e via Paraswap")
        swap_hash = swap_native_usdc_for_usdce(private_key, amount_needed)
        tx_log.append(f"  tx: {swap_hash[:66]}")
        time.sleep(5)
        tx_log.append("approve: USDC.e for CollateralOnramp")
        approve_hash = approve_token_for_onramp(private_key, int(amount_needed))
        tx_log.append(f"  tx: {approve_hash[:66]}")
        time.sleep(3)
        tx_log.append("wrap: USDC.e → pUSD")
        wrap_hash = wrap_usdce_to_pusd(private_key, int(amount_needed), eoa)
        tx_log.append(f"  tx: {wrap_hash[:66]}")
        time.sleep(3)
        tx_log.append(f"transfer: pUSD → {deposit_wallet}")
        transfer_hash = transfer_pusd(private_key, deposit_wallet, int(amount_needed))
        tx_log.append(f"  tx: {transfer_hash[:66]}")
        time.sleep(5)
        bal_after = get_deposit_wallet_balance(deposit_wallet)
        tx_log.append(f"balance after: {bal_after/10**6:.4f} pUSD")
        return {"funded": True, "balance_before": bal, "balance_after": bal_after, "tx_log": tx_log, "ok": True}
    except Exception as e:
        log.error(f"ensure_deposit_balance: {e}")
        return {"funded": False, "balance": bal, "tx_log": tx_log, "ok": False, "error": str(e)}

# ── Deposit wallet approval batch (approve pUSD + CTF for exchange) ──

def _encode_pusd_approve(spender):
    """Encode pUSD.approve(spender, maxUint256) calldata."""
    spender_pad = spender[2:].lower().zfill(64)
    max_uint = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    return f"0x095ea7b3{spender_pad}{max_uint}"

def _encode_ctf_set_approval(spender, approved=True):
    """Encode CTF.setApprovalForAll(spender, approved) calldata."""
    spender_pad = spender[2:].lower().zfill(64)
    approved_hex = "0000000000000000000000000000000000000000000000000000000000000001" if approved else "0000000000000000000000000000000000000000000000000000000000000000"
    return f"0xa22cb465{spender_pad}{approved_hex}"

def build_approval_calls(deposit_wallet=None):
    return [
        {"target": V2_COLLATERAL, "value": "0", "data": _encode_pusd_approve(EXCHANGE_ADDR)},
        {"target": V2_COLLATERAL, "value": "0", "data": _encode_pusd_approve(NEG_RISK_ADDR)},
    ]

def setup_deposit_wallet(private_key, deposit_wallet, amount_usdc=1):
    """Full setup: swap USDC → USDC.e → wrap → transfer → WALLET batch approve."""
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    results = {}
    try:
        # 1. Swap native USDC → USDC.e
        log.info(f"Step 1: Swap {amount_usdc} native USDC → USDC.e")
        results["swap"] = swap_native_usdc_for_usdce(private_key, amount_usdc)
        log.info(f"  swap tx: {results['swap'][:66]}")
    except Exception as e:
        log.warning(f"Swap failed (might already have USDC.e): {e}")
        results["swap"] = None
    try:
        # 2. Approve USDC.e for onramp
        log.info("Step 2: Approve USDC.e for CollateralOnramp")
        results["approve_onramp"] = approve_token_for_onramp(private_key, amount_usdc)
    except Exception as e:
        return {"ok": False, "error": f"Approve onramp: {e}", "results": results}
    try:
        # 3. Wrap USDC.e → pUSD (to EOA)
        log.info("Step 3: Wrap USDC.e → pUSD")
        results["wrap"] = wrap_usdce_to_pusd(private_key, amount_usdc)
    except Exception as e:
        return {"ok": False, "error": f"Wrap: {e}", "results": results}
    try:
        # 4. Transfer pUSD to deposit wallet
        log.info(f"Step 4: Transfer pUSD → deposit wallet")
        results["transfer"] = transfer_pusd(private_key, deposit_wallet, amount_usdc)
    except Exception as e:
        return {"ok": False, "error": f"Transfer: {e}", "results": results}
    try:
        # 5. Get nonce + submit WALLET batch (approve pUSD for exchange + neg risk)
        log.info("Step 5: Submit WALLET batch for exchange approvals")
        nonce = _get_wallet_nonce(deposit_wallet)
        deadline = int(time.time()) + 300
        calls = build_approval_calls()
        results["wallet_batch"] = submit_wallet_batch(calls, deposit_wallet, nonce, deadline, private_key)
        if not results["wallet_batch"].get("ok"):
            return {"ok": False, "error": f"Wallet batch: {results['wallet_batch'].get('error')}", "results": results}
    except Exception as e:
        return {"ok": False, "error": f"Wallet batch: {e}", "results": results}
    return {"ok": True, "results": results}

# ── POLY_1271 Order (deposit wallet) ──

def _round_tick(price):
    """Round price to nearest 0.0025 tick size (CLOB minimum tick rule)."""
    tick = 0.0025
    return round(price / tick) * tick

def _build_poly1271_order(token_id, side, price, size_usdc, deposit_wallet, neg_risk=False):
    """Build a fully signed POLY_1271 order payload using the installed SDK."""
    from py_clob_client_v2.order_utils import ExchangeOrderBuilderV2, Side as SDK_Side
    from py_clob_client_v2.order_utils.model.order_data_v2 import OrderDataV2
    from py_clob_client_v2.signer import Signer
    from eth_account import Account
    Account.enable_unaudited_hdwallet_features()
    import time, math

    pk = os.getenv("POLYMARKET_PRIVATE_KEY", "")
    if not pk:
        raise Exception("No private key for order signing")

    verifying_contract = NEG_RISK_ADDR if neg_risk else EXCHANGE_ADDR
    signer = Signer(private_key=pk, chain_id=chain_id())
    builder = ExchangeOrderBuilderV2(
        contract_address=verifying_contract,
        chain_id=chain_id(),
        signer=signer,
    )

    sdk_side = SDK_Side.BUY if side.upper() == "BUY" else SDK_Side.SELL
    ts_ms = str(int(time.time() * 1000))
    is_buy = side.upper() == "BUY"

    price = _round_tick(price)
    price_micro = int(round(price * 10**6))
    target_micro = int(round(size_usdc * 10**6))
    if is_buy:
        maker_prec = 10
        step = maker_prec // math.gcd(price_micro, maker_prec)
        k = round(target_micro / price_micro / step) * step
        if k <= 0:
            k = step
        if price_micro * k < 1000000:
            k = math.ceil(1000000 / (price_micro * step)) * step
        maker_amount = price_micro * k
        taker_amount = 10**6 * k
    else:
        taker_prec = 10
        step = taker_prec // math.gcd(price_micro, taker_prec)
        k = round(target_micro / price_micro / step) * step
        if k <= 0:
            k = step
        if price_micro * k < 1000000:
            k = math.ceil(1000000 / (price_micro * step)) * step
        maker_amount = 10**6 * k
        taker_amount = price_micro * k

    order_data = OrderDataV2(
        maker=deposit_wallet,
        signer=deposit_wallet,
        tokenId=str(token_id),
        makerAmount=str(maker_amount),
        takerAmount=str(taker_amount),
        side=sdk_side,
        signatureType=3,
        timestamp=ts_ms,
    )
    signed = builder.build_signed_order(order_data)
    return signed

def _build_poly1271_signature(order_hash, order_fields, private_key, deposit_wallet, neg_risk=False):
    """Build ERC-7739 wrapped POLY_1271 order signature.
    Matches py-clob-client-v2 ExchangeOrderBuilderV2._build_poly_1271_order_signature.
    """
    from eth_account import Account
    from eth_utils import keccak as _keccak
    from eth_abi import encode as abi_encode
    Account.enable_unaudited_hdwallet_features()

    verifying_contract = NEG_RISK_ADDR if neg_risk else EXCHANGE_ADDR

    # ── Constants matching SDK ──
    DOMAIN_TYPE_STRING = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    ORDER_TYPE_STRING = (
        "Order(uint256 salt,address maker,address signer,uint256 tokenId,"
        "uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,"
        "uint256 timestamp,bytes32 metadata,bytes32 builder)"
    )
    SOLADY_TYPE_STRING = (
        "TypedDataSign(Order contents,string name,string version,uint256 chainId,"
        "address verifyingContract,bytes32 salt)"
        f"{ORDER_TYPE_STRING}"
    )
    DOMAIN_TYPE_HASH = _keccak(text=DOMAIN_TYPE_STRING)
    ORDER_TYPE_HASH = _keccak(text=ORDER_TYPE_STRING)
    SOLADY_TYPE_HASH = _keccak(text=SOLADY_TYPE_STRING)

    CTF_EXCHANGE_NAME_HASH = _keccak(text="Polymarket CTF Exchange")
    CTF_EXCHANGE_VERSION_HASH = _keccak(text="2")
    DEPOSIT_WALLET_NAME_HASH = _keccak(text="DepositWallet")
    DEPOSIT_WALLET_VERSION_HASH = _keccak(text="1")
    DEPOSIT_WALLET_DOMAIN_SALT = bytes(32)

    # ── app_domain_separator (exchange domain separator) ──
    app_domain_sep = _keccak(
        primitive=abi_encode(
            ["bytes32", "bytes32", "bytes32", "uint256", "address"],
            [
                DOMAIN_TYPE_HASH,
                CTF_EXCHANGE_NAME_HASH,
                CTF_EXCHANGE_VERSION_HASH,
                chain_id(),
                verifying_contract,
            ],
        )
    )

    # ── contents_hash = hashStruct(Order) ──
    m = order_fields
    def _b32(v):
        if isinstance(v, bytes):
            return v
        return bytes.fromhex(v.replace("0x", "").zfill(64))
    contents_hash = _keccak(
        primitive=abi_encode(
            ["bytes32", "uint256", "address", "address", "uint256", "uint256",
             "uint256", "uint8", "uint8", "uint256", "bytes32", "bytes32"],
            [
                ORDER_TYPE_HASH,
                int(m["salt"]),
                m["maker"],
                m["signer"],
                int(m["tokenId"]),
                int(m["makerAmount"]),
                int(m["takerAmount"]),
                int(m["side"]),
                3,  # signatureType
                int(m["timestamp"]),
                _b32("0x" + "0"*64),  # metadata
                _b32("0x" + "0"*64),  # builder
            ],
        )
    )

    # ── TypedDataSign struct hash ──
    typed_data_sign_struct_hash = _keccak(
        primitive=abi_encode(
            ["bytes32", "bytes32", "bytes32", "bytes32", "uint256", "address", "bytes32"],
            [
                SOLADY_TYPE_HASH,
                contents_hash,
                DEPOSIT_WALLET_NAME_HASH,
                DEPOSIT_WALLET_VERSION_HASH,
                chain_id(),
                deposit_wallet,  # verifyingContract = deposit wallet = signer
                DEPOSIT_WALLET_DOMAIN_SALT,
            ],
        )
    )

    # ── Digest and sign ──
    digest = _keccak(
        primitive=(b"\x19\x01" + app_domain_sep + typed_data_sign_struct_hash)
    )
    signed = Account._sign_hash(digest, private_key=private_key)
    inner_sig_hex = signed.signature.hex()
    if inner_sig_hex.startswith("0x"):
        inner_sig_hex = inner_sig_hex[2:]

    # ── Final signature ──
    contents_type_hex = ORDER_TYPE_STRING.encode("utf-8").hex()
    contents_type_len = len(ORDER_TYPE_STRING).to_bytes(2, "big").hex()

    return (
        "0x"
        + inner_sig_hex
        + app_domain_sep.hex()
        + contents_hash.hex()
        + contents_type_hex
        + contents_type_len
    )

def place_order_poly1271(token_id, side, price, size_usdc, private_key, deposit_wallet):
    """Place a V2 order using POLY_1271 (deposit wallet) signature.
    Uses py-clob-client-v2 SDK for full SDK-level compatibility.
    """
    if not private_key:
        return {"ok": False, "error": "No private key."}
    if not deposit_wallet:
        return {"ok": False, "error": "No deposit wallet address. Set POLYMARKET_FUNDER_ADDRESS."}
    log.info(f"place_order_poly1271: token={token_id} side={side} price={price} size={size_usdc}")
    try:
        import time, json
        clob_host = _clob().rstrip("/")
        sess = _proxied_session()

        creds = _get_api_creds(private_key)
        log.info(f"API creds: key={creds['apiKey'][:8]}...")

        # Check neg_risk
        neg_resp = sess.get(f"{clob_host}/neg-risk?token_id={token_id}", timeout=15)
        neg_risk = neg_resp.json().get("neg_risk", False) if neg_resp.ok else False
        log.info(f"neg_risk={neg_risk}")

        # Build fully signed order via SDK
        signed = _build_poly1271_order(token_id, side, price, size_usdc, deposit_wallet, neg_risk)
        salt = int(signed.salt)
        ts_ms = int(signed.timestamp)
        maker_amount_str = signed.makerAmount
        taker_amount_str = signed.takerAmount
        order_side = int(signed.side)
        signature = signed.signature

        order_data = {
            "order": {
                "salt": salt,
                "maker": signed.maker,
                "signer": signed.signer,
                "tokenId": signed.tokenId,
                "makerAmount": maker_amount_str,
                "takerAmount": taker_amount_str,
                "side": "BUY" if order_side == 0 else "SELL",
                "expiration": "0",
                "timestamp": str(ts_ms),
                "metadata": "0x" + "0"*64,
                "builder": "0x" + "0"*64,
                "signature": signature,
                "signatureType": 3,
            },
            "owner": creds["apiKey"],
            "orderType": "GTC",
            "deferExec": False,
            "postOnly": False,
        }

        body_str = json.dumps(order_data, separators=(",", ":"), ensure_ascii=False)
        l2_headers = _v2_l2_headers("POST", "/order", body_str, creds, int(time.time()))
        log.info(f"Posting POLY_1271 order to {clob_host}/order")
        order_resp = sess.post(f"{clob_host}/order", data=body_str, headers=l2_headers, timeout=30)
        log.info(f"Order response: status={order_resp.status_code}")
        if order_resp.ok:
            data = order_resp.json()
            return {"ok": True, "order_id": data.get("orderID", ""), "response": data}
        return {"ok": False, "error": f"Order: {order_resp.status_code} {order_resp.text[:300]}"}
    except Exception as e:
        import traceback
        log.error(f"place_order_poly1271: {e}\n{traceback.format_exc()}")
        return {"ok": False, "error": str(e)}

def get_open_orders(private_key):
    try:
        import time
        creds = _get_api_creds(private_key)
        clob_host = _clob().rstrip("/")
        sess = _proxied_session()
        now_ts = int(time.time())
        l2_headers = _v2_l2_headers("GET", "/orders", "", creds, now_ts)
        resp = sess.get(f"{clob_host}/orders", headers=l2_headers, timeout=15)
        if resp.ok:
            data = resp.json()
            return data if isinstance(data, list) else data.get("orders", data.get("data", []))
        return []
    except Exception as e:
        log.warning(f"get_open_orders: {e}")
        return []

def get_deposit_wallet_balance(deposit_wallet):
    """Check pUSD balance of a deposit wallet via RPC."""
    try:
        import requests as req
        rpc = _rpc()
        pusd = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB"
        sel = "0x70a08231" + deposit_wallet[2:].lower().zfill(64)
        r = req.post(rpc, json={"jsonrpc":"2.0","method":"eth_call","params":[{"to": pusd, "data": sel}, "latest"],"id":1}, timeout=10)
        if r.ok:
            bal = int(r.json().get("result", "0x0"), 16)
            return bal
        return 0
    except Exception as e:
        log.warning(f"get_deposit_wallet_balance: {e}")
        return 0

def check_market_resolution(market_id):
    try:
        r = S.get(f"{GAMMA}/markets/{market_id}", timeout=10)
        if r.ok:
            data = r.json()
            if data.get("closed") or data.get("resolved"):
                outcome = data.get("consensus_outcome")
                if outcome is not None:
                    try:
                        idx = int(float(outcome))
                        winner = data.get("outcomes")[idx] if data.get("outcomes") and 0 <= idx < len(data.get("outcomes")) else None
                        return {"resolved": True, "outcome": idx, "winner": winner}
                    except:
                        pass
                return {"resolved": True, "outcome": outcome, "winner": None}
        return {"resolved": False}
    except Exception as e:
        log.warning(f"check_market_resolution: {e}")
        return {"resolved": False}

