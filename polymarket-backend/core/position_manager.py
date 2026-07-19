import json, os, logging, time
from datetime import datetime, timezone

log = logging.getLogger("positions")
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
POS_FILE = os.path.join(DATA_DIR, 'positions.json')
os.makedirs(DATA_DIR, exist_ok=True)

def _load():
    try:
        with open(POS_FILE) as f:
            return json.load(f)
    except:
        return {"orders": [], "positions": [], "total_pnl": 0.0, "matched_count": 0}

def _save(d):
    with open(POS_FILE, 'w') as f:
        json.dump(d, f, indent=2)

def record_order(token_id, side, price, size_usdc, order_id, market=None):
    d = _load()
    d["orders"].append({
        "order_id": order_id,
        "token_id": token_id,
        "side": side,
        "price": price,
        "size_usdc": size_usdc,
        "status": "pending",
        "market": market or {},
        "placed_at": datetime.now(timezone.utc).isoformat(),
    })
    d["orders"] = d["orders"][-500:]
    _save(d)

def mark_matched(order_id, match_amount=None):
    d = _load()
    for o in d["orders"]:
        if o["order_id"] == order_id and o["status"] == "pending":
            o["status"] = "matched"
            o["matched_at"] = datetime.now(timezone.utc).isoformat()
            o["matched_amount"] = match_amount
            d["matched_count"] = d.get("matched_count", 0) + 1
            break
    _save(d)

def open_position(order_id, token_id, side, price, size_usdc, market_id):
    d = _load()
    existing = [p for p in d["positions"] if p["order_id"] == order_id]
    if existing:
        return
    d["positions"].append({
        "order_id": order_id,
        "token_id": token_id,
        "market_id": market_id,
        "side": side,
        "entry_price": price,
        "size_usdc": size_usdc,
        "resolved": False,
        "won": None,
        "pnl": None,
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None,
    })
    _save(d)

def resolve_position(order_id, won, pnl):
    d = _load()
    for p in d["positions"]:
        if p["order_id"] == order_id and not p["resolved"]:
            p["resolved"] = True
            p["won"] = won
            p["pnl"] = pnl
            p["resolved_at"] = datetime.now(timezone.utc).isoformat()
            break
    d["total_pnl"] = d.get("total_pnl", 0.0) + pnl
    _save(d)

def get_positions(include_closed=False):
    d = _load()
    if include_closed:
        return d["positions"]
    return [p for p in d["positions"] if not p.get("resolved")]

def get_orders(status=None):
    d = _load()
    if status:
        return [o for o in d["orders"] if o.get("status") == status]
    return d["orders"]

def get_summary():
    d = _load()
    open_pos = len([p for p in d["positions"] if not p.get("resolved")])
    closed_pos = len([p for p in d["positions"] if p.get("resolved")])
    wins = len([p for p in d["positions"] if p.get("won") == True])
    losses = len([p for p in d["positions"] if p.get("won") == False])
    return {
        "total_orders": len(d["orders"]),
        "matched_count": d.get("matched_count", 0),
        "open_positions": open_pos,
        "closed_positions": closed_pos,
        "wins": wins,
        "losses": losses,
        "total_pnl": round(d.get("total_pnl", 0.0), 2),
        "recent_orders": d["orders"][-20:],
    }
