'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Zap,
  StopCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DerivWS, ActiveSymbol } from '@deriv/core';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type HedgeContractType =
  | 'CALL'      // Rise
  | 'PUT'       // Fall
  | 'DIGITEVEN' // Even
  | 'DIGITODD'  // Odd
  | 'DIGITOVER' // Over
  | 'DIGITUNDER'// Under
  | 'ACCU';     // Accumulators hedge (CALL/PUT mirror)

interface HedgeLog {
  id: string;
  ts: string;
  type: 'info' | 'success' | 'error';
  msg: string;
}

type HedgeMode = 'single' | 'martingale';

export type HedgePanelVariant = 'rise-fall' | 'digits' | 'accumulators';

interface HedgePanelProps {
  ws: DerivWS | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  activeSymbol: ActiveSymbol | null;
  /** What trading page this panel is embedded in — controls contract type options */
  variant: HedgePanelVariant;
  /** The main trade's direction / contract type for smart defaults */
  mainContractType?: string;
  /** Main trade stake — used to pre-fill hedge stake */
  mainStake?: string;
  /** Main trade duration (ticks) */
  mainDuration?: number;
  /** For digits: the selected digit */
  mainDigit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function nowStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function contractTypeOptions(variant: HedgePanelVariant): { value: string; label: string }[] {
  if (variant === 'rise-fall') {
    return [
      { value: 'CALL', label: '▲ Rise' },
      { value: 'PUT', label: '▼ Fall' },
    ];
  }
  if (variant === 'digits') {
    return [
      { value: 'DIGITEVEN', label: 'Even' },
      { value: 'DIGITODD', label: 'Odd' },
      { value: 'DIGITOVER', label: 'Over' },
      { value: 'DIGITUNDER', label: 'Under' },
    ];
  }
  // accumulators — use rise/fall as a synthetic hedge
  return [
    { value: 'CALL', label: '▲ Rise (Hedge)' },
    { value: 'PUT', label: '▼ Fall (Hedge)' },
  ];
}

/** Returns the natural counter-contract for a given main contract type */
function defaultHedgeContract(variant: HedgePanelVariant, mainContractType?: string): string {
  const map: Record<string, string> = {
    CALL: 'PUT',
    PUT: 'CALL',
    DIGITEVEN: 'DIGITODD',
    DIGITODD: 'DIGITEVEN',
    DIGITOVER: 'DIGITUNDER',
    DIGITUNDER: 'DIGITOVER',
    ACCU: 'CALL',
  };
  if (mainContractType && map[mainContractType]) return map[mainContractType];
  // smart defaults per variant
  if (variant === 'rise-fall') return 'PUT';
  if (variant === 'digits') return 'DIGITEVEN';
  return 'CALL';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function HedgePanel({
  ws,
  isConnected,
  isAuthenticated,
  activeSymbol,
  variant,
  mainContractType,
  mainStake,
  mainDuration = 5,
  mainDigit = 5,
}: HedgePanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Hedge settings
  const [contractType, setContractType] = useState<string>(() =>
    defaultHedgeContract(variant, mainContractType)
  );
  const [stake, setStake] = useState(mainStake ?? '5');
  const [duration, setDuration] = useState(mainDuration.toString());
  const [digit, setDigit] = useState(mainDigit.toString());
  const [growthRate, setGrowthRate] = useState('0.01');
  const [mode, setMode] = useState<HedgeMode>('single');
  const [martingale, setMartingale] = useState('2');
  const [maxRounds, setMaxRounds] = useState('5');
  const [intertradeSwitch, setIntertradeSwitch] = useState(false);
  const [takeProfit, setTakeProfit] = useState('0');
  const [stopLoss, setStopLoss] = useState('0');

  // Runtime state
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<HedgeLog[]>([]);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [netPnl, setNetPnl] = useState(0);
  const [currentStake, setCurrentStake] = useState<{ main: number; hedge: number }>({
    main: parseFloat(stake) || 5,
    hedge: parseFloat(stake) || 5,
  });

  const stoppedRef = useRef(false);
  const roundsRef = useRef(0);
  const totalProfitRef = useRef(0);

  // Sync default contract type when main trade type changes
  useEffect(() => {
    if (!isRunning) {
      setContractType(defaultHedgeContract(variant, mainContractType));
    }
  }, [mainContractType, variant, isRunning]);

  // Sync stake when main stake changes
  useEffect(() => {
    if (!isRunning && mainStake) setStake(mainStake);
  }, [mainStake, isRunning]);

  const addLog = useCallback((type: HedgeLog['type'], msg: string) => {
    setLogs(prev => [
      { id: uid(), ts: nowStr(), type, msg },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // ── Generic Contract Placement ──────────────────────────────────────────
  // Subscribes to proposal first, then executes the buy request.
  const placeContract = useCallback(
    async (
      type: string,
      tradeStake: number,
      dur: number,
      barrierDigit?: number
    ): Promise<{ contractId: number; buyPrice: number }> => {
      if (!ws) throw new Error('No WebSocket connection');

      const symbol = activeSymbol?.underlying_symbol ?? 'R_50';
      const needsBarrier = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(type);
      const isAccu = type === 'ACCU';

      // Build proposal payload (matches useProposal.ts format exactly)
      const proposalPayload: Record<string, unknown> = {
        proposal: 1,
        amount: tradeStake,
        basis: 'stake',
        contract_type: type,
        currency: 'USD',
        underlying_symbol: symbol,
      };

      if (isAccu) {
        proposalPayload.growth_rate = parseFloat(growthRate) || 0.01;
      } else {
        proposalPayload.duration = dur;
        proposalPayload.duration_unit = 't';
      }

      if (needsBarrier && barrierDigit !== undefined) {
        proposalPayload.barrier = barrierDigit;
      }

      // Step 1: Request one-shot proposal (no subscribe stream to avoid duplicate subscription errors)
      const proposalResp = await ws.send(proposalPayload) as any;

      if (proposalResp.error) {
        throw new Error(proposalResp.error.message ?? 'Proposal error');
      }

      const proposalId = proposalResp.proposal?.id;
      const askPrice = parseFloat(proposalResp.proposal?.ask_price ?? tradeStake);

      if (!proposalId) throw new Error('No proposal received');

      // Step 2: Buy using proposal id
      const buyResp = await ws.send({
        buy: proposalId,
        price: String(askPrice),
      }) as any;

      if (buyResp.error) throw new Error(buyResp.error.message ?? 'Buy failed');

      // Replicate trade for copy trading target if bridge is enabled
      if (typeof window !== 'undefined' && window.copyTradeBridge) {
        window.copyTradeBridge(type, tradeStake, dur, 't', symbol, barrierDigit).catch((e: any) => {
          console.warn('[Copy Trade] Duplication error:', e.message);
        });
      }

      return {
        contractId: buyResp.buy?.contract_id as number,
        buyPrice: parseFloat(buyResp.buy?.buy_price ?? String(askPrice)),
      };
    },
    [ws, activeSymbol, growthRate]
  );

  // ── Step 2: Wait for contract settlement ─────────────────────────────────
  // Subscribes to contract stream and unsubscribes cleanly once finalized.
  const waitForResult = useCallback(
    (contractId: number): Promise<{ won: boolean; profit: number }> => {
      return new Promise((resolve, reject) => {
        if (!ws) return reject(new Error('No WebSocket'));

        let unsubscribe: (() => void) | null = null;
        let resolved = false;

        const cleanup = () => {
          if (unsubscribe) {
            unsubscribe();
          }
        };

        const handleContractUpdate = (data: any) => {
          if (
            data.msg_type === 'proposal_open_contract' &&
            (data.proposal_open_contract as any)?.contract_id === contractId
          ) {
            const poc = data.proposal_open_contract as any;
            if (poc.status === 'won' || poc.status === 'lost') {
              resolved = true;
              cleanup();
              clearTimeout(timer);
              const profit = parseFloat(poc.profit ?? '0');
              resolve({ won: poc.status === 'won', profit });
            }
          }
        };

        // Listen globally via onMessage for streaming updates
        const globalUnsub = ws.onMessage(handleContractUpdate);

        // Initiate subscription on the WS server
        ws.subscribe(
          { proposal_open_contract: 1, contract_id: contractId, subscribe: 1 },
          handleContractUpdate
        ).then((sub) => {
          unsubscribe = () => {
            globalUnsub();
            sub.unsubscribe();
          };
          if (resolved) {
            unsubscribe();
          }
        }).catch((err) => {
          globalUnsub();
          reject(err);
        });

        // 2-minute safety timeout
        const timer = setTimeout(() => {
          resolved = true;
          cleanup();
          reject(new Error('Contract result timeout after 2 minutes'));
        }, 120_000);
      });
    },
    [ws]
  );

  // ── Main hedge loop ──────────────────────────────────────────────────────
  const runHedge = useCallback(async () => {
    stoppedRef.current = false;
    roundsRef.current = 0;
    totalProfitRef.current = 0;
    setWins(0);
    setLosses(0);
    setNetPnl(0);

    const baseStake = parseFloat(stake) || 5;
    const mult = parseFloat(martingale) || 2;
    const maxR = parseInt(maxRounds, 10) || 99;
    const tp = parseFloat(takeProfit) || 0;
    const sl = parseFloat(stopLoss) || 0;

    let mainStakeVal = baseStake;
    let hedgeStakeVal = baseStake;

    setCurrentStake({ main: mainStakeVal, hedge: hedgeStakeVal });
    setIsRunning(true);
    addLog('info', `Hedge started — symbol: ${activeSymbol?.underlying_symbol ?? 'R_50'}`);

    while (!stoppedRef.current && roundsRef.current < maxR) {
      try {
        const mainType = mainContractType || (variant === 'rise-fall' ? 'CALL' : variant === 'digits' ? 'DIGITEVEN' : 'ACCU');
        const mainDurVal = parseInt(duration, 10) || 5;
        const mainDigitVal = parseInt(digit, 10) || 5;

        const hedgeType = contractType;
        const hedgeDurVal = parseInt(duration, 10) || 5;
        const hedgeDigitVal = parseInt(digit, 10) || 5;

        setCurrentStake({ main: mainStakeVal, hedge: hedgeStakeVal });

        addLog('info', `Round ${roundsRef.current + 1} — Placing Main (${mainType} @ $${mainStakeVal.toFixed(2)}) & Hedge (${hedgeType} @ $${hedgeStakeVal.toFixed(2)}) simultaneously...`);

        // Execute both purchases in parallel
        const [mainRes, hedgeRes] = await Promise.all([
          placeContract(mainType, mainStakeVal, mainDurVal, mainDigitVal),
          placeContract(hedgeType, hedgeStakeVal, hedgeDurVal, hedgeDigitVal)
        ]);

        addLog('info', `Main trade #${mainRes.contractId} placed @ $${mainRes.buyPrice.toFixed(2)}`);
        addLog('info', `Hedge trade #${hedgeRes.contractId} placed @ $${hedgeRes.buyPrice.toFixed(2)}`);

        // Wait for both results in parallel
        const [mainOutcome, hedgeOutcome] = await Promise.all([
          waitForResult(mainRes.contractId),
          waitForResult(hedgeRes.contractId)
        ]);

        const mainWon = mainOutcome.won;
        const mainProfit = mainOutcome.profit;
        const hedgeWon = hedgeOutcome.won;
        const hedgeProfit = hedgeOutcome.profit;

        const roundNetPnl = mainProfit + hedgeProfit;
        totalProfitRef.current += roundNetPnl;
        roundsRef.current += 1;
        setNetPnl(totalProfitRef.current);

        // Update stakes based on mode and outcomes
        let nextMainStake = baseStake;
        let nextHedgeStake = baseStake;

        if (mode === 'martingale') {
          if (intertradeSwitch) {
            // Intertrade Switch Recovery:
            // Switch the Martingale recovery stake to the side that won (unlost),
            // and reset the lost side to baseStake.
            if (!mainWon && hedgeWon) {
              // Main lost, Hedge won. Main resets. Hedge gets Main's recovery stake.
              nextMainStake = baseStake;
              nextHedgeStake = parseFloat((mainStakeVal * mult).toFixed(2));
              addLog('info', `Intertrade Switch: Main Lost / Hedge Won. Switching recovery stake $${nextHedgeStake.toFixed(2)} to Hedge.`);
            } else if (mainWon && !hedgeWon) {
              // Hedge lost, Main won. Hedge resets. Main gets Hedge's recovery stake.
              nextHedgeStake = baseStake;
              nextMainStake = parseFloat((hedgeStakeVal * mult).toFixed(2));
              addLog('info', `Intertrade Switch: Hedge Lost / Main Won. Switching recovery stake $${nextMainStake.toFixed(2)} to Main.`);
            } else {
              // Both won or both lost: keep standard scaling/resetting
              nextMainStake = mainWon ? baseStake : parseFloat((mainStakeVal * mult).toFixed(2));
              nextHedgeStake = hedgeWon ? baseStake : parseFloat((hedgeStakeVal * mult).toFixed(2));
            }
          } else {
            // Standard Independent Martingale
            nextMainStake = mainWon ? baseStake : parseFloat((mainStakeVal * mult).toFixed(2));
            nextHedgeStake = hedgeWon ? baseStake : parseFloat((hedgeStakeVal * mult).toFixed(2));
          }
        }

        mainStakeVal = nextMainStake;
        hedgeStakeVal = nextHedgeStake;

        if (hedgeWon) {
          setWins(w => w + 1);
          addLog('success', `✅ Main: ${mainWon ? 'Won' : 'Lost'} ($${mainProfit >= 0 ? '+' : ''}${mainProfit.toFixed(2)}) | Hedge: Won ($${hedgeProfit >= 0 ? '+' : ''}${hedgeProfit.toFixed(2)}) | Net: $${roundNetPnl >= 0 ? '+' : ''}${roundNetPnl.toFixed(2)}`);
        } else {
          setLosses(l => l + 1);
          addLog('error', `❌ Main: ${mainWon ? 'Won' : 'Lost'} ($${mainProfit >= 0 ? '+' : ''}${mainProfit.toFixed(2)}) | Hedge: Lost ($${hedgeProfit >= 0 ? '+' : ''}${hedgeProfit.toFixed(2)}) | Net: $${roundNetPnl >= 0 ? '+' : ''}${roundNetPnl.toFixed(2)}`);
        }

        if (mode === 'martingale' && !intertradeSwitch) {
          if (!mainWon) addLog('info', `Main Lost → scaling next main stake to: $${mainStakeVal.toFixed(2)}`);
          if (!hedgeWon) addLog('info', `Hedge Lost → scaling next hedge stake to: $${hedgeStakeVal.toFixed(2)}`);
        }

        setCurrentStake({ main: mainStakeVal, hedge: hedgeStakeVal });

        // Check TP / SL limits
        if (tp > 0 && totalProfitRef.current >= tp) {
          addLog('success', `🏁 Take profit reached (+$${totalProfitRef.current.toFixed(2)}). Stopping.`);
          break;
        }
        if (sl > 0 && totalProfitRef.current <= -sl) {
          addLog('error', `🛑 Stop loss reached ($${totalProfitRef.current.toFixed(2)}). Stopping.`);
          break;
        }

        if (stoppedRef.current) break;

        // Small breathing room between rounds
        await new Promise(r => setTimeout(r, 800));
      } catch (err) {
        addLog('error', `Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        break;
      }
    }

    addLog(
      totalProfitRef.current >= 0 ? 'success' : 'error',
      `Hedge stopped after ${roundsRef.current} round(s). Net P&L: $${totalProfitRef.current.toFixed(2)}`
    );
    setIsRunning(false);
  }, [
    stake, martingale, maxRounds, intertradeSwitch, takeProfit, stopLoss, mode,
    activeSymbol, contractType, addLog, placeContract, waitForResult,
    mainContractType, mainStake, mainDuration, mainDigit, variant
  ]);

  const stopHedge = useCallback(() => {
    stoppedRef.current = true;
    addLog('info', 'Stop requested — will halt after current contract settles.');
  }, [addLog]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const canTrade = isConnected && isAuthenticated && !!activeSymbol && !!ws;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="mt-2">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all duration-200 text-sm font-semibold',
          isOpen
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
            : 'bg-zinc-900/60 border-zinc-700/60 text-zinc-400 hover:border-amber-500/30 hover:text-amber-400/80'
        )}
      >
        <span className="flex items-center gap-2">
          <ShieldCheck size={16} className={isOpen ? 'text-amber-400' : 'text-zinc-500'} />
          ⚡ Hedge Panel
          {isRunning && (
            <Badge className="text-[9px] font-bold bg-amber-500/20 text-amber-400 border-amber-600/30 border px-1.5 py-0 animate-pulse">
              LIVE
            </Badge>
          )}
          {!isRunning && (wins > 0 || losses > 0) && (
            <Badge className="text-[9px] font-bold bg-zinc-800 text-zinc-400 border-zinc-700 border px-1.5 py-0">
              {wins}W / {losses}L
            </Badge>
          )}
        </span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Expanded Panel */}
      {isOpen && (
        <Card className="mt-1.5 border-amber-500/20 bg-zinc-950/80 shadow-lg shadow-amber-500/5">
          <CardContent className="p-4 space-y-4">
            {/* Auth / Connection guard */}
            {!canTrade && (
              <div className="text-xs text-zinc-500 italic text-center py-2">
                {!isAuthenticated
                  ? 'Login to enable hedge trading.'
                  : !isConnected
                  ? 'Waiting for connection…'
                  : 'Select a symbol to continue.'}
              </div>
            )}

            {/* Config Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Contract type */}
              <div className="col-span-2">
                <Label className="text-[11px] text-zinc-400 mb-1 block">Hedge Contract Type</Label>
                <Select value={contractType} onValueChange={setContractType} disabled={isRunning}>
                  <SelectTrigger className="h-8 text-xs bg-zinc-900 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-200">
                    {contractTypeOptions(variant).map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stake */}
              <div>
                <Label className="text-[11px] text-zinc-400 mb-1 block">Stake ($)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.5"
                  value={stake}
                  onChange={e => setStake(e.target.value)}
                  disabled={isRunning}
                  className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                />
              </div>

              {/* Duration (only for non-accumulators) */}
              {variant !== 'accumulators' && (
                <div>
                  <Label className="text-[11px] text-zinc-400 mb-1 block">Duration (ticks)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    disabled={isRunning}
                    className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                  />
                </div>
              )}

              {/* Growth rate (accumulators only) */}
              {variant === 'accumulators' && (
                <div>
                  <Label className="text-[11px] text-zinc-400 mb-1 block">Growth Rate</Label>
                  <Select value={growthRate} onValueChange={setGrowthRate} disabled={isRunning}>
                    <SelectTrigger className="h-8 text-xs bg-zinc-900 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-200">
                      {['0.01', '0.02', '0.03', '0.04', '0.05'].map(r => (
                        <SelectItem key={r} value={r} className="text-xs">{(parseFloat(r) * 100).toFixed(0)}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Digit (for digit contracts needing a digit) */}
              {variant === 'digits' && ['DIGITOVER', 'DIGITUNDER'].includes(contractType) && (
                <div className="col-span-2">
                  <Label className="text-[11px] text-zinc-400 mb-1 block">Digit (0–9)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="9"
                    value={digit}
                    onChange={e => setDigit(e.target.value)}
                    disabled={isRunning}
                    className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                  />
                </div>
              )}

              {/* Take Profit */}
              <div>
                <Label className="text-[11px] text-zinc-400 mb-1 block">Take Profit ($, 0=off)</Label>
                <Input
                  type="number"
                  min="0"
                  value={takeProfit}
                  onChange={e => setTakeProfit(e.target.value)}
                  disabled={isRunning}
                  className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                />
              </div>

              {/* Stop Loss */}
              <div>
                <Label className="text-[11px] text-zinc-400 mb-1 block">Stop Loss ($, 0=off)</Label>
                <Input
                  type="number"
                  min="0"
                  value={stopLoss}
                  onChange={e => setStopLoss(e.target.value)}
                  disabled={isRunning}
                  className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                />
              </div>
            </div>

            {/* Mode & Martingale */}
            <div className="flex items-center gap-3 border-t border-zinc-800 pt-3">
              <Switch
                id="hedge-martingale"
                checked={mode === 'martingale'}
                onCheckedChange={v => setMode(v ? 'martingale' : 'single')}
                disabled={isRunning}
                className="data-[state=checked]:bg-amber-500"
              />
              <Label htmlFor="hedge-martingale" className="text-[11px] text-zinc-300 cursor-pointer">
                Martingale on Loss
              </Label>
              {mode === 'martingale' && (
                <div className="flex items-center gap-2 ml-auto">
                  <Label className="text-[11px] text-zinc-400">×</Label>
                  <Input
                    type="number"
                    min="1.1"
                    step="0.1"
                    value={martingale}
                    onChange={e => setMartingale(e.target.value)}
                    disabled={isRunning}
                    className="h-7 w-16 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                  />
                  <Label className="text-[11px] text-zinc-400">max</Label>
                  <Input
                    type="number"
                    min="1"
                    value={maxRounds}
                    onChange={e => setMaxRounds(e.target.value)}
                    disabled={isRunning}
                    className="h-7 w-14 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
                  />
                </div>
              )}
            </div>

            {/* Intertrade Switch */}
            {mode === 'martingale' && (
              <div className="flex items-center gap-3 border-t border-zinc-800 pt-3 animate-in fade-in duration-200">
                <Switch
                  id="hedge-intertrade"
                  checked={intertradeSwitch}
                  onCheckedChange={setIntertradeSwitch}
                  disabled={isRunning}
                  className="data-[state=checked]:bg-amber-500"
                />
                <div className="flex flex-col space-y-0.5">
                  <Label htmlFor="hedge-intertrade" className="text-[11px] text-zinc-300 cursor-pointer font-semibold">
                    Intertrade Switch Recovery
                  </Label>
                  <p className="text-[9px] text-zinc-500">Switch recovery stakes to the winning leg on loss.</p>
                </div>
              </div>
            )}

            {/* Stats bar */}
            {(wins > 0 || losses > 0 || isRunning) && (
              <div className="flex items-center gap-3 text-xs border border-zinc-800/80 rounded-lg px-3 py-2 bg-zinc-900/40">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <CheckCircle2 size={12} /> {wins}W
                </span>
                <span className="flex items-center gap-1 text-red-400 font-semibold">
                  <XCircle size={12} /> {losses}L
                </span>
                <span className={cn(
                  'ml-auto font-bold',
                  netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {netPnl >= 0 ? '+' : ''}{netPnl.toFixed(2)}
                </span>
                {isRunning && (
                  <span className="text-zinc-500 text-[10px]">
                    stk: M:${currentStake.main.toFixed(2)}/H:${currentStake.hedge.toFixed(2)}
                  </span>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {!isRunning ? (
                <Button
                  onClick={runHedge}
                  disabled={!canTrade}
                  size="sm"
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs h-9"
                >
                  <Zap size={13} className="mr-1.5" />
                  Open Hedge
                </Button>
              ) : (
                <Button
                  onClick={stopHedge}
                  size="sm"
                  variant="destructive"
                  className="flex-1 text-xs h-9 font-bold"
                >
                  <StopCircle size={13} className="mr-1.5" />
                  Stop Hedge
                </Button>
              )}
              {!isRunning && logs.length > 0 && (
                <Button
                  onClick={clearLogs}
                  size="sm"
                  variant="outline"
                  className="text-xs h-9 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                >
                  <RefreshCw size={12} />
                </Button>
              )}
            </div>

            {/* Logs */}
            {logs.length > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-black/40 p-2 max-h-32 overflow-y-auto font-mono text-[10px] space-y-0.5">
                {logs.map(log => (
                  <div
                    key={log.id}
                    className={cn(
                      'flex gap-2 leading-relaxed',
                      log.type === 'success' && 'text-emerald-400',
                      log.type === 'error' && 'text-red-400',
                      log.type === 'info' && 'text-zinc-400',
                    )}
                  >
                    <span className="shrink-0 text-zinc-600">{log.ts}</span>
                    <span>{log.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
