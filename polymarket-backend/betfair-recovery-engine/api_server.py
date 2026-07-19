"""
api_server.py: small REST API over the recovery engine's SQLite DB, for the
dashboard to poll. Mirrors the bridge-server pattern from your MT5/cTrader
setup -- a thin local HTTP layer, no business logic of its own.

Run: python3 api_server.py
Then open dashboard.html in a browser (it points at http://127.0.0.1:5070).
"""
import os
import json
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

from db import Database

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Load environment variables from .env manually to ensure network awareness
env_path = os.path.join(SCRIPT_DIR, ".env")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())

DB_PATH = os.path.join(SCRIPT_DIR, "recovery_engine.db")
CONFIG_FILE = os.path.join(SCRIPT_DIR, "copytrade_config.json")
NOTIF_FILE = os.path.join(SCRIPT_DIR, "notifications.json")

app = Flask(__name__)
CORS(app)
db = Database(path=DB_PATH)


@app.route("/")
def serve_dashboard():
    return send_file(os.path.join(SCRIPT_DIR, "dashboard.html"))



def load_copytrade_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                cfg = json.load(f)
                if "follower_vault_address" not in cfg:
                    cfg["follower_vault_address"] = ""
                return cfg
        except Exception:
            pass
    return {
        "enabled": False,
        "user_multiplier": 1.0,
        "master_wallet_address": "0xc0A0c47B4C62112D9AaC1265a59676e59AdA728F",
        "follower_wallet_address": "",
        "follower_vault_address": ""
    }


def save_copytrade_config(config):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=4)
    except Exception as e:
        print(f"Error saving copytrade config: {e}")


@app.post("/api/auth/login")
def auth_login():
    data = request.json or {}
    address = data.get("address")
    signature = data.get("signature")
    if not address or not signature:
        return jsonify({"error": "Missing address or signature"}), 400
    
    config = load_copytrade_config()
    config["follower_wallet_address"] = address
    save_copytrade_config(config)
    
    db.log_audit_event("login", f"Follower address: {address}")
    return jsonify({
        "ok": True, 
        "message": "Authenticated successfully via Rabby signature",
        "address": address
    })


@app.get("/api/copytrade/config")
def get_copytrade_config():
    return jsonify(load_copytrade_config())


@app.get("/api/copytrade/vault-contract")
def get_vault_contract():
    vault_json_path = os.path.join(SCRIPT_DIR, "contracts", "InvestpalCopyVault.json")
    if os.path.exists(vault_json_path):
        try:
            with open(vault_json_path, "r") as f:
                return jsonify(json.load(f))
        except Exception as e:
            return jsonify({"error": f"Failed to load contract JSON: {e}"}), 500
    return jsonify({"error": "Compiled contract JSON not found"}), 404


@app.post("/api/copytrade/config")
def update_copytrade_config():
    data = request.json or {}
    config = load_copytrade_config()
    if "enabled" in data:
        config["enabled"] = bool(data["enabled"])
    if "user_multiplier" in data:
        config["user_multiplier"] = float(data["user_multiplier"])
    if "master_wallet_address" in data:
        config["master_wallet_address"] = str(data["master_wallet_address"])
    if "follower_wallet_address" in data:
        config["follower_wallet_address"] = str(data["follower_wallet_address"])
    if "follower_vault_address" in data:
        config["follower_vault_address"] = str(data["follower_vault_address"])
    save_copytrade_config(config)
    db.log_audit_event("update_copytrade_config", f"Multiplier: {config.get('user_multiplier')}, Enabled: {config.get('enabled')}")
    return jsonify({"ok": True, "config": config})


