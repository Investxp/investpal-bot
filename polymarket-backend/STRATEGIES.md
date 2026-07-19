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

### Minimum capital required

| Base stake | Recovery factor | Worst-case 6-streak per side | Minimum bankroll (both sides) |
|---|---|---|---|
| $5 | 2.0 | $5 × 64 = $320 | **~$650** (both sides could peak) |
| $10 | 2.0 | $10 × 64 = $640 | **~$1,300** |
| $10 | 1.5 | $10 × 11.4 = $114 | **~$250** |
| $25 | 2.0 | $25 × 64 = $1,600 | **~$3,200** |

**Rule of thumb:** bankroll should be at least **15×** your base stake per side × 2 sides
when recovery_factor = 2.0. Lower the recovery factor to 1.5 if capital-constrained.

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

### Martingale recovery (optional)

When `martingale_recovery: true`, the Kelly stake is multiplied by `factor ^ streak`
for the chosen side. A 3-loss streak at factor 2.0 would multiply the stake by 8×.

**Warning:** This overrides the mathematically optimal Kelly sizing and increases
risk of ruin. Prefer raising `kelly_fraction` instead — that's the safe knob.

### Key config parameters

| Parameter | Default | Effect |
|---|---|---|
| `kelly_fraction` | 0.25 | Fraction of full Kelly (0.05–1.0) |
| `min_edge` | 0.05 | Minimum edge threshold (5%) |
| `recovery_factor` | 2.0 | Only used if `martingale_recovery: true` |
| `bankroll` | 100.0 | Total capital for Kelly sizing |

### Risk profile

- **Volatility:** Moderate per bet (full loss when wrong)
- **Tail risk:** Low (with recovery OFF) — Kelly controls size; fraction prevents
  over-betting. With recovery ON, tail risk rises to match Hedge.
- **Best for:** Markets where you have genuine information edge (e.g., deep knowledge of
  a sport/league). Maximizes long-run geometric growth without blow-up risk.

### Minimum capital required

| Kelly fraction | Min edge | Typical stake (% of bankroll) | Recommended minimum bankroll |
|---|---|---|---|
| 0.25 (quarter) | 5% | 1–3% | **$50–100** |
| 0.50 (half) | 5% | 2–6% | **$100–200** |
| 1.00 (full) | 5% | 4–15% | **$200–500** |

**Rule of thumb:** With quarter-Kelly at default settings, a $100 bankroll places
$1–3 per bet. You can start with as little as **$50** in simulation or live mode.

---

## Strategy 3: Market Making (`"market_making"`)

**Core idea:** Post limit orders below the current price on both sides, collect the
spread when either fills.

### How it works

- Bid prices are set below the current market price:
  - `YES_bid = max(0.001, yes_price - spread)`
  - `NO_bid = max(0.001, no_price - spread)`
- Posts limit orders (BUY) at those lower prices on **both** sides simultaneously.
- Base stake per side = `min(bankroll × 5%, $10)` — fixed.
- Max positions controlled by `mm_max_positions` (default 3).
- If someone sells into your bid, you've bought below fair value. On resolution:
  - Winning token pays 1 USDC → profit = 1 − bid_price per token
  - Losing token pays 0 → loss = bid_price per token
- The strategy profits when the bid is below the true probability — the spread
  acts as a buffer.

### Martingale recovery (optional)

When `martingale_recovery: true`, each side's stake grows independently based on
its own streak counter:
- `stake_a = base_stake × factor ^ streak_a`
- `stake_b = base_stake × factor ^ streak_b`

The YES side (streak_a) only grows after consecutive YES losses; the NO side only
grows after consecutive NO losses. They do not cross-contaminate.

**Warning:** Market making is designed for low-risk passive spread collection.
Adding martingale turns it into a directional bet with compounding leverage.
Only enable if you're comfortable with the increased tail risk.

### Key config parameters

| Parameter | Default | Effect |
|---|---|---|
| `mm_spread` | 0.02 | Spread below market per side (e.g., 0.02 = 2¢) |
| `mm_max_positions` | 3 | Max markets to market-make simultaneously |
| `recovery_factor` | 2.0 | Only used if `martingale_recovery: true` |

### Risk profile

- **Volatility:** Low per position (bought at discount)
- **Tail risk:** Low with recovery OFF — fixed small stakes, no compounding.
  With recovery ON, tail risk is moderate.
- **Best for:** Passive spread collection in liquid markets. Highest win rate but
  smallest per-bet profit.

### Minimum capital required

| Bankroll | Per-side stake (5%) | Max positions | Total committed | Buffer (2×) | Recommended minimum |
|---|---|---|---|---|---|
| $50 | $2.50 | 3 | $15 | $30 | **$50** |
| $100 | $5.00 | 3 | $30 | $60 | **$100** |
| $200 | $10.00 (capped) | 3 | $60 | $120 | **$150** |
| $500 | $10.00 (capped) | 3 | $60 | $120 | **$150** (cap bound) |

