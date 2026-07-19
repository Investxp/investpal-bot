"""
Core data models for the Betfair Linear Recovery Engine.

These dataclasses define the shape of a "line" (a configured market +
recovery strategy running across a sequence of events), and the records
produced as it operates.
"""
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class RecoveryMode(str, Enum):
    SINGLE = "single"      # A recovers with A (or B recovers with B)
    HYBRID_AI = "hybrid_ai"  # AI selects the side each time; engine only sizes the stake
    HEDGE = "hedge"        # simultaneous A and B execution on the same event


class Side(str, Enum):
    A = "A"
    B = "B"


class BetOutcome(str, Enum):
    WIN = "win"
    LOSS = "loss"
    VOID = "void"          # market voided/abandoned, doesn't affect recovery state
    UNMATCHED = "unmatched"  # order never filled before market start, stage not advanced


@dataclass
class LineConfig:
    """Defines one recovery line: a market type + risk parameters."""
    line_id: str
    sport: str                      # e.g. "basketball", "tennis"
    market_type: str                # e.g. "MATCH_ODDS", "OVER_UNDER_25", "ASIAN_HANDICAP"
    competition_filter: Optional[str] = None

    mode: RecoveryMode = RecoveryMode.SINGLE
    default_side: Side = Side.A     # which side SINGLE mode locks onto

    base_stake: float = 1.0
    target_margin: float = 0.5      # profit on top of recovered loss, in stake currency
    commission_rate: float = 0.05   # Betfair commission on net market winnings (varies by acct)

    min_odds: float = 1.30          # reject bets priced below this (recovery stake explodes)
    max_odds: float = 10.0          # reject bets priced above this (low win-probability noise)
    max_stake_cap: float = 500.0    # absolute ceiling on any single stake
    max_stage: int = 6              # kill-switch: pause line after this many consecutive losses
    bankroll_alloc: float = 1000.0  # capital assigned to this line, for % exposure checks
    max_bankroll_pct_per_bet: float = 0.25  # no single stake exceeds this % of bankroll_alloc

    min_matched_volume: float = 200.0  # skip events without enough exchange liquidity

    confidence_threshold: float = 0.55  # HYBRID_AI: minimum model confidence to place a bet


@dataclass
class LineState:
    """Mutable runtime state for a line. Persisted to SQLite between runs."""
    line_id: str
    stage: int = 0
    cumulative_loss: float = 0.0
    current_side: Optional[Side] = None   # last side bet on; None until first decision
    paused: bool = False
    pause_reason: Optional[str] = None
    total_realized_pnl: float = 0.0
    bets_placed: int = 0
    last_updated: datetime = field(default_factory=datetime.utcnow)


@dataclass
class StakeDecision:
    """Output of the stake calculator for a single upcoming bet."""
    line_id: str
    event_id: str
    side: Side
    stake: float
    odds: float
    stage: int
    rejected: bool = False
    rejection_reason: Optional[str] = None
    model_confidence: Optional[float] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class BetRecord:
    """Audit log entry for a placed (or rejected) bet and its eventual outcome."""
    line_id: str
    event_id: str
    side: Side
    stake: float
    odds: float
    stage: int
    outcome: Optional[BetOutcome] = None
    pnl: Optional[float] = None
    model_confidence: Optional[float] = None
    bet_id: Optional[str] = None          # Betfair's own order/bet id, once placed
    placed_at: datetime = field(default_factory=datetime.utcnow)
    settled_at: Optional[datetime] = None
