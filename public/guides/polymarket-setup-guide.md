# Polymarket Setup Guide â€” InvestPal

## Overview

Polymarket is the largest decentralized prediction market platform on Polygon. The InvestPal Polymarket Engine automates trading with a **martingale hedge strategy** â€” simultaneously betting both YES and NO on mispriced markets to profit from odds imbalances.

---

## Step 1: Create a Polymarket Account

1. **Visit** https://polymarket.com and click "Sign Up"
2. **Connect Wallet or Email** â€” MetaMask / WalletConnect, or email
3. **Verify your email** and set up 2FA (recommended)
4. **Complete your profile** with a username

### Referral Program
- **10%** of net trading fees from direct referrals
- **5%** from indirect referrals
- Paid daily in pUSD
- Requires **$10,000+ lifetime trading volume** to qualify
- Use our referral link: **https://polymarket.com/?r=Investpal**

---

## Step 2: Fund Your Wallet with USDC

| Asset | Purpose | Minimum |
|-------|---------|---------|
| **USDC** | Trading capital | 100 USDC |

1. **Get a Polygon wallet** (MetaMask, Rabby)
2. **Add Polygon Mainnet** (Chain ID: 137)
3. **Buy USDC** from an exchange (Binance, Coinbase, Kraken) â€” withdraw on Polygon network
4. **Test first** â€” always send a small test amount

---

## Step 3: Configure Wallet in InvestPal

1. **Export private key** from MetaMask (Account Details â†’ Export Private Key)
2. **Open InvestPal** â†’ Polymarket tab â†’ Settings
3. **Enter private key** (0x-prefixed hex or 12+ word seed phrase)
4. **Verify** â€” "Trading Enabled: Yes" should show

---

## Step 4: Understanding the Strategy

Hedged martingale â€” bets on both YES and NO simultaneously. Each loss multiplies the stake by the recovery factor. Profit comes from odds imbalance.

### Default Parameters
- **base_stake**: 0.1 USDC
- **factor**: 2.1-2.5
- **max_steps**: 6
- **bankroll**: 100 USDC

---

## Step 5: Configure & Run the Bot

1. **Bot Config** â†’ `bot_mode: "simulation"`, `bot_enabled: true`, `base_stake: 0.1`
2. **Monitor** for 24-48 hours
3. **Switch to Live** â†’ `bot_mode: "live"`
4. **Start small** â€” 0.1 USDC base stake

### Safety
- Test in simulation first
- Ensure bankroll covers 6+ consecutive losses
- Use a dedicated trading wallet

---

## Referral Link

Use our referral link when signing up: **https://polymarket.com/?r=Investpal**
