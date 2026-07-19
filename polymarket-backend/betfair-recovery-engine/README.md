# Betfair Linear Recovery Engine — v1

## What's built and validated (no Betfair account needed yet)

- `models.py` — data model: LineConfig, LineState, StakeDecision, BetRecord
- `stake_calculator.py` — commission-aware recovery stake math, with odds-floor,
  liquidity, confidence, and bankroll-cap rejection rules
- `recovery_engine.py` — state machine for SINGLE (A-recovers-A) and HYBRID_AI
  (AI picks the side every time, engine only sizes the stake) modes, plus the
  max-stage kill-switch and manual reset
- `db.py` — SQLite persistence: line configs, line state, full bet audit log
- `betfair_client.py` — `LiveBetfairClient` (real wrapper around
  `betfairlightweight`, not yet wired to a market/runner mapping) and
  `DryRunBetfairClient` (synthetic odds/fills, used for testing)
- `simulate.py` — runs both modes through 40 synthetic events each and asserts
  the core invariants: stage caps hold, recovery wins always clear
  cumulative_loss + target_margin net of commission, rejected bets don't
  corrupt state. **This runs today with `python3 simulate.py` — no account
  needed.**

Deferred to phase 2 (per our scoping): hedge/green-up mode, cross-account
mirroring, multiple recovery strategies beyond martingale, cross-line
floating-loss recovery, Telegram alerts, backtesting against real historical
odds (simulate.py currently uses synthetic odds, not historical data).

## What I need from you before this can go live

1. **A Betfair account**, with eligibility confirmed directly on their signup
   flow for your actual location — their licensed footprint doesn't clearly
   include Kenya based on what I found, so this needs to be checked first.
   If it's not eligible, tell me and I'll adapt `betfair_client.py` for
   Smarkets or Matchbook instead (same architecture, different SDK).

2. **An Application Key**, requested from your account once it exists:
   - *Delayed key* — free, auto-issued, fine for early wiring/testing of
     read-only endpoints, but odds data is minutes stale so it's not usable
     for real execution.
   - *Live key* — also free, but Betfair requires the account to have placed
     at least one real-money bet historically before they'll issue it. So
     the order is: open account → place one manual bet on the website →
     request live key.

3. **A login method decision**:
   - *Interactive* (username + password sent with each session) — simplest
     to start with, but the session token expires daily and needs refresh.
   - *Certificate-based* — recommended for an unattended bot. Requires
     generating a self-signed SSL cert/key pair and uploading the public
     cert to your account's security settings. I can generate the cert if
     you confirm you want this route.

4. **Which market type(s) to start with** — I'd suggest starting with one
   clean two-outcome market (e.g., basketball Match Odds, no draw possible)
   to keep the A/B mapping unambiguous, then expanding to Asian Handicap or
   Over/Under once the live wiring is proven.

None of the above blocks further development — I can keep building (hedge
mode, multi-strategy support, the dashboard) against the dry-run client. The
only thing actually gated on your credentials is the final wiring of
`LiveBetfairClient.get_quotes` / `place_back_bet` / `settle` and a real test
against the *delayed* key (safe, no execution) before flipping to the live
key.

## Run it

```bash
pip install -r requirements.txt
python3 simulate.py
```

## Watch it live (dashboard)

Three new pieces, all still dry-run/no account needed:

- `live_runner.py` — continuous loop (one synthetic event every 3s for each
  demo line), persisting state to SQLite after *every* bet so the dashboard
  reflects near-real-time progress. Checks for dashboard-issued commands
  (pause/resume/reset) every tick.
- `api_server.py` — small Flask REST API over the same database: line
  status, recent bet history, and pause/resume/reset endpoints. Mirrors the
  bridge-server pattern from your MT5/cTrader setup.
- `dashboard.html` — single-file dashboard (open directly in a browser),
  polls the API every 2s. Shows each line's recovery "staircase" (current
  stage out of max_stage, color-coded), current side, cumulative loss,
  realized PnL, a form-strip of recent win/loss outcomes, and Pause/Resume/
  Reset buttons that actually take effect on the running engine.

Run all three (separate terminals):

```bash
python3 live_runner.py     # terminal 1
python3 api_server.py      # terminal 2
# then open dashboard.html in a browser  # terminal 3 not needed
```

I validated the full loop end-to-end: pausing a line via the dashboard's
API freezes that line's progress immediately while other lines keep
advancing, and resume/reset both take effect on the next tick.

## SX Bet integration (current execution path)

Betfair, Smarkets, BETDAQ, Matchbook, and BetInAsia's BLACK API were all
ruled out (geo-restriction or the API being discontinued). **SX Bet**
(sx.bet) is what we're building against now: a decentralized peer-to-peer
sports exchange on SX Network (a Polygon-adjacent L2). No traditional
country-gated KYC -- you connect a crypto wallet instead of registering
with a regulated entity. Restricted-country lists found during research
named the US and France/Netherlands and their territories; Kenya did not
appear. 0% commission on straight bets. Confirm current terms/jurisdiction
language yourself at sx.bet before relying on this.

`sxbet_client.py` implements the same `BetfairClientBase` interface as
`betfair_client.py` (`get_quotes` / `place_back_bet` / `settle`), so
`RecoveryEngine`, `StakeCalculator`, `db.py`, `api_server.py`, and
`dashboard.html` all work completely unchanged -- only the execution layer
differs.

**What's implemented and unit-tested:**
- Odds conversion between ordinary decimal odds and SX's on-chain
  fixed-point implied-probability format -- round-trip verified for a
  range of odds (1.01 to 10.0), exact to the precision used.
- Client construction and wallet address derivation from a private key.
- Read-side methods (`get_quotes`) following SX's documented REST shape:
  pull a market, pull its open orders, compute best taker price per side
  from existing maker orders, with liquidity sized from remaining order
  size (`totalBetSize - fillAmount`).
- Write-side method (`place_back_bet`) following SX's documented taker-fill
  flow, settlement polling (`settle`) against `/trades`.

**Current Implementation & Setup Status:**
- **EIP-712 Signing (`_sign_fill`)**: Fully implemented in `sxbet_client.py` and validated to generate standard cryptographically valid 65-byte hex signature strings.
- **Metadata Retrieval**: Automatically queries `/metadata` at startup to fetch active network configurations (e.g. `EIP712FillHasher` contract, `domainVersion`).
- **Token Decimals**: Properly scales decimals dynamically (6 for USDC, 18 for other assets).
- **Endpoint Reachability**: Active endpoints validated against `api.toronto.sx.bet` and `rpc-rollup.toronto.sx.technology`.
- **Main Development Wallet**:
  - Address: `0xc0A0c47B4C62112D9AaC1265a59676e59AdA728F`
  - Developer Email: `paul.tutorials.24@gmail.com`
  - Current Balance: **100.00 USDC** (Funded) | **0.20 SX** (Gas funded)
  - Blockchain Explorer: [explorerl2.toronto.sx.technology](https://explorerl2.toronto.sx.technology/address/0xc0A0c47B4C62112D9AaC1265a59676e59AdA728F)

**Suggested next steps:**
1. **Offline Signature / Live Execution**: Run a single manual taker fill on testnet, and confirm `settle()` correctly reads back outcomes from `/trades`.
2. **Wired Runner Testing**: Swap `DryRunBetfairClient` with `SXBetClient(private_key=..., testnet=True)` in `live_runner.py` to test a live 1-USDC recovery cycle on Toronto testnet.


