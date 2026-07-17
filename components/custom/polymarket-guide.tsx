'use client';

import React, { useState } from 'react';
import { X, BookOpen, ExternalLink, Wallet, Settings, Zap, Users, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const sections = [
  {
    id: 'overview',
    icon: BookOpen,
    title: 'Polymarket & InvestPal Overview',
    content: `Polymarket is the largest decentralized prediction market platform, running on Polygon. The InvestPal Polymarket Engine automates trading with martingale hedge strategies â€” betting both YES and NO on mispriced markets to profit from odds imbalances.

The bot continuously scans Polymarket Gamma API for sports markets, detects value opportunities, and places hedged orders via the CLOB (Central Limit Order Book).`
  },
  {
    id: 'create-account',
    icon: Users,
    title: 'Step 1: Create a Polymarket Account',
    content: [
      ['Visit Polymarket', 'Go to https://polymarket.com and click "Sign Up"'],
      ['Connect Wallet or Email', 'Use MetaMask / WalletConnect, or sign up with email (easier for beginners)'],
      ['Verify Email', 'Check your inbox and click the verification link'],
      ['Set Up 2FA (Recommended)', 'Enable two-factor authentication in Security Settings'],
      ['Complete Profile', 'Add a username â€” this is used for your referral link and public profile'],
    ],
    referral: true
  },
  {
    id: 'fund-wallet',
    icon: Wallet,
    title: 'Step 2: Fund Your Polygon Wallet with USDC & MATIC',
    content: [
      ['Get a Polygon Wallet', 'Use MetaMask, Rabby, or any EVM wallet. Add Polygon Mainnet (Chain ID: 137)'],
      ['Buy MATIC (Gas Token)', 'MATIC is required for every transaction (order placement, cancellation, approval). Buy from an exchange (Binance, Coinbase, Kraken) and withdraw to your Polygon wallet. Recommended: 20-50 MATIC minimum.'],
      ['Buy USDC (Trading Capital)', 'USDC is the trading currency on Polymarket. Buy USDC on Polygon network from an exchange and send to your wallet. Minimum recommended: 200-500 USDC to start.'],
      ['Bridge from Ethereum (Alternative)', 'Use the official Polygon Bridge (https://bridge.polygon.technology) or a third-party bridge like Stargate or Circle CCTP. ETH â†’ Polygon usually takes 15-30 minutes.'],
      ['Check Balances', 'Your wallet address and balances can be verified in the InvestPal Polymarket tab â†’ Settings â†’ Wallet Balance. USDC should appear as "USDC" or "USDC.e"'],
    ],
    warning: 'âš ï¸ Never send funds directly from an exchange to Polymarket without first depositing to your own wallet. Always test with a small amount first (5-10 USDC).'
  },
  {
    id: 'configure-wallet',
    icon: Settings,
    title: 'Step 3: Configure Your Wallet in InvestPal',
    content: [
      ['Get Private Key', 'In MetaMask: Account Details â†’ Export Private Key. NEVER share this key with anyone. The InvestPal server uses it only in-memory to sign CLOB orders.'],
      ['Enter Private Key', 'Go to the Polymarket tab â†’ Settings â†’ enter your Polygon private key (0x-prefixed hex or 12+ word seed phrase). Click Save.'],
      ['Enter Funder Address (Optional)', 'Your wallet public address. Used for fetching positions and order history.'],
      ['Verify Connection', 'After saving, the Settings page should show "Trading Enabled: Yes" and display your wallet balances.'],
    ],
    warning: 'âš ï¸ The private key is stored in the .env file on the server and used ONLY to sign CLOB orders via py-clob-client. It is never logged, transmitted, or stored in plain text beyond the encrypted server environment.'
  },
  {
    id: 'martingale-strategy',
    icon: Zap,
    title: 'Step 4: Understand the Martingale Hedge Strategy',
    content: `The bot uses a dual-sided martingale strategy:

â€¢ Bets on BOTH YES and NO simultaneously (hedged position)
â€¢ Tracks two independent losing streaks (streak_a for YES losses, streak_b for NO losses)
â€¢ Each consecutive loss multiplies the stake by the recovery factor (default 2.1x)
â€¢ When the market resolves, you win one side and lose the other
â€¢ Profit comes from odds imbalance (the spread between implied probabilities)

Example (base stake = 10 USDC, factor = 2.1):
  Loss #1: stake 10 USDC each side â†’ total stake 20 USDC
  Loss #2: stake 21 USDC each side â†’ total stake 42 USDC
  Loss #3: stake 44.1 USDC each side â†’ total stake 88.2 USDC
  Win resets that side's streak to 0; the other side's streak increments.

Key parameters:
  â€¢ base_stake: Starting stake per side (default: 10 USDC)
  â€¢ factor: Martingale multiplier per loss (default: 2.1-2.5)
  â€¢ max_steps: Cap on streak multiplier (default: 6)
  â€¢ bankroll: Maximum capital allocated (default: 200-10,000 USDC)
  â€¢ balance_filter: Max odds difference for suggested markets (default: 0.30)`
  },
  {
    id: 'bot-config',
    icon: Settings,
    title: 'Step 5: Configure & Start the Bot',
    content: [
      ['Open Polymarket Tab', 'Navigate to the Polymarket tab in InvestPal'],
      ['Configure Bot Settings', 'Go to Bot Config panel and set: bot_enabled = true, bot_mode = "simulation" (start here!), base_stake = 10, recovery_factor = 2.5, max_concurrent = 1-3'],
      ['Run in Simulation First', 'The bot will scan markets, detect value, and simulate trades. Monitor the log and results for 24-48 hours to verify the strategy works.'],
      ['Switch to Live Mode', 'Once confident in the strategy, change bot_mode to "live". The bot will now place REAL orders on the Polymarket CLOB using your wallet.'],
      ['Monitor Performance', 'Use the Status panel to track: current streak, bankroll, PnL, active bets, and trade history.'],
    ],
    warning: 'âš ï¸ Always test in simulation mode first. Start with small stakes (5-10 USDC) when going live. Martingale strategies can grow stake sizes exponentially during a losing streak â€” ensure your bankroll can handle 6+ consecutive losses.'
  },
  {
    id: 'referral',
    icon: Users,
    title: 'Step 6: Referral Program â€” Earn Passive Income',
    content: [
      ['Eligibility', 'You need $10,000+ in lifetime trading volume on Polymarket to earn referral rewards. You can share your link before hitting this threshold, but rewards only start once you qualify.'],
      ['How It Works', 'You earn 10% of net trading fees from direct referrals and 5% from indirect referrals (your referrals\' referrals). Rewards are paid daily at midnight UTC in pUSD.'],
      ['Referral Window', 'Rewards apply for the first 30 days after a referral signs up, or until they reach Platinum tier (whichever comes first).'],
      ['Get Your Link', 'Visit https://polymarket.com/refer while logged in. Copy your unique referral link (polymarket.com/ref/yourname).'],
      ['Share Your Link', 'Share on social media, in communities, or add to your website. A new user must sign up within 30 days of clicking your link to count.'],
    ],
    note: 'ðŸ’¡ The referral program is managed directly by Polymarket. InvestPal does not take any cut of referral earnings â€” they go 100% to your Polymarket account.'
  },
  {
    id: 'troubleshooting',
    icon: AlertTriangle,
    title: 'Troubleshooting & Tips',
    content: [
      ['Polymarket Blocked in My Region?', 'Polymarket blocks US IPs. Use a VPN if outside permitted regions. Some EU countries may also have restrictions.'],
      ['Order Not Placing?', 'Check: (1) Sufficient MATIC balance for gas, (2) Sufficient USDC balance for stake, (3) USDC approved for spending (needs token approval on first trade).'],
      ['Bot Not Running?', 'Ensure bot_enabled=true in Bot Config. Check the server logs for errors. The market scanner must complete at least one full scan before the bot can trade.'],
      ['Cache Empty?', 'The Polymarket scanner runs every 10 minutes. If cache is empty, wait for the next scan cycle or click "Refresh Markets" in Settings.'],
      ['Gas Fees Too High?', 'Polygon gas fees are typically <$0.01 per transaction. If the network is congested, consider waiting or increasing your gas price. MATIC is the native gas token.'],
      ['How to Reset?', 'Use the "Reset" button in Settings to clear all state, streaks, and tracked picks. This does NOT affect your wallet or on-chain positions.'],
    ]
  }
];

export function PolymarketGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-2 text-xs px-3 py-1.5 h-auto"
        title="Polymarket Setup Guide"
      >
        <BookOpen className="w-3.5 h-3.5" />
        Guide
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl mx-4">
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-bold text-zinc-100">Polymarket Setup Guide</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              {sections.map(section => {
                const Icon = section.icon;
                const isExpanded = expandedSections[section.id] ?? (section.id === 'overview');
                const isTable = Array.isArray(section.content);

                return (
                  <div key={section.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-700/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-semibold text-zinc-200">{section.title}</span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-2.5">
                        {isTable ? (
                          <div className="space-y-2">
                            {(section.content as string[][]).map((row, i) => (
                              <div key={i} className="flex gap-3 text-sm">
                                <span className="text-red-400 font-medium min-w-[160px] shrink-0">
                                  {row[0]}:
                                </span>
                                <span className="text-zinc-400 leading-relaxed">{row[1]}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-line">
                            {section.content as string}
                          </p>
                        )}

                        {'referral' in section && section.referral && (
                          <div className="mt-3 pt-3 border-t border-zinc-700/50">
                            <a
                              href="https://polymarket.com/?r=Investpal"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 underline underline-offset-2"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Sign up with referral link
                            </a>
                          </div>
                        )}

                        {'warning' in section && (
                          <div className="mt-2 p-3 bg-amber-900/20 border border-amber-800/30 rounded-lg">
                            <p className="text-xs text-amber-400/90 leading-relaxed">{section.warning}</p>
                          </div>
                        )}

                        {'note' in section && (
                          <div className="mt-2 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
                            <p className="text-xs text-blue-400/90 leading-relaxed">{section.note}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 px-6 py-3 flex items-center justify-between rounded-b-xl">
              <span className="text-xs text-zinc-600">v1.0 â€” InvestPal Polymarket Engine</span>
              <Button
                onClick={() => { setIsOpen(false); }}
                className="bg-red-600 hover:bg-red-700 text-white text-xs px-4 py-1.5 h-auto"
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