@app.get("/api/copytrade/state")
def get_copytrade_state():
    config = load_copytrade_config()
    
    # Fetch all history from DB to build copied trades list
    lines = db.list_lines()
    all_bets = []
    for line in lines:
        line_bets = db.history(line["line_id"])
        all_bets.extend(line_bets)
    
    # Sort descending by id
    all_bets.sort(key=lambda x: x.get("id", 0), reverse=True)
    
    copied_trades = []
    total_copied_volume = 0.0
    total_copied_profit = 0.0
    total_fees_paid = 0.0
    
    multiplier = config.get("user_multiplier", 1.0)
    enabled = config.get("enabled", False)
    
    for bet in all_bets:
        if not bet.get("bet_id"):
            continue
        
        outcome = bet.get("outcome")
        stake = bet.get("stake", 0.0)
        odds = bet.get("odds", 0.0)
        pnl = bet.get("pnl")
        
        copied_stake = stake * multiplier
        copied_pnl = 0.0
        fee = 0.0
        
        if outcome == "win":
            raw_pnl = copied_stake * (odds - 1.0)
            master_pnl = pnl or 0.0
            master_stake = stake
            if master_stake > 0 and odds > 1.0:
                ratio = master_pnl / (master_stake * (odds - 1.0))
                raw_pnl_net = raw_pnl * ratio
            else:
                raw_pnl_net = raw_pnl
            
            copied_pnl = round(raw_pnl_net, 2)
            fee = round(copied_pnl * 0.05, 2)
            copied_pnl_net = round(copied_pnl - fee, 2)
            
            total_copied_volume += copied_stake
            total_copied_profit += copied_pnl_net
            total_fees_paid += fee
        elif outcome == "loss":
            copied_pnl = -copied_stake
            copied_pnl_net = copied_pnl
            fee = 0.0
            
            total_copied_volume += copied_stake
            total_copied_profit += copied_pnl_net
        else:
            copied_pnl_net = 0.0
            fee = 0.0
        
        copied_trades.append({
            "id": bet.get("id"),
            "line_id": bet.get("line_id"),
            "event_id": bet.get("event_id"),
            "side": bet.get("side"),
            "master_stake": stake,
            "copied_stake": copied_stake,
            "odds": odds,
            "outcome": outcome,
            "master_pnl": pnl,
            "copied_pnl_net": copied_pnl_net,
            "fee_paid": fee,
            "placed_at": bet.get("placed_at"),
            "settled_at": bet.get("settled_at"),
            "bet_id": bet.get("bet_id")
        })
    
    return jsonify({
        "enabled": enabled,
        "user_multiplier": multiplier,
        "master_wallet_address": config.get("master_wallet_address", ""),
        "follower_wallet_address": config.get("follower_wallet_address", ""),
        "follower_vault_address": config.get("follower_vault_address", ""),
        "stats": {
            "total_trades": len(copied_trades),
            "total_copied_volume": round(total_copied_volume, 2),
            "total_copied_profit": round(total_copied_profit, 2),
            "total_fees_paid": round(total_fees_paid, 2)
        },
        "copied_trades": copied_trades[:12]
    })


@app.get("/api/engine/status")
def get_engine_status():
    config = load_copytrade_config()
    if "auto_execution" not in config:
        config["auto_execution"] = True
        save_copytrade_config(config)
    
    return jsonify({
        "auto_execution": config.get("auto_execution", True),
        "allow_in_play": config.get("allow_in_play", True),
        "network": config.get("network", "testnet"),
        "wallet_address": "0xc0A0c47B4C62112D9AaC1265a59676e59AdA728F"
    })


@app.post("/api/engine/toggle")
def toggle_engine():
    data = request.json or {}
    config = load_copytrade_config()
    if "auto_execution" in data:
        config["auto_execution"] = bool(data["auto_execution"])
    else:
        config["auto_execution"] = not config.get("auto_execution", True)
    save_copytrade_config(config)
    db.log_audit_event("toggle_autopilot", f"Autopilot set to {config['auto_execution']}")
    return jsonify({
        "ok": True,
        "auto_execution": config["auto_execution"]
    })


