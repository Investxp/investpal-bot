# InvestPal Bot — Trading Strategies Guide

## Overview

The bot supports three strategies: **Hedge**, **Single Direction (Kelly)**, and **Market Making**.
All three operate on Polymarket sports markets (or any binary-outcome market). They share
a common configurable bankroll, sport filter, order type (Standard EOA or POLY_1271), and
auto-fund system.

---

## Strategy 1: Hedge (`"hedge"`)

**Core idea:** Martingale recovery on *both sides simultaneously*. Bet YES and NO on the same
market at the same time.

### How it works

- Two streak counters: `streak_a` (consecutive losses on YES side), `streak_b` (NO side).
- Each side's stake = `base_stake × (recovery_factor ^ streak)`, independently per side.
  - Example (base $10, factor 2.0):
    - Cycle 1: A=$10, B=$10, total=$20
    - A loses, B wins → Cycle 2: A=$20 (doubled), B=$10 (reset)
- Always enters **both** sides of the same market simultaneously.
- Uses `get_rec()` filter to select only tight-margin markets where combined implied
  probability < 1.0 (arbitrage opportunity).
- Resolution: the winning side covers the loser's stake; net profit = (winner_odds − 1)
  × winner_stake − loser_stake.

### Key config parameters

| Parameter | Default | Effect |
|---|---|---|
| `base_stake` | 10 | Starting stake per side in USDC |
| `recovery_factor` | 2.0 | Multiplier per consecutive loss on a side |
| `max_concurrent` | 3 | Max markets hedged simultaneously |

### Risk profile

- **Volatility:** Low per cycle (one side always wins)
- **Tail risk:** High — a 6-loss streak on one side means stake = base × 2^6 = 64× base
  on that side alone. Requires large bankroll relative to base stake.
- **Best for:** Stable daily returns in efficient markets with combined odds consistently
  below 1.0.

---

## Strategy 2: Single Direction Kelly (`"single"`)

**Core idea:** Find directional mispricing, bet only the underpriced side, size by
Kelly Criterion.

### How it works

- For each market candidate, calculate implied probability from odds:
  - `ipA = 1 / oddsA`, `ipB = 1 / oddsB`
- Calculate edge per side:
  - `edgeA = |yes_price - ipA|`, `edgeB = |no_price - ipB|`
- Pick the side with the **higher edge**.
- **Skip if `best_edge < min_edge`** (default 5%).
- Kelly stake formula:
  ```
  b = odds - 1.0
  kelly_pct = (edge / b)           # full Kelly
  stake = bankroll × min(kelly_pct × kelly_fraction, 0.15)
  ```
  where `kelly_fraction` (default 0.25) dials from full Kelly to quarter-Kelly.
  The 15% cap prevents over-concentration.
- One side per market, not both.

### Key config parameters

| Parameter | Default | Effect |
|---|---|---|
| `kelly_fraction` | 0.25 | Fraction of full Kelly (0.05–1.0) |
| `min_edge` | 0.05 | Minimum edge threshold (5%) |
| `base_stake` | — | Not used directly; stake is computed from Kelly |

### Risk profile

- **Volatility:** Moderate per bet (full loss when wrong)
- **Tail risk:** Low — Kelly controls size; fraction prevents over-betting. No compounding
  of losses.
- **Best for:** Markets where you have genuine information edge (e.g., deep knowledge of
  a sport/league). Maximizes long-run geometric growth without blow-up risk.

---

## Strategy 3: Market Making (`"market_making"`)

**Core idea:** Post limit orders below the current price on both sides, collect the
spread when either fills.

### How it works

- Bid prices are set below the current market price:
  - `YES_bid = max(0.001, yes_price - spread)`
  - `NO_bid = max(0.001, no_price - spread)`
- Posts limit orders (BUY) at those lower prices on **both** sides simultaneously.
- Stake per side = `min(bankroll × 5%, $10)` — fixed, not dynamic.
- Max positions controlled by `mm_max_positions` (default 3).
- If someone sells into your bid, you've bought below fair value. On resolution:
  - Winning token pays 1 USDC → profit = 1 − bid_price per token
  - Losing token pays 0 → loss = bid_price per token
- The strategy profits when the bid is below the true probability — the spread
  acts as a buffer.

### Key config parameters

| Parameter | Default | Effect |
|---|---|---|
| `mm_spread` | 0.02 | Spread below market per side (e.g., 0.02 = 2¢) |
| `mm_max_positions` | 3 | Max markets to market-make simultaneously |

### Risk profile

- **Volatility:** Low per position (bought at discount)
- **Tail risk:** Low — fixed small stakes, no compounding. Risk is adverse selection
  (market moves away from your bid → never fills, or moves against your filled position).
- **Best for:** Passive spread collection in liquid markets. Highest win rate but
  smallest per-bet profit. Ideal when direction is unpredictable but mean reversion
  is expected.

---

## Comparison Table

| Aspect | Hedge | Single (Kelly) | Market Making |
|---|---|---|---|
| **Sides per market** | Both (YES + NO) | One (best edge) | Both (limit orders) |
| **Stake sizing** | Martingale recovery × 2 | Kelly Criterion (quarter) | Fixed 5% bankroll (capped $10) |
| **Market filter** | `get_rec()` (tight margin) | `edge > min_edge` (5%) | All (spread-based) |
| **Edge source** | Combined odds < 1.0 (arb) | Directional mispricing | Liquidity spread |
| **Win per cycle** | Always one side wins | Either full win or full loss | Spread collected on fills |
| **Max positions** | `max_concurrent` | `max_concurrent` | `min(max_concurrent, mm_max_positions)` |
| **Risk compounding** | **High** — factor^streak doubles both sides | **Low-Medium** — Kelly controls size | **Low** — fixed stake, no compounding |
| **Capital efficiency** | Poor — ties up 2× stake per market | Good — single side per market | Moderate — 2× stake but lower prices |
| **Best for** | Thin markets with tight spreads | Clear directional bias | Liquid markets, passive income |
| **Worst case** | 6-loss streak = 64× base stake per side | Wrong direction = full loss | Bid never fills → missed opportunity |

---

## Which Strategy to Use When

| Situation | Recommended |
|---|---|
| Large bankroll ($500+), want steady daily returns | **Hedge** — stable, predictable |
| Small bankroll ($50–$200), want growth | **Single (Kelly)** — no blow-up risk |
| Passive income, don't want to pick sides | **Market Making** — let the spread work |
| You have deep sport/league knowledge | **Single (Kelly)** — capitalize on your edge |
| Tight, efficient markets | **Hedge** — arb opportunities |
| Illiquid markets with wide spreads | **Hedge** or **Single** (MM bids too far below) |
| Just testing / demo mode | Any — all support simulation |

---

## Common Configuration

These apply regardless of strategy:

| Parameter | Default | Notes |
|---|---|---|
| `bot_mode` | `simulation` | Switch to `live` for real trades |
| `order_type` | `poly1271` | `standard` for EOA, `poly1271` for deposit wallet |
| `auto_fund` | `true` | Automatically top up deposit wallet from EOA |
| `sport_filter` | `""` (all sports) | Filter to one sport (Football, Basketball, etc.) |
| `interval_seconds` | `60` | Cycle interval; 3600+ for production |
| `bankroll` | `100.0` | Total capital allocation for the bot |
