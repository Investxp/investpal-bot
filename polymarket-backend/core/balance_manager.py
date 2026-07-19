import json, os, logging
from datetime import datetime, timezone

log = logging.getLogger("balance_mgr")
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
BAL_FILE = os.path.join(DATA_DIR, 'balance_log.json')
os.makedirs(DATA_DIR, exist_ok=True)

MIN_BALANCE = 1000000
TARGET_BALANCE = 2000000

def _load():
    try:
        with open(BAL_FILE) as f:
            return json.load(f)
    except:
        return {"topups": [], "last_check": None, "last_balance": 0}

def _save(d):
    with open(BAL_FILE, 'w') as f:
        json.dump(d, f, indent=2)

def get_status():
    d = _load()
    return {
        "last_balance": d.get("last_balance", 0) / 1e6,
        "last_check": d.get("last_check", "never"),
        "topup_count": len(d.get("topups", [])),
        "recent_topups": d.get("topups", [])[-5:],
    }

def record_check(balance):
    d = _load()
    d["last_check"] = datetime.now(timezone.utc).isoformat()
    d["last_balance"] = balance
    _save(d)

def record_topup(amount_usdc, success, tx_log=None, error=None):
    d = _load()
    d.setdefault("topups", []).append({
        "amount": amount_usdc,
        "success": success,
        "tx_log": tx_log or [],
        "error": error,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    d["topups"] = d["topups"][-50:]
    _save(d)

def need_topup(balance):
    return balance < MIN_BALANCE
