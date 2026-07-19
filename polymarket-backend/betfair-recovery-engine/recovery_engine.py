"""
RecoveryEngine: the state machine that sits between "an upcoming event is
available" and "place this bet". It owns LineState, delegates stake math to
StakeCalculator, and applies the SINGLE vs HYBRID_AI side-selection rules.

SINGLE mode:
    Side is fixed at config.default_side for the life of the line. Loss ->
    same side again next event, bigger stake. Win -> reset.

HYBRID_AI mode:
    Side is chosen by an external signal/model on every decision (including
    stage 0). The engine never forces a side; it only sizes the stake based
    on cumulative_loss. A SideSelector callback is injected so the AI model
    can be swapped freely without touching recovery math.
"""
from typing import Callable, Optional

from models import (
    BetOutcome, BetRecord, LineConfig, LineState, RecoveryMode, Side, StakeDecision,
)
from stake_calculator import OddsQuote, StakeCalculator

# A SideSelector takes (event_id, available sides -> OddsQuote) and returns
# (chosen_side, model_confidence). This is where your AI model plugs in for
# HYBRID_AI mode. For SINGLE mode it's not used.
SideSelector = Callable[[str, dict], "tuple[Side, Optional[float]]"]


class RecoveryEngine:
    def __init__(self, config: LineConfig, state: Optional[LineState] = None):
        self.config = config
        self.state = state or LineState(line_id=config.line_id, current_side=config.default_side)
        self.calculator = StakeCalculator(config)

    def is_paused(self) -> bool:
        return self.state.paused

    def next_decision(
        self,
        event_id: str,
        quotes: dict,                 # {Side.A: OddsQuote, Side.B: OddsQuote}
        side_selector: Optional[SideSelector] = None,
    ) -> StakeDecision:
        """
        Compute the next stake decision for a given upcoming event.
        `quotes` must contain live odds/liquidity for whichever side(s) are
        relevant. For HYBRID_AI, both sides should be present so the
        selector can choose; for SINGLE, only config.default_side is used.
        """
        if self.state.paused:
            return StakeDecision(
                line_id=self.config.line_id, event_id=event_id,
                side=self.state.current_side or self.config.default_side,
                stake=0.0, odds=0.0, stage=self.state.stage,
                rejected=True, rejection_reason=f"line paused: {self.state.pause_reason}",
            )

        if self.config.mode in (RecoveryMode.SINGLE, RecoveryMode.HEDGE):
            side = self.config.default_side
            quote = quotes[side]
            confidence = None
        else:  # HYBRID_AI
            if side_selector is None:
                raise ValueError("HYBRID_AI mode requires a side_selector callback")
            side, confidence = side_selector(event_id, quotes)
            quote = quotes[side]

        return self.calculator.decide(self.state, event_id, side, quote, confidence)

    def apply_outcome(self, decision: StakeDecision, outcome: BetOutcome) -> BetRecord:
        """
        Feed the settled result of a placed bet back into line state.
        Call this only for decisions that were NOT rejected and WERE placed.
        """
        record = BetRecord(
            line_id=self.config.line_id,
            event_id=decision.event_id,
            side=decision.side,
            stake=decision.stake,
            odds=decision.odds,
            stage=decision.stage,
            outcome=outcome,
            model_confidence=decision.model_confidence,
        )

        if outcome == BetOutcome.UNMATCHED or outcome == BetOutcome.VOID:
            # No state change -- stage does not advance, loss does not change.
            record.pnl = 0.0
            return record

        if outcome == BetOutcome.WIN:
            gross_profit = decision.stake * (decision.odds - 1.0)
            net_profit = gross_profit * (1.0 - self.config.commission_rate)
            record.pnl = round(net_profit, 2)

            self.state.cumulative_loss = 0.0
            self.state.stage = 0
            self.state.current_side = self.config.default_side if \
                self.config.mode in (RecoveryMode.SINGLE, RecoveryMode.HEDGE) else None
            self.state.bets_placed += 1
            self.state.total_realized_pnl += record.pnl

        elif outcome == BetOutcome.LOSS:
            record.pnl = -decision.stake
            self.state.cumulative_loss += decision.stake
            self.state.stage += 1
            self.state.current_side = decision.side
            self.state.bets_placed += 1
            self.state.total_realized_pnl += record.pnl

            if self.state.stage >= self.config.max_stage:
                self.state.paused = True
                self.state.pause_reason = (
                    f"max_stage ({self.config.max_stage}) reached, "
                    f"cumulative_loss={self.state.cumulative_loss:.2f} -- "
                    f"manual review required"
                )

        return record

    def manual_reset(self):
        """Operator override: clear pause and recovery state, start fresh."""
        self.state.stage = 0
        self.state.cumulative_loss = 0.0
        self.state.paused = False
        self.state.pause_reason = None
        self.state.current_side = self.config.default_side