**Rule of thumb:** The per-side stake is capped at $10, so bankroll above $200
doesn't increase per-position size. More capital instead allows more concurrent
positions (raise `mm_max_positions`) and absorbs loss streaks better.

### Realistic income projections

**Key reality:** On Polymarket, both sides of a market making position rarely fill
simultaneously on the same cycle. Typically only *one* side gets hit — making each
position effectively a directional bet bought at a discount. This means variance
is higher than a pure spread-collection model would suggest.

**Per-fill math** ($5 at 2¢ below market, single side fills):
- Buy YES at $0.60 (market at $0.62) → 8.33 YES tokens
- YES wins: $8.33 = **+$3.33**  |  NO wins: $0 = **−$5.00**
- Break-even true probability: 60% (matches bid price)
- If market is efficient (true P ≈ 62%), EV per fill ≈ **+$0.16 (3.2% edge)**

| Bankroll | Per side | Fills/day (est.) | Monthly (con.) | Monthly (opt.) | ROI/mo |
|---|---|---|---|---|---|
| **$100** | $5 | 1–3 | **$5–$12** | $15–$30 | 5–12% |
| **$500** | $10 (cap) | 3–6 | **$25–$60** | $60–$120 | 5–12% |
| **$1,000** | $10 (cap) | 6–10 | **$50–$100** | $120–$240 | 5–10% |
| **$2,000** | $10 (cap) | 10–15 | **$100–$200** | $200–$400 | 5–10% |

**Why returns compress at higher bankrolls:** The per-side stake caps at $10.
Above $200, more capital means *more positions*, not *larger positions*. At $2,000
you'd run 10–15 concurrent positions, which requires finding enough qualifying
markets — a constraint in reality.

**Variance warning:** A 3–4 loss streak at $500 represents a $150–$200 drawdown
(15–20% of account). MM is not "free money" — it's a small-edge repeated bet
with real risk. Loss streaks happen.

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
| **Minimum bankroll** | **$500–1,000** | **$50–100** | **$50–100** |
| **Monthly income ($100 acct)** | N/A (too risky) | $3–10 | $5–12 |
| **Monthly income ($1,000 acct)** | $50–150 | $30–100 | $50–100 |

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

## Martingale Recovery — Cross-Strategy Summary

| Strategy | Default | Effect when ON |
|---|---|---|
| **Hedge** | Always ON (built-in) | `stake = base × factor^streak` per side independently |
| **Single (Kelly)** | OFF | Kelly stake × `factor^streak` for chosen side |
| **Market Making** | OFF | Per-side stake × `factor^streak_a` (YES) or `factor^streak_b` (NO) independently |

The `martingale_recovery` toggle, `recovery_factor`, and `max_steps` are shared across
all three strategies. When OFF for Single/MM, they behave without compounding.

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
| `martingale_recovery` | `false` | Enable martingale compounding for Single/MM |
| `recovery_factor` | `2.0` | Multiplier per consecutive loss (when recovery is on) |

---

## Roadmap — Getting Started with $100

### Step 1: Fund the EOA

Send **$100 USDC** on Polygon mainnet to EOA:
```
0xf6B58dE5Cb1c736C3af6cff1e2817B4F2A84a344
```
The **deposit wallet** (`POLYMARKET_FUNDER_ADDRESS`) stays at its current value:
```
0x74Ba73A15F217C82bC57fFE92A9ba06e1CB6eF69
```
These are two different wallets and both are needed. Do not change the funder address.

EOA already has ~$7.90 MATIC — enough for gas.

### Step 2: Set environment on Render

| Variable | Value |
|---|---|
| `POLYMARKET_PRIVATE_KEY` | Private key for `0xf6B58d...` (sync: false) |
| `POLYMARKET_FUNDER_ADDRESS` | `0x74Ba73A15F217C82bC57fFE92A9ba06e1CB6eF69` |
| `POLYMARKET_USE_TOR` | `true` |

### Step 3: Configure bot

1. Go to **`https://investpal-bot.onrender.com`** → Bot tab
2. Strategy → **Single Direction (Kelly)** (fields auto-populate)
3. Bot Mode → **Simulation**
4. Click **Save Bot Config**, then enable the bot

### Step 4: Run simulation for 1 week

Let the bot cycle every 4 hours. Check:
- Does it find markets with edge > 5%?
- What's the simulated win rate?
- Are there any 403 geo-block errors in the log?

### Step 5: Flip to Live

If simulation looks consistent:
1. Change Bot Mode → **Live**
2. Save and enable

The auto-fund system pushes $2 from EOA → deposit wallet on the first cycle, then top-ups as needed.

### Step 6: Revisit

After 2–4 weeks of live trading:
- Review P&L and drawdown
- Adjust `kelly_fraction` or `min_edge` if needed
- Once bankroll hits $300–500, consider scaling to 2 concurrent positions or trying Hedge
- Revisit this guide for the next level
