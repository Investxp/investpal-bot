"""
core/polymarket.py — Polymarket Gamma + CLOB integration
NOTE: All APIs return 403 from cloud IPs. Run server.py locally (residential IP).
"""
import os,json,logging,time,requests,random
from datetime import datetime,timezone

log=logging.getLogger("polymarket")
GAMMA="https://gamma-api.polymarket.com"
RELAY=os.environ.get("POLYMARKET_RELAY","") or ""
CLOB=RELAY or "https://clob.polymarket.com"
DATA_BASE="https://data-api.polymarket.com"
CHAIN_ID=137
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
            r=S.get(f"{CLOB}/price",params={"token_id":token_id,"side":side},timeout=8)
            if r.ok: out[side]=float(r.json().get("price",0.5))
        if out["buy"] and out["sell"]: out["mid"]=round((out["buy"]+out["sell"])/2,4)
        elif out["buy"]: out["mid"]=out["buy"]
    except: pass
    return out

def fetch_orderbook(token_id):
    try:
        r=S.get(f"{CLOB}/book",params={"token_id":token_id},timeout=10)
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

# ── TRADING (CLOB V2) ──
EXCHANGE_ADDR = "0xE111180000d2663C0091e4f400237545B87B996B"
NEG_RISK_ADDR = "0xe2222d279d744050d28e00520010520000310F59"
V2_COLLATERAL = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB"

def _l1_sign(maker, private_key, ts, nonce):
    """EIP-712 typed data signing for CLOB V2 L1 auth."""
    from eth_account import Account
    from eth_account.messages import encode_typed_data
    Account.enable_unaudited_hdwallet_features()
    acct = Account.from_key(private_key)
    signable = encode_typed_data(
        domain_data={"name": "ClobAuthDomain", "version": "1", "chainId": CHAIN_ID},
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
    """HMAC-SHA256 for CLOB V2 L2 auth."""
    import hmac, hashlib
    msg = f"{timestamp}{method}{path}{body}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()

def _get_api_creds(private_key):
    """Obtain or derive CLOB V2 API credentials (L1 auth). Returns {apiKey, secret, passphrase, owner}."""
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
    clob_host = CLOB.rstrip("/")
    sess = _proxied_session()
    create = sess.post(f"{clob_host}/auth/api-key", json={"nonce": str(nonce)}, headers=headers, timeout=15)
    if create.ok:
        creds = create.json()
    else:
        derive = sess.get(f"{clob_host}/auth/derive-api-key", params={"nonce": str(nonce)}, headers=headers, timeout=15)
        if not derive.ok:
            raise Exception(f"L1 auth failed: create={create.status_code} derive={derive.status_code}")
        creds = derive.json()
    api_key = creds.get("apiKey", creds.get("api_key", ""))
    api_secret = creds.get("secret", creds.get("api_secret", ""))
    api_passphrase = creds.get("passphrase", creds.get("api_passphrase", ""))
    return {"apiKey": api_key, "secret": api_secret, "passphrase": api_passphrase, "owner": api_key, "address": maker}

def _v2_l2_headers(method, path, body, creds, ts):
    """Build L2 headers for a V2 CLOB API request."""
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
        clob_host = CLOB.rstrip("/")
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
        order_data["owner"] = creds["owner"]
        now_ts = int(time.time())
        body_str = json.dumps(order_data)
        l2_headers = _v2_l2_headers("POST", "/order", body_str, creds, now_ts)
        log.info(f"Posting V2 order to {clob_host}/order")
        order_resp = sess.post(f"{clob_host}/order", data=body_str, headers=l2_headers, timeout=30)
        log.info(f"Order response: status={order_resp.status_code}")
        if order_resp.ok:
            data = order_resp.json()
            return {"ok": True, "order_id": data.get("orderID",""), "response": data}
        return {"ok": False, "error": f"CLOB V2 order: {order_resp.status_code} {order_resp.text[:300]}"}
    except Exception as e:
        import traceback
        log.error(f"place_order: {e}\n{traceback.format_exc()}")
        return {"ok":False,"error":str(e)}

def _build_order_v2(token_id, side, price, size_usdc, private_key, neg_risk=False):
    """Build and EIP-712 sign a CLOB V2 order. Returns the full order envelope dict."""
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
    order_side = 1 if is_buy else 0
    verifying_contract = NEG_RISK_ADDR if neg_risk else EXCHANGE_ADDR
    signable = encode_typed_data(
        domain_data={
            "name": "Polymarket CTF",
            "version": "2",
            "chainId": CHAIN_ID,
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
            "expiration": str(ts_ms // 1000 + 3600),
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
        clob_host = CLOB.rstrip("/")
        sess = _proxied_session()
        now_ts = int(time.time())
        body_str = json.dumps({"orderID": order_id})
        l2_headers = _v2_l2_headers("DELETE", "/order", body_str, creds, now_ts)
        resp = sess.delete(f"{clob_host}/order", data=body_str, headers=l2_headers, timeout=15)
        return {"ok": resp.ok, "status": resp.status_code, "response": resp.json() if resp.ok else resp.text[:200]}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def get_open_orders(private_key):
    try:
        import time
        creds = _get_api_creds(private_key)
        clob_host = CLOB.rstrip("/")
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

