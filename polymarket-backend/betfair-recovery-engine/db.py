"""
SQLite persistence. Mirrors the pattern used in your AutochartistAI bridge
server -- one local DB, simple schema, easy to inspect with any SQLite tool.
"""
import json
import sqlite3
from contextlib import contextmanager
from typing import Optional

from models import BetRecord, LineConfig, LineState, RecoveryMode, Side

SCHEMA = """
CREATE TABLE IF NOT EXISTS line_configs (
    line_id TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS line_states (
    line_id TEXT PRIMARY KEY,
    stage INTEGER NOT NULL,
    cumulative_loss REAL NOT NULL,
    current_side TEXT,
    paused INTEGER NOT NULL,
    pause_reason TEXT,
    total_realized_pnl REAL NOT NULL,
    bets_placed INTEGER NOT NULL,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (line_id) REFERENCES line_configs(line_id)
);

CREATE TABLE IF NOT EXISTS bet_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    side TEXT NOT NULL,
    stake REAL NOT NULL,
    odds REAL NOT NULL,
    stage INTEGER NOT NULL,
    outcome TEXT,
    pnl REAL,
    model_confidence REAL,
    bet_id TEXT,
    placed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    settled_at TEXT,
    FOREIGN KEY (line_id) REFERENCES line_configs(line_id)
);

CREATE INDEX IF NOT EXISTS idx_bet_history_line ON bet_history(line_id);

CREATE TABLE IF NOT EXISTS line_controls (
    line_id TEXT PRIMARY KEY,
    pending_command TEXT,
    issued_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    action TEXT NOT NULL,
    details TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path: str = "recovery_engine.db"):
        self.path = path
        with self._conn() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def save_config(self, config: LineConfig):
        payload = json.dumps(config.__dict__, default=str)
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO line_configs (line_id, config_json) VALUES (?, ?) "
                "ON CONFLICT(line_id) DO UPDATE SET config_json=excluded.config_json",
                (config.line_id, payload),
            )

    def load_config(self, line_id: str) -> Optional[LineConfig]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT config_json FROM line_configs WHERE line_id=?", (line_id,)
            ).fetchone()
        if not row:
            return None
        data = json.loads(row["config_json"])
        
        # Resolve enums and create LineConfig
        from models import RecoveryMode, Side
        return LineConfig(
            line_id=data["line_id"],
            sport=data["sport"],
            market_type=data["market_type"],
            competition_filter=data.get("competition_filter"),
            mode=RecoveryMode(data["mode"]),
            default_side=Side(data["default_side"]),
            base_stake=float(data["base_stake"]),
            target_margin=float(data["target_margin"]),
            commission_rate=float(data["commission_rate"]),
            min_odds=float(data["min_odds"]),
            max_odds=float(data["max_odds"]),
            max_stake_cap=float(data.get("max_stake_cap", 500.0)),
            max_stage=int(data["max_stage"]),
            bankroll_alloc=float(data["bankroll_alloc"]),
            max_bankroll_pct_per_bet=float(data.get("max_bankroll_pct_per_bet", 0.25)),
            min_matched_volume=float(data.get("min_matched_volume", 200.0)),
            confidence_threshold=float(data.get("confidence_threshold", 0.55)),
        )

    def save_state(self, state: LineState):
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO line_states
                   (line_id, stage, cumulative_loss, current_side, paused,
                    pause_reason, total_realized_pnl, bets_placed)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(line_id) DO UPDATE SET
                     stage=excluded.stage,
                     cumulative_loss=excluded.cumulative_loss,
                     current_side=excluded.current_side,
                     paused=excluded.paused,
                     pause_reason=excluded.pause_reason,
                     total_realized_pnl=excluded.total_realized_pnl,
                     bets_placed=excluded.bets_placed,
                     last_updated=CURRENT_TIMESTAMP
                """,
                (
                    state.line_id, state.stage, state.cumulative_loss,
                    state.current_side.value if state.current_side else None,
                    int(state.paused), state.pause_reason,
                    state.total_realized_pnl, state.bets_placed,
                ),
            )

    def load_state(self, line_id: str) -> Optional[LineState]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM line_states WHERE line_id=?", (line_id,)
            ).fetchone()
        if not row:
            return None
        return LineState(
            line_id=row["line_id"],
            stage=row["stage"],
            cumulative_loss=row["cumulative_loss"],
            current_side=Side(row["current_side"]) if row["current_side"] else None,
            paused=bool(row["paused"]),
            pause_reason=row["pause_reason"],
            total_realized_pnl=row["total_realized_pnl"],
            bets_placed=row["bets_placed"],
        )

    def log_bet(self, record: BetRecord):
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO bet_history
                   (line_id, event_id, side, stake, odds, stage, outcome, pnl,
                    model_confidence, bet_id, settled_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (
                    record.line_id, record.event_id, record.side.value,
                    record.stake, record.odds, record.stage,
                    record.outcome.value if record.outcome else None,
                    record.pnl, record.model_confidence, record.bet_id,
                ),
            )

    def update_bet_outcome(self, bet_id: str, outcome: BetOutcome, pnl: float):
        with self._conn() as conn:
            conn.execute(
                "UPDATE bet_history SET outcome=?, pnl=?, settled_at=CURRENT_TIMESTAMP WHERE bet_id=?",
                (outcome.value, pnl, bet_id),
            )

    def get_pending_bets(self):
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM bet_history WHERE outcome IS NULL AND bet_id IS NOT NULL"
            ).fetchall()
        return [dict(r) for r in rows]

    def history(self, line_id: str):
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM bet_history WHERE line_id=? ORDER BY id", (line_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    # --- dashboard control commands ---

    def set_command(self, line_id: str, command: str):
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO line_controls (line_id, pending_command) VALUES (?, ?) "
                "ON CONFLICT(line_id) DO UPDATE SET pending_command=excluded.pending_command, "
                "issued_at=CURRENT_TIMESTAMP",
                (line_id, command),
            )

    def pop_command(self, line_id: str) -> Optional[str]:
        """Read the pending command (if any) and clear it. Engine loops call
        this once per tick to pick up dashboard-issued pause/resume/reset."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT pending_command FROM line_controls WHERE line_id=?", (line_id,)
            ).fetchone()
            if row and row["pending_command"]:
                conn.execute(
                    "UPDATE line_controls SET pending_command=NULL WHERE line_id=?",
                    (line_id,),
                )
                return row["pending_command"]
        return None

    # --- dashboard read queries ---

    def list_lines(self):
        """All configured lines with their current state, joined and flattened
        for the dashboard summary view."""
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT c.line_id, c.config_json, s.stage, s.cumulative_loss,
                          s.current_side, s.paused, s.pause_reason,
                          s.total_realized_pnl, s.bets_placed, s.last_updated
                   FROM line_configs c
                   LEFT JOIN line_states s ON c.line_id = s.line_id
                   ORDER BY c.line_id"""
            ).fetchall()
        out = []
        for r in rows:
            cfg = json.loads(r["config_json"])
            out.append({
                "line_id": r["line_id"],
                "sport": cfg.get("sport"),
                "market_type": cfg.get("market_type"),
                "mode": cfg.get("mode"),
                "base_stake": cfg.get("base_stake"),
                "max_stage": cfg.get("max_stage"),
                "target_margin": cfg.get("target_margin"),
                "min_odds": cfg.get("min_odds"),
                "max_odds": cfg.get("max_odds"),
                "min_matched_volume": cfg.get("min_matched_volume"),
                "stage": r["stage"] if r["stage"] is not None else 0,
                "cumulative_loss": r["cumulative_loss"] if r["cumulative_loss"] is not None else 0.0,
                "current_side": r["current_side"],
                "paused": bool(r["paused"]) if r["paused"] is not None else False,
                "pause_reason": r["pause_reason"],
                "total_realized_pnl": r["total_realized_pnl"] if r["total_realized_pnl"] is not None else 0.0,
                "bets_placed": r["bets_placed"] if r["bets_placed"] is not None else 0,
                "last_updated": r["last_updated"],
            })
        return out

    def recent_history(self, line_id: str, limit: int = 12):
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM bet_history WHERE line_id=? ORDER BY id DESC LIMIT ?",
                (line_id, limit),
            ).fetchall()
        return [dict(r) for r in rows][::-1]  # chronological order

    def log_audit_event(self, action: str, details: str):
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO audit_logs (action, details) VALUES (?, ?)",
                (action, details)
            )

    def get_audit_logs(self, limit: int = 20):
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?",
                (limit,)
            ).fetchall()
        return [dict(r) for r in rows]
