# Polymarket Setup Guide — InvestPal

## Overview

Polymarket is the largest decentralized prediction market platform on Polygon. The InvestPal Polymarket Engine automates trading with a **martingale hedge strategy** — simultaneously betting both YES and NO on mispriced markets to profit from odds imbalances.

---

## Step 1: Create a Polymarket Account

1. **Visit** https://polymarket.com and click "Sign Up"
2. **Connect Wallet or Email** — MetaMask / WalletConnect, or email (easier for beginners)
3. **Verify your email** and set up 2FA (recommended)
4. **Complete your profile** with a username

### Referral Program

Polymarket offers a referral program:
- **10%** of net trading fees from direct referrals
- **5%** from indirect referrals (your referrals' referrals)
- Paid daily in pUSD, credited to your Polymarket account
- Requires **,000+ lifetime trading volume** to qualify
- Use your referral link: https://polymarket.com/ref/yourname

---

## Step 2: Fund Your Wallet with USDC & MATIC

### Requirements
| Asset | Purpose | Minimum |
|-------|---------|---------|
| **MATIC** | Gas fees for every transaction | 20-50 MATIC (~-30) |
| **USDC** | Trading capital | 200-500 USDC |

### How to Fund

1. **Get a Polygon wallet** (MetaMask, Rabby, OKX Wallet)
2. **Add Polygon Mainnet** (Chain ID: 137)
   - RPC: https://polygon-rpc.com
3. **Buy MATIC** from a centralized exchange (Binance, Coinbase, Kraken)
4. **Buy USDC** — same exchange, send on Polygon network
5. **Withdraw to your wallet** — always test with a small amount first

### Alternative: Bridge from Ethereum
- Use https://bridge.polygon.technology (official, 15-30 min)
- Use Stargate or Circle CCTP for faster bridging

---

## Step 3: Configure Your Wallet in InvestPal

1. **Get your private key**
   - MetaMask: Account Details → Export Private Key
   - Store it securely — never share it
2. **Open InvestPal** → Polymarket tab → Settings
3. **Enter private key** (0x-prefixed hex or 12+ word seed phrase)
4. **Enter wallet address** (funder address) — optional
5. **Verify** — "Trading Enabled: Yes" + wallet balances should show

---

## Step 4: Understanding the Strategy

The bot uses a **dual-sided martingale hedge**:

| Concept | How It Works |
|---------|-------------|
| Hedge | Bets on BOTH YES and NO simultaneously |
| Streaks | Tracks losing streaks independently for each side |
| Recovery | Each loss multiplies stake by factor (default 2.1-2.5x) |
| Profit | Comes from odds imbalance, not directional prediction |

### Key Parameters
- **base_stake**: Starting stake per side (default: 10 USDC)
- **factor**: Martingale multiplier (default: 2.5)
- **max_steps**: Cap on streak multiplier (default: 6)
- **bankroll**: Maximum capital allocated
- **balance_filter**: Max odds difference for suggestions (0.30)

---

## Step 5: Configure & Run the Bot

1. **Open Bot Config** in the Polymarket tab
2. **Set to Simulation first**: ot_mode: "simulation", ot_enabled: true
3. **Monitor** for 24-48 hours — check logs, PnL, streaks
4. **Switch to Live**: change ot_mode to "live"
5. **Start small**: 5-10 USDC base stake, 1 concurrent position

### Important Safety Rules
- Risk only what you can afford to lose
- Ensure bankroll can handle 6+ consecutive losses
- Martingale stakes grow exponentially during streaks
- Test in simulation for at least 24 hours before going live

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Polymarket blocked | Use VPN outside US/restricted regions |
| Order won't place | Check MATIC balance for gas + USDC balance + token approval |
| Bot not running | Ensure bot_enabled=true, wait for market scan |
| Empty cache | Wait 10 min for next scan or click "Refresh Markets" |
| Reset needed | Use "Reset" button — clears state, not your wallet |

---

## Architecture

`
┌─────────────────────────────────────────────────┐
│                InvestPal App                     │
│  ┌───────────────────────────────────────────┐   │
│  │      Polymarket Tab (iframe wrapper)      │   │
│  │   ┌─────────────────────────────────┐    │   │
│  │   │  Python Backend (port 8090)      │    │   │
│  │   │  ├─ Market Scanner (10 min)      │    │   │
│  │   │  ├─ Bot Engine (60s cycles)      │    │   │
│  │   │  ├─ CLOB Order Placement         │    │   │
│  │   │  └─ Wallet Integration           │    │   │
│  │   └─────────────────────────────────┘    │   │
│  └───────────────────────────────────────────┘   │
│                                                   │
│  Polymarket CLOB API (https://clob.polymarket.com)│
│  Polymarket Gamma API (market data)               │
└─────────────────────────────────────────────────┘
`

---

## Security Best Practices

1. **Private key** stays server-side, used only for CLOB order signing
2. **Use a dedicated trading wallet** — not your main holdings
3. **Set wallet spending limits** via USDC approval limits
4. **Monitor bot activity** regularly
5. **Never share your private key or seed phrase**