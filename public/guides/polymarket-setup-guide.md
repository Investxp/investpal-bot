# Polymarket Setup Guide â€” InvestPal

## Overview

Polymarket is the largest decentralized prediction market platform on Polygon. The InvestPal Polymarket Engine automates trading with a **martingale hedge strategy** â€” simultaneously betting both YES and NO on mispriced markets to profit from odds imbalances.

---

## Step 1: Create a Polymarket Account

1. **Visit** https://polymarket.com and click "Sign Up"
2. **Connect Wallet or Email** â€” MetaMask / WalletConnect, or email (easier for beginners)
3. **Verify your email** and set up 2FA (recommended)
4. **Complete your profile** with a username

### Referral Program

Polymarket offers a referral program:
- **10%** of net trading fees from direct referrals
- **5%** from indirect referrals (your referrals' referrals)
- Paid daily in pUSD, credited to your Polymarket account
- Requires **$10,000+ lifetime trading volume** to qualify
- Use our referral link: `https://polymarket.com/?r=Investpal`

---

## Step 2: Fund Your Wallet with USDC & MATIC

### Requirements
| Asset | Purpose | Minimum |
|-------|---------|---------|
| **MATIC** | Gas fees for every transaction | 20-50 MATIC (~$10-30) |
| **USDC** | Trading capital | 200-500 USDC |

### How to Fund

1. **Get a Polygon wallet** (MetaMask, Rabby, OKX Wallet)
2. **Add Polygon Mainnet** (Chain ID: 137)
3. **Buy MATIC** from exchange (Binance, Coinbase, Kraken) â€” withdraw to Polygon wallet
4. **Buy USDC** â€” same exchange, send on Polygon network
5. **Test first** â€” always send a small amount first

---

## Step 3: Configure Wallet in InvestPal

1. **Export private key** from MetaMask (Account Details â†’ Export Private Key)
2. **Open InvestPal** â†’ Polymarket tab â†’ Settings
3. **Enter private key** (0x-prefixed hex or 12+ word seed phrase)
4. **Enter wallet address** (optional â€” for position tracking)
5. **Verify** â€” "Trading Enabled: Yes" should show

---

## Step 4: Understanding the Strategy

The bot uses a **dual-sided martingale hedge** â€” bets on both YES and NO simultaneously. Tracks losing streaks independently per side. Each loss multiplies stake by factor (default 2.5x). Profit comes from odds imbalance.

### Key Parameters
- **base_stake**: Starting stake per side (default: 10 USDC)
- **factor**: Martingale multiplier (default: 2.5)
- **max_steps**: Cap on streak multiplier (default: 6)
- **bankroll**: Maximum capital allocated

---

## Step 5: Configure & Run the Bot

1. **Bot Config** â†’ set `bot_mode: "simulation"`, `bot_enabled: true`
2. **Monitor** for 24-48 hours (check logs, PnL, streaks)
3. **Switch to Live** â†’ `bot_mode: "live"`
4. **Start small** â€” 5-10 USDC base stake, 1 concurrent position

### Safety
- Martingale stakes grow exponentially â€” ensure bankroll covers 6+ losses
- Test in simulation first
- Use a dedicated trading wallet

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Polymarket blocked | Use VPN outside US/restricted regions |
| Order won't place | Check MATIC balance + USDC balance + token approval |
| Bot not running | Ensure bot_enabled=true, wait for market scan |
| Empty cache | Wait 10 min or click "Refresh Markets" |

---

## Referral Link

Use our referral link when signing up: **https://polymarket.com/?r=Investpal**
