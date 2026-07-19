"""
simulate.py: runs both recovery modes against the DryRunBetfairClient and
asserts core invariants hold. This is what you can run today, with zero
Betfair account, to validate the engine before any real money is involved.

Run: python3 simulate.py
"""
import os
from betfair_client import DryRunBetfairClient
from db import Database
from models import BetOutcome, LineConfig, RecoveryMode, Side
from recovery_engine import RecoveryEngine


def dumb_ai_side_selector(event_id, quotes):
    """
    Stand-in for your real model. Picks whichever side currently has the
    better (lower) odds with a mocked confidence score correlated to the
    odds gap -- replace this function with a call into your actual
    sport-prediction model. The engine doesn't care how this decision is
    made, only that it returns (Side, confidence).
    """
    a, b = quotes[Side.A], quotes[Side.B]
    favourite = Side.A if a.decimal_odds < b.decimal_odds else Side.B
    gap = abs(a.decimal_odds - b.decimal_odds)
    confidence = min(0.95, 0.5 + gap * 0.08)
    return favourite, confidence


def run_line(config: LineConfig, n_events: int, db: Database):
    client = DryRunBetfairClient(seed=42)
    engine = RecoveryEngine(config)
    db.save_config(config)

    print(f"\n=== Line: {config.line_id} ({config.mode.value}) ===")
    for i in range(n_events):
        event_id = f"evt-{i}"
        quotes = client.get_quotes(event_id)

        selector = dumb_ai_side_selector if config.mode == RecoveryMode.HYBRID_AI else None
        decision = engine.next_decision(event_id, quotes, side_selector=selector)

        if decision.rejected:
            print(f"  [{i:02d}] SKIP  side={decision.side.value:1} "
                  f"reason={decision.rejection_reason}")
            continue

        bet_id = client.place_back_bet(event_id, decision.side, decision.stake, decision.odds)
        outcome = client.settle(event_id, bet_id)
        record = engine.apply_outcome(decision, outcome)
        record.bet_id = bet_id
        db.log_bet(record)

        flag = "WIN " if outcome == BetOutcome.WIN else "LOSS"
        print(f"  [{i:02d}] {flag} side={decision.side.value:1} "
              f"stake={decision.stake:7.2f} odds={decision.odds:5.2f} "
              f"stage={decision.stage} pnl={record.pnl:+8.2f} "
              f"cum_loss_after={engine.state.cumulative_loss:7.2f} "
              f"paused={engine.state.paused}")

        if engine.state.paused:
            print(f"       -> LINE PAUSED: {engine.state.pause_reason}")
            break

    db.save_state(engine.state)
    print(f"  -- realized PnL: {engine.state.total_realized_pnl:+.2f} "
          f"over {engine.state.bets_placed} bets, final stage={engine.state.stage}")
    return engine


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db = Database(path=os.path.join(script_dir, "sim.db"))

    single_cfg = LineConfig(
        line_id="basketball-single-A",
        sport="basketball",
        market_type="MATCH_ODDS",
        mode=RecoveryMode.SINGLE,
        default_side=Side.A,
        base_stake=2.0,
        target_margin=1.0,
        commission_rate=0.05,
        max_stage=6,
        bankroll_alloc=1000.0,
    )
    single_engine = run_line(single_cfg, n_events=40, db=db)

    # --- invariants for SINGLE mode ---
    assert single_engine.state.current_side in (Side.A, None, Side.A)
    history = db.history("basketball-single-A")
    losses_in_a_row = 0
    max_losses_in_a_row = 0
    for h in history:
        if h["outcome"] == "loss":
            losses_in_a_row += 1
            max_losses_in_a_row = max(max_losses_in_a_row, losses_in_a_row)
        elif h["outcome"] == "win":
            losses_in_a_row = 0
    print(f"  [check] max consecutive losses before a recovering win: {max_losses_in_a_row}")
    assert max_losses_in_a_row <= single_cfg.max_stage

    hybrid_cfg = LineConfig(
        line_id="tennis-hybrid-ai",
        sport="tennis",
        market_type="MATCH_ODDS",
        mode=RecoveryMode.HYBRID_AI,
        base_stake=2.0,
        target_margin=1.0,
        commission_rate=0.05,
        max_stage=6,
        bankroll_alloc=1000.0,
        confidence_threshold=0.55,
    )
    hybrid_engine = run_line(hybrid_cfg, n_events=40, db=db)

    # --- invariants for HYBRID_AI mode ---
    history = db.history("tennis-hybrid-ai")
    # Only wins that followed at least one loss (stage > 0) are "recovery" wins
    # that must clear cumulative_loss + target_margin. Fresh base-stake wins
    # at stage 0 carry no such guarantee -- they just pay whatever the odds give.
    recovery_wins = [h for h in history if h["outcome"] == "win" and h["stage"] > 0]
    for w in recovery_wins:
        assert w["pnl"] is not None and w["pnl"] >= hybrid_cfg.target_margin - 0.05, (
            f"recovery win at stage {w['stage']} netted {w['pnl']}, "
            f"expected >= {hybrid_cfg.target_margin}"
        )
    print(f"  [check] {len(recovery_wins)} recovery wins all cleared target_margin after commission")

    print("\nAll invariant checks passed.")


if __name__ == "__main__":
    main()
