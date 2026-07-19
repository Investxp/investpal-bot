# InvestPal Polymarket Trade Engine

Autonomous sports prediction market trading on Polymarket using V2 POLY_1271 (deposit wallet) orders.

## Quick Start

```bash
# 1. Install dependencies (one-time)
python setup.py install

# 2. Configure your wallet
python setup.py configure

# 3. Verify everything works
python setup.py check

# 4. Try demo mode ($10,000 virtual, no real funds)
python setup.py demo

# 5. Go live!
python setup.py start
```

Open **http://localhost:8090** after starting.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Modes of Operation](#modes-of-operation)
5. [First-Time User Walkthrough](#first-time-user-walkthrough)
6. [Manual Trading](#manual-trading)
7. [Automated Trading](#automated-trading)
8. [Funding Your Wallet](#funding-your-wallet)
9. [Testnet / Demo Mode](#testnet--demo-mode)
10. [Monitoring & Recovery](#monitoring--recovery)
11. [Architecture](#architecture)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Python 3.10+** installed
- **Polygon wallet** (MetaMask or similar) with:
  - MATIC for gas (~$1–2)
  - Native USDC (0x3c499c...) for trading
- **Polymarket account** with:
  - Deposit wallet created (Polymarket UI → Wallet → Deposit Wallet)
  - Builder API keys (Polymarket → Settings → Developer → API Keys)

---

## Installation

### Step 1: Get the code
```bash
cd polymarket-backend
```

### Step 2: Install dependencies
```bash
python setup.py install
```

This installs: `requests`, `eth-account`, `py-clob-client-v2`, `eth-abi`, `python-dotenv`.

### Step 3: Configure
```bash
python setup.py configure
```

The wizard will ask for:
- **Private key** — Your Polygon wallet private key (from MetaMask)
- **Funder address** — Your Polymarket deposit wallet address
- **Builder API key/secret/passphrase** — From polymarket.com/settings
- **Chain ID** — 137 = Mainnet, 80001 = Mumbai testnet
- **Proxy** — Optional, for restricted regions

### Step 4: Verify
```bash
python setup.py check
```

This tests:
- Dependency imports
- RPC connectivity (Polygon)
- Gamma API (market data)
- CLOB API (order book)
- Wallet balances

---

## Configuration Reference

All settings are in `.env`:

| Variable | Required | Description |
|---|---|---|
| `POLYMARKET_PRIVATE_KEY` | ✅ Yes | Polygon wallet private key (0x...) |
| `POLYMARKET_FUNDER_ADDRESS` | ✅ Yes | Deposit wallet address (for POLY_1271) |
| `POLYMARKET_BUILDER_KEY` | ✅ Yes | Builder API key from Polymarket |
| `POLYMARKET_BUILDER_SECRET` | ✅ Yes | Builder API secret |
| `POLYMARKET_BUILDER_PASSPHRASE` | ✅ Yes | Builder API passphrase |
| `CHAIN_ID` | Optional | 137 (Mainnet) or 80001 (Testnet) |
| `POLYMARKET_PROXY` | Optional | HTTP/SOCKS5 proxy URL |
| `POLYMARKET_USE_TOR` | Optional | Set "true" for Tor routing |
| `POLYMARKET_RELAY` | Optional | Override CLOB endpoint |
| `PORT` | Optional | Server port (default: 8090) |

---

## Modes of Operation

| Mode | Command | Real Funds? | Market Data | Execution |
|---|---|---|---|---|
| **Demo** | `python setup.py demo` | ❌ No | ✅ Live | Virtual ledger ($10K) |
| **Testnet** | `python setup.py testnet` | ❌ No (test tokens) | ⚠ Staging | Mumbai testnet |
| **Live** | `python setup.py start` | ✅ Yes | ✅ Live | Real CLOB orders |

### Demo Mode
- $10,000 virtual bankroll
- Uses real market data from Polymarket
- Trades are recorded in a virtual ledger
- Perfect for testing strategies without risk
- All buttons and UI work exactly like live mode

### Testnet Mode
- Connects to Polygon Mumbai testnet
- Uses staging CLOB: `https://clob-staging.polymarket.com`
- Requires test MATIC + test USDC (from faucets)
- All contract addresses and chain IDs switch automatically

### Live Mode
- Real funds, real execution
- CLOB V2 + POLY_1271 (deposit wallet) orders
- Auto-funding (detects low pUSD → swaps → wraps → transfers)

---

## First-Time User Walkthrough

### 1. Fund Your EOA Wallet

Send to your wallet address (shown in `setup.py check` output):
- **MATIC**: $2–5 for gas
- **Native USDC** (0x3c499c...): $10–50 for trading

Ensure you send **native USDC** (not USDC.e). Native USDC on Polygon starts with `0x3c499c...`.

### 2. Create a Polymarket Deposit Wallet

1. Go to https://polymarket.com
2. Connect your wallet
3. Click **Wallet** → **Deposit Wallet** → **Create**
4. Note the deposit wallet address (0x...)
5. Set it as `POLYMARKET_FUNDER_ADDRESS` in `.env`

### 3. Get Builder API Keys

1. Go to https://polymarket.com/settings
2. Click **Developer** → **API Keys**
3. Generate new key
4. Copy key, secret, and passphrase to `.env`

### 4. Run Setup Check
```bash
python setup.py check
```
Verify all ✅ checks pass.

### 5. Start Demo Mode
```bash
python setup.py demo
```
Open http://localhost:8090 — you'll see $10,000 virtual bankroll. Explore the Bot tab, enable the bot, and watch it trade on simulated markets.

### 6. Fund the Deposit Wallet
```bash
# Quick: deposit $5 from EOA → deposit wallet
curl -X POST http://localhost:8090/api/polymarket/fund-deposit-wallet \
  -H "Content-Type: application/json" \
  -d '{"amount": 5}'
```

### 7. Place Your First Live Order
Via the web UI:
1. Go to **Polymarket Feed** tab
2. Click any market with token IDs
3. Click **Trade Live (A)** or **Trade Live (B)**
4. Set size and confirm

Or via API:
```bash
curl -X POST http://localhost:8090/api/polymarket/order/poly1271 \
  -H "Content-Type: application/json" \
  -d '{"token_id":"278256...","side":"BUY","price":0.5,"size_usdc":10}'
```

---

## Manual Trading

### Via Web UI

1. **Polymarket Feed tab** — Browse live sports markets
2. Click any market row → loads into **Trade Engine** panel
3. Click **Trade Live (A)** or **Trade Live (B)** buttons
4. Set order size in the modal popup
5. Confirm → order placed via CLOB V2

### Via API

**Place BUY order (POLY_1271):**
```bash
curl -X POST http://localhost:8090/api/polymarket/order/poly1271 \
  -H "Content-Type: application/json" \
  -d '{"token_id":"TOKEN_ID","side":"BUY","price":0.5,"size_usdc":10}'
```

**Place SELL order:**
```bash
curl -X POST ... -d '{"token_id":"TOKEN_ID","side":"SELL","price":0.5,"size_usdc":10}'
```

**Cancel order:**
```bash
curl -X POST http://localhost:8090/api/polymarket/cancel \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ORDER_ID"}'
```

**Check balance & allowance:**
```bash
curl http://localhost:8090/api/polymarket/balance-allowance
```

**View open orders:**
```bash
curl http://localhost:8090/api/polymarket/orders
```

---

## Automated Trading

### Bot Tab Configuration

Open http://localhost:8090 → **Bot** tab

| Setting | Description | Recommended |
|---|---|---|
| **Base Stake** | Starting bet size (USDC) | $10 for demo, $0.10–1 for live |
| **Recovery Factor** | Martingale multiplier after loss | 2.0 |
| **Max Concurrent** | Max simultaneous bets | 3 |
| **Bot Bankroll** | Virtual/live bankroll tracker | Match your real wallet |
| **Mode** | Simulation vs Live | Start with Simulation |
| **Order Type** | Standard (EOA) vs POLY_1271 | POLY_1271 (uses deposit wallet) |
| **Cycle Interval** | How often bot checks for new bets | 60s (test) / 4h (live) |
| **Auto-Fund** | Auto top-up deposit wallet when low | ON |

### Trading Strategy

The bot uses **double-sided hedged recovery**:
- Bets on **both** YES (A) and NO (B) outcomes
- After a loss on A, increases A stake (martingale recovery)
- After a loss on B, increases B stake
- A win resets that side's streak
- Natural hedge: one side always wins if the market resolves

### Enabling Automation

1. Set **Mode** to `Simulation` first
2. Set **Order Type** to `POLY_1271`
3. Set **Auto-Fund** to ON
4. Click **Save Bot Config**
5. Toggle bot to **ENABLED** (the switch turns green)
6. The bot starts running on the configured interval

When ready for live:
1. Set **Mode** to `Live`
2. Ensure wallet has sufficient funds
3. Run `python setup.py check` to verify balance

---

## Funding Your Wallet

### How Funds Flow

```
EOA Wallet
  │
  ├── Native USDC (0x3c499c...) → [Paraswap] → USDC.e (0x2791Bca1...)
  │                                                  │
  │                                                  ▼
  │                                         [CollateralOnramp]
  │                                                  │
  │                                                  ▼
  │                                              pUSD
  │                                                  │
  │                                                  ▼
  │                                         Deposit Wallet
  │                                         (POLY_1271 orders)
  │
  └── MATIC ──────────────────────→ Gas (for transactions)
```

### Deposit Methods

| Method | API Endpoint | Description |
|---|---|---|
| **Auto** | Bot Auto-Fund | Bot checks balance and funds automatically |
| **Full setup** | `POST /api/polymarket/fund-deposit-wallet` | Swap → Wrap → Transfer in one call |
| **Direct USDC.e** | `POST /api/polymarket/deposit/usdc-e` | If you already have USDC.e |
| **MATIC → USDC** | `POST /api/polymarket/deposit/matic` | Swap MATIC to USDC then fund |
| **Manual** | Individual steps below | |

### Manual Funding Steps

```bash
# 1. Swap Native USDC → USDC.e (via Paraswap)
curl -X POST http://localhost:8090/api/polymarket/deposit/usdc-e \
  -H "Content-Type: application/json" -d '{"amount": 5}'

# 2. Or swap MATIC → USDC
curl -X POST http://localhost:8090/api/polymarket/deposit/matic \
  -H "Content-Type: application/json" -d '{"amount": 5}'
```

### Withdrawal Methods

| Method | API Endpoint | Description |
|---|---|---|
| **Withdraw pUSD** | `POST /api/polymarket/withdraw/pusd` | Send pUSD from deposit wallet to any address |
| **Withdraw USDC.e** | `POST /api/polymarket/withdraw/usdce` | Unwrap pUSD → USDC.e back to EOA |

```bash
# Withdraw pUSD to any address
curl -X POST http://localhost:8090/api/polymarket/withdraw/pusd \
  -H "Content-Type: application/json" \
  -d '{"amount": 5, "to": "0xYourAddress"}'

# Unwrap pUSD → USDC.e back to EOA
curl -X POST http://localhost:8090/api/polymarket/withdraw/usdce \
  -H "Content-Type: application/json" -d '{"amount": 5}'
```

---

## Testnet / Demo Mode

### Demo Mode ($10,000 Virtual)
```bash
python setup.py demo
```
- No real funds at risk
- Uses real Polymarket market data
- Trades execute on a virtual ledger
- Full UI works identically to live mode
- Perfect for strategy testing

### Testnet Mode (Mumbai)
```bash
python setup.py testnet
```
- Connects to Polygon Mumbai
- Uses staging CLOB
- Requires test MATIC + test USDC

Getting testnet tokens:
```bash
# MATIC faucet
https://faucet.polygon.technology/

# USDC faucet
https://www.circle.com/en/usdc-multichain
```

Testnet addresses:
- Mumbai RPC: `https://polygon-mumbai.gateway.tenderly.co`
- CLOB staging: `https://clob-staging.polymarket.com`
- Chain ID: `80001`
- Exchange: Different on testnet (check Polymarket docs)

---

## Monitoring & Recovery

### Dashboard Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/dashboard` | Full system status (positions, balance, bot state) |
| `GET /api/health` | Server health + cache age + key status |
| `GET /api/positions` | Position manager — all open/closed positions |
| `GET /api/orders` | Order history |
| `GET /api/bot/health` | Bot health + deposit wallet balance |

### Auto-Recovery

The system automatically:
- ✅ Retries failed RPC calls (3 attempts)
- ✅ Rotates User-Agent on 403 errors
- ✅ Detects low deposit wallet balance and auto-funds
- ✅ Logs all errors for debugging
- ✅ Continues running on individual cycle failures

### Manual Recovery

```bash
# Check health
curl http://localhost:8090/api/health

# Reset bot state
curl -X POST http://localhost:8090/api/reset

# Force market refresh
curl -X POST http://localhost:8090/api/polymarket/refresh \
  -H "Content-Type: application/json" -d '{"enrich": true}'
```

---

## Architecture

```
polymarket-backend/
├── setup.py              # One-command setup & launch
├── server.py             # Flask-like HTTP server
├── run.py                # Legacy entry point
├── requirements.txt      # Dependencies
├── .env                  # Configuration (never commit)
├── .env.example          # Configuration reference
├── core/
│   ├── polymarket.py     # All Polymarket API + on-chain logic
│   ├── bot.py            # Automatic trading bot with recovery
│   ├── position_manager.py  # Order & position tracking
│   ├── balance_manager.py   # Balance check & top-up history
│   ├── martingale.py     # Martingale recovery calculator
│   └── trade_engine.py   # Trade engine helpers
├── web/
│   └── static/
│       └── index.html    # Full dashboard UI
└── data/                 # Runtime data (cache, state, logs)
    ├── poly_cache.json   # Market data cache
    ├── bot_state.json    # Bot runtime state
    ├── positions.json    # Order & position tracking
    └── balance_log.json  # Balance check history
```

### Data Flow

```
Polymarket Gamma API ──→ scan_all() ──→ poly_cache.json
                                              │
                                         index.html (UI)
                                              │
User clicks "Trade" ──→ place_order_poly1271() ──→ CLOB API
                                              │
                                         position_manager.py
                                              │
                                         Market resolves ──→ P&L recorded
```

---

## Troubleshooting

### "403 Forbidden" from CLOB/Gamma
- You're likely on a cloud/VPS IP. Run locally on a residential connection.
- Configure a proxy: `POLYMARKET_PROXY=socks5h://127.0.0.1:9050`
- Or use Tor: set `POLYMARKET_USE_TOR=true`

### "not enough balance" when placing order
- Deposit wallet pUSD balance is below the order minimum ($1).
- Run fund endpoint or enable Auto-Fund in bot config.
- Check: `curl http://localhost:8090/api/polymarket/deposit-status`

### "price breaks minimum tick size rule"
- CLOB requires prices to be multiples of 0.0025.
- The app now auto-rounds prices, but if you see this, update to the latest code.

### "signature does not match order hash"
- The EIP-712 domain or struct doesn't match what the CLOB expects.
- Ensure you're using `py-clob-client-v2==1.1.0` and have the latest code.

### "WALLET batch" fails
- Builder API credentials may be wrong.
- Verify: `POLYMARKET_BUILDER_KEY`, `POLYMARKET_BUILDER_SECRET`, and `POLYMARKET_BUILDER_PASSPHRASE`

### Server won't start (port in use)
```bash
# Find process using port 8090
netstat -ano | findstr :8090

# Kill it
taskkill /PID <PID> /F
```

### Auto-fund fails with "EOA USDC balance insufficient"
- Your main wallet doesn't have enough native USDC.
- Send native USDC (0x3c499c...) to your EOA address.

---

## API Reference

### Trading
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/polymarket/order` | Place standard V2 order |
| POST | `/api/polymarket/order/poly1271` | Place POLY_1271 order |
| POST | `/api/polymarket/cancel` | Cancel order |
| GET | `/api/polymarket/orders` | List open orders |
| GET | `/api/polymarket/orderbook` | Get order book |
| GET | `/api/polymarket/price` | Get CLOB price |

### Funding
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/polymarket/fund-deposit-wallet` | Full fund (swap→wrap→transfer) |
| POST | `/api/polymarket/deposit/usdc-e` | Deposit USDC.e directly |
| POST | `/api/polymarket/deposit/matic` | Swap MATIC→USDC→fund |
| POST | `/api/polymarket/withdraw/pusd` | Withdraw pUSD |
| POST | `/api/polymarket/withdraw/usdce` | Unwrap pUSD→USDC.e |
| POST | `/api/polymarket/approve-token-onramp` | Approve USDC.e for onramp |
| POST | `/api/polymarket/wrap-pusd` | Wrap USDC.e→pUSD |
| POST | `/api/polymarket/transfer-pusd` | Transfer pUSD |

### Bot & Positions
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Full system dashboard |
| GET | `/api/health` | Server health |
| GET | `/api/positions` | Position manager |
| GET | `/api/orders` | Order history |
| POST | `/api/bot/enable` | Enable/configure bot |
| POST | `/api/bot/config` | Update bot config |
| POST | `/api/bot/run` | Run one cycle |
| POST | `/api/bot/reset` | Reset bot state |

### Info
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/polymarket/balance-allowance` | CLOB balance & allowance |
| GET | `/api/polymarket/deposit-status` | Deposit wallet status |
| GET | `/api/polymarket/positions` | Polymarket positions |
| GET | `/api/polymarket/test-connection` | Test all endpoints |
| GET | `/api/wallet/balance` | EOA wallet balances |
| GET | `/api/env` | Current env config |

---

## License

InvestPal — Private project for automated Polymarket trading.
