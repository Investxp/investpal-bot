"""
StakeCalculator: pure math, no I/O, no Betfair calls.

Given the current recovery state (cumulative loss, stage) and live odds for
a candidate side, computes the stake required to recover the loss plus a
target margin -- accounting for Betfair commission on net winnings.

This is intentionally decoupled from side-selection. SINGLE mode and
HYBRID_AI mode both call the same calculator; only the side passed in differs.
"""
from dataclasses import dataclass
from typing import Optional

from models import LineConfig, LineState, Side, StakeDecision


@dataclass
class OddsQuote:
    """Live market data needed to size and validate a bet."""
    side: Side
    decimal_odds: float
    matched_volume: float  # total matched at/near this price, used as a liquidity proxy


class StakeCalculator:
    def __init__(self, config: LineConfig):
        self.config = config

    def required_stake(self, cumulative_loss: float, odds: float) -> float:
        """
        Stake needed so that, if this bet wins, post-commission profit covers
        the cumulative loss plus the configured target margin.

        profit_after_commission = stake * (odds - 1) * (1 - commission_rate)
        => stake = (cumulative_loss + target_margin) / ((odds - 1) * (1 - commission_rate))
        """
        if cumulative_loss <= 0:
            return self.config.base_stake

        denom = (odds - 1.0) * (1.0 - self.config.commission_rate)
        if denom <= 0:
            # Shouldn't happen given min_odds > 1, but guard anyway.
            return self.config.max_stake_cap + 1  # force rejection upstream
        return (cumulative_loss + self.config.target_margin) / denom

    def decide(
        self,
        state: LineState,
        event_id: str,
        side: Side,
        quote: OddsQuote,
        model_confidence: Optional[float] = None,
    ) -> StakeDecision:
        """
        Produce a StakeDecision for the given side/quote. May come back
        `rejected=True` if odds, liquidity, confidence, or stake bounds fail --
        in that case the line's stage does NOT advance; caller should
        re-attempt on the next queued event.
        """
        cfg = self.config

        if quote.matched_volume < cfg.min_matched_volume:
            return self._reject(state, event_id, side, quote, model_confidence,
                                 f"insufficient liquidity ({quote.matched_volume:.0f} "
                                 f"< {cfg.min_matched_volume:.0f})")

        if not (cfg.min_odds <= quote.decimal_odds <= cfg.max_odds):
            return self._reject(state, event_id, side, quote, model_confidence,
                                 f"odds {quote.decimal_odds:.2f} outside "
                                 f"[{cfg.min_odds}, {cfg.max_odds}]")

        if model_confidence is not None and model_confidence < cfg.confidence_threshold:
            return self._reject(state, event_id, side, quote, model_confidence,
                                 f"model confidence {model_confidence:.2f} "
                                 f"< threshold {cfg.confidence_threshold:.2f}")

        stake = self.required_stake(state.cumulative_loss, quote.decimal_odds)

        bankroll_cap = cfg.bankroll_alloc * cfg.max_bankroll_pct_per_bet
        hard_cap = min(cfg.max_stake_cap, bankroll_cap)
        if stake > hard_cap:
            return self._reject(state, event_id, side, quote, model_confidence,
                                 f"required stake {stake:.2f} exceeds cap {hard_cap:.2f} "
                                 f"(recovery math is no longer sane at these odds/loss size)")

        return StakeDecision(
            line_id=cfg.line_id,
            event_id=event_id,
            side=side,
            stake=round(stake, 2),
            odds=quote.decimal_odds,
            stage=state.stage,
            rejected=False,
            model_confidence=model_confidence,
        )

    def _reject(self, state, event_id, side, quote, model_confidence, reason) -> StakeDecision:
        return StakeDecision(
            line_id=self.config.line_id,
            event_id=event_id,
            side=side,
            stake=0.0,
            odds=quote.decimal_odds,
            stage=state.stage,
            rejected=True,
            rejection_reason=reason,
            model_confidence=model_confidence,
        )