@app.post("/api/engine/network")
def toggle_network():
    data = request.json or {}
    network = data.get("network", "testnet").lower()
    if network not in ["mainnet", "testnet"]:
        return jsonify({"error": "Invalid network"}), 400
    config = load_copytrade_config()
    config["network"] = network
    save_copytrade_config(config)
    os.environ["SX_ENV"] = network
    db.log_audit_event("toggle_network", f"Network set to {network}")
    return jsonify({
        "ok": True,
        "network": network
    })


@app.post("/api/engine/settings")
def update_engine_settings():
    data = request.json or {}
    config = load_copytrade_config()
    if "allow_in_play" in data:
        config["allow_in_play"] = bool(data["allow_in_play"])
    save_copytrade_config(config)
    db.log_audit_event("update_settings", f"allow_in_play set to {config.get('allow_in_play')}")
    return jsonify({
        "ok": True,
        "config": config
    })


@app.get("/api/audit/logs")
def get_audit_logs():
    limit = int(request.args.get("limit", 20))
    logs = db.get_audit_logs(limit)
    return jsonify({"logs": logs})


# ---------------------------------------------------------------------------
# Notification Queue Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/copytrade/notifications")
def get_notifications():
    """Return unread notification queue for the dashboard toast system."""
    try:
        if os.path.exists(NOTIF_FILE):
            with open(NOTIF_FILE, "r") as f:
                queue = json.load(f)
        else:
            queue = []
        unread = [n for n in queue if not n.get("read", False)]
        return jsonify({"notifications": unread, "total": len(queue)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/copytrade/notifications/clear")
def clear_notifications():
    """Mark all notifications as read (called by dashboard after consuming them)."""
    try:
        if os.path.exists(NOTIF_FILE):
            with open(NOTIF_FILE, "r") as f:
                queue = json.load(f)
            for n in queue:
                n["read"] = True
            with open(NOTIF_FILE, "w") as f:
                json.dump(queue, f, indent=2)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Profit-Share Settlement
# ---------------------------------------------------------------------------

@app.post("/api/copytrade/settle")
def settle_profit_share():
    """
    Calculates profit-share for all WIN bets in the last 24 hours.
    Returns a settlement report with per-line breakdown and 5% fee allocation.
    """
    config = load_copytrade_config()
    multiplier = config.get("user_multiplier", 1.0)
    fee_rate = 0.05

    lines = db.list_lines()
    cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()

    report = []
    total_gross = 0.0
    total_fee = 0.0
    total_net = 0.0

    for line in lines:
        line_id = line["line_id"]
        history = db.recent_history(line_id, limit=500)
        wins = [
            b for b in history
            if b.get("outcome") == "win"
            and b.get("placed_at", "") >= cutoff
        ]
        for bet in wins:
            stake = bet.get("stake", 0.0)
            odds = bet.get("odds", 1.0)
            master_pnl = bet.get("pnl") or 0.0
            copied_stake = stake * multiplier
            gross = copied_stake * (odds - 1.0)
            fee = round(gross * fee_rate, 4)
            net = round(gross - fee, 4)
            total_gross += gross
            total_fee += fee
            total_net += net
            report.append({
                "line_id": line_id,
                "bet_id": bet.get("bet_id"),
                "master_stake": stake,
                "master_pnl": master_pnl,
                "copied_stake": round(copied_stake, 4),
                "gross_profit": round(gross, 4),
                "fee": fee,
                "net_profit": net,
                "placed_at": bet.get("placed_at")
            })

    db.log_audit_event("profit_settle", f"Settled {len(report)} bets. Gross: {total_gross:.4f} USDC, Fee: {total_fee:.4f} USDC")
    return jsonify({
        "period_hours": 24,
        "fee_rate_pct": fee_rate * 100,
        "user_multiplier": multiplier,
        "total_gross_profit": round(total_gross, 4),
        "total_fee_collected": round(total_fee, 4),
        "total_net_to_follower": round(total_net, 4),
        "bets_settled": len(report),
        "report": report
    })


# ---------------------------------------------------------------------------
# Line Management
# ---------------------------------------------------------------------------

@app.get("/api/lines")
def get_lines():
    return jsonify(db.list_lines())


@app.get("/api/lines/<line_id>/history")
def get_history(line_id):
    limit = int(request.args.get("limit", 12))
    return jsonify(db.recent_history(line_id, limit=limit))


@app.post("/api/lines/<line_id>/pause")
def pause_line(line_id):
    db.set_command(line_id, "PAUSE")
    db.log_audit_event("pause_line", f"Line {line_id} pause command issued")
    return jsonify({"ok": True, "line_id": line_id, "command": "PAUSE"})


@app.post("/api/lines/<line_id>/resume")
def resume_line(line_id):
    db.set_command(line_id, "RESUME")
    db.log_audit_event("resume_line", f"Line {line_id} resume command issued")
    return jsonify({"ok": True, "line_id": line_id, "command": "RESUME"})


@app.post("/api/lines/<line_id>/reset")
def reset_line(line_id):
    db.set_command(line_id, "RESET")
    db.log_audit_event("reset_line", f"Line {line_id} reset command issued")
    return jsonify({"ok": True, "line_id": line_id, "command": "RESET"})


@app.post("/api/lines/<line_id>/config")
def update_config(line_id):
    data = request.json
    from models import LineConfig, RecoveryMode, Side
    
    existing = db.load_config(line_id)
    if not existing:
        return jsonify({"error": "Line not found"}), 404
        
    updated = LineConfig(
        line_id=line_id,
        sport=data.get("sport", existing.sport),
        market_type=data.get("market_type", existing.market_type),
        competition_filter=data.get("competition_filter", existing.competition_filter),
        mode=RecoveryMode(data.get("mode", existing.mode.value)),
        default_side=Side(data.get("default_side", existing.default_side.value)),
        base_stake=float(data.get("base_stake", existing.base_stake)),
        target_margin=float(data.get("target_margin", existing.target_margin)),
        commission_rate=float(data.get("commission_rate", existing.commission_rate)),
        min_odds=float(data.get("min_odds", existing.min_odds)),
        max_odds=float(data.get("max_odds", existing.max_odds)),
        max_stake_cap=float(data.get("max_stake_cap", existing.max_stake_cap)),
        max_stage=int(data.get("max_stage", existing.max_stage)),
        bankroll_alloc=float(data.get("bankroll_alloc", existing.bankroll_alloc)),
        max_bankroll_pct_per_bet=float(data.get("max_bankroll_pct_per_bet", existing.max_bankroll_pct_per_bet)),
        min_matched_volume=float(data.get("min_matched_volume", existing.min_matched_volume)),
        confidence_threshold=float(data.get("confidence_threshold", existing.confidence_threshold)),
    )
    
    db.save_config(updated)

    # If editing a unified hedge parent, auto-propagate changes to both legs
    if updated.mode.value == "hedge" and not line_id.endswith(("-A", "-B")):
        from copy import deepcopy
        for leg_side in ("A", "B"):
            leg_id = f"{line_id}-{leg_side}"
            leg_cfg = deepcopy(updated)
            leg_cfg.line_id = leg_id
            leg_cfg.default_side = Side(leg_side)
            existing_leg = db.load_config(leg_id)
            if existing_leg:
                db.save_config(leg_cfg)

    db.log_audit_event("update_line_config", f"Line {line_id} config updated: base_stake={updated.base_stake}, max_stage={updated.max_stage}")
    return jsonify({"ok": True, "config": updated.__dict__})


@app.get("/api/scanner/feed")
def get_scanner_feed():
    """Return the last N market scan events from the live runner's scanner_log.json ring buffer."""
    scanner_log = os.path.join(SCRIPT_DIR, "scanner_log.json")
    limit = int(request.args.get("limit", 20))
    try:
        if os.path.exists(scanner_log):
            with open(scanner_log, "r") as f:
                events = json.load(f)
            # Return newest first
            return jsonify({"events": list(reversed(events[-limit:]))}) 
        return jsonify({"events": []})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5070, debug=False)
