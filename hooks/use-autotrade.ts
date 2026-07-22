'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DerivWS } from '@deriv/core';

declare global {
  interface Window {
    placeAutoTrade?: (type: string, digit: number) => void;
    copyTradeBridge?: (type: string, stake: number, dur: number, durUnit: string, symbol: string, barrierDigit?: number) => Promise<void>;
  }
}

export type AutoTradeMode =
  | 'rise-fall'
  | 'digits-even-odd'
  | 'digits-match-differ'
  | 'digits-over-under'
  | 'accumulators'
  | 'higher-lower'
  | 'touch-no-touch'
  | 'asian-up-down'
  | 'reset-call-put'
  | 'rise-only'
  | 'fall-only'
  | 'even-only'
  | 'odd-only'
  | 'match-only'
  | 'differ-only'
  | 'over-only'
  | 'under-only'
  | 'higher-only'
  | 'lower-only'
  | 'touch-only'
  | 'no-touch-only'
  | 'asian-up-only'
  | 'asian-down-only'
  | 'reset-call-only'
  | 'reset-put-only'
  | 'ai-auto-combo'
  | 'ai-auto-individual';

export interface AutoTradeConfig {
  mode: AutoTradeMode;
  symbol: string;
  baseStake: number;
  baseStake2?: number; // for Leg 2 different stake amount
  duration: number; // in ticks/seconds/etc.
  martingaleMultiplier: number;
  takeProfit: number;
  stopLoss: number;
  selectedDigit: number[]; // digit array — trades cycle through them
  selectedDigit2?: number[]; // digit array for Leg 2 — trades cycle through them
  growthRate: number; // for accumulators
  isHedgeMode: boolean; // true: trade both legs, false: trade leg 1 only
  isAlternateMode: boolean; // true: alternate recovery trades, false: single leg
  alternateFrequency: number; // number of trades before switching sides
  recoveryMethod?: 'martingale' | 'reverse_martingale' | 'dalembert' | 'fibonacci' | 'oscars_grind' | 'ai_auto';
  ghostLossThreshold?: number;
  maxTradesLimit?: number;
  trailingProfitLock?: number;
  accumulatorAutoSellOffset?: number;
  aiSignalsDriven?: boolean;
  multiDigitObjectives?: string;
  durationUnit?: 't' | 's' | 'm' | 'h' | 'd';
  aiStakeMode?: boolean;
  aiRecoveryMode?: boolean;
  aiGhostFloorMode?: boolean;
  aiMaxRunsMode?: boolean;
  aiTrailingLockMode?: boolean;
  aiDigitsMode?: boolean;
  martingaleSplitMode?: 'optional' | 'full';
  aiRandomCoolOff?: boolean;
  barrierOffset?: string;
  enableCoolOff?: boolean;
  coolOffConsecutiveLosses?: number;
  coolOffConsecutiveWins?: number;
  coolOffDuration?: number;
}

export interface RunnerState {
  label: string; // e.g. "Rise (CALL)", "Even"
  contractType: string; // e.g. "CALL", "DIGITEVEN", "ACCU"
  currentStake: number;
  isTrading: boolean;
  activeContractId: number | null;
  lastResult: 'win' | 'loss' | null;
  profit: number;
}

export interface AutoTradeLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

export interface AutoTradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  totalProfit: number;
  isRunning: boolean;
  status: 'idle' | 'running' | 'completed' | 'stopped';
}

export function useAutoTrade(ws: DerivWS | null, isConnected: boolean) {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<AutoTradeLog[]>([]);
  const [stats, setStats] = useState<AutoTradeStats>({
    totalTrades: 0,
    wins: 0,
    losses: 0,
    totalProfit: 0,
    isRunning: false,
    status: 'idle',
  });

  const [leg1, setLeg1] = useState<RunnerState>({
    label: 'Leg 1',
    contractType: 'CALL',
    currentStake: 0,
    isTrading: false,
    activeContractId: null,
    lastResult: null,
    profit: 0,
  });

  const [leg2, setLeg2] = useState<RunnerState>({
    label: 'Leg 2',
    contractType: 'PUT',
    currentStake: 0,
    isTrading: false,
    activeContractId: null,
    lastResult: null,
    profit: 0,
  });

  const [leg3, setLeg3] = useState<RunnerState>({
    label: 'Leg 3',
    contractType: 'DIGITMATCH',
    currentStake: 0,
    isTrading: false,
    activeContractId: null,
    lastResult: null,
    profit: 0,
  });

  const configRef = useRef<AutoTradeConfig | null>(null);
  const activeUnsubsRef = useRef<(() => void)[]>([]);
  const isRunningRef = useRef(false);
  const leg1Ref = useRef<RunnerState>(leg1);
  const leg2Ref = useRef<RunnerState>(leg2);
  const leg3Ref = useRef<RunnerState>(leg3);
  const statsRef = useRef<AutoTradeStats>(stats);
  const activeStakeRef = useRef<number>(0);
  const currentLegRef = useRef<'leg1' | 'leg2'>('leg1');
  const tradeCountRef = useRef<number>(0);

  // Advanced feature tracking refs
  const peakProfitRef = useRef(0);
  const consecutiveWinsRef = useRef(0);
  const consecutiveLossesRef = useRef(0);
  const coolOffUntilRef = useRef<number | null>(null);
  const dynamicWinsLimitRef = useRef(3);
  const dynamicLossesLimitRef = useRef(3);
  const fiboIndex1Ref = useRef(0);
  const fiboIndex2Ref = useRef(0);
  const fiboIndex3Ref = useRef(0);
  const ogTarget1Ref = useRef(0);
  const ogTarget2Ref = useRef(0);
  const ogTarget3Ref = useRef(0);
  const ogCurrentUnitProfit1Ref = useRef(0);
  const ogCurrentUnitProfit2Ref = useRef(0);
  const ogCurrentUnitProfit3Ref = useRef(0);
  const ghostLosses1Ref = useRef(0);
  const ghostLosses2Ref = useRef(0);
  const ghostLosses3Ref = useRef(0);
  const multiDigitIndexRef = useRef(0);
  const digitIndex1Ref = useRef(0);
  const digitIndex2Ref = useRef(0);
  const digitIndex3Ref = useRef(0);
  const splitCount1Ref = useRef(0);
  const splitStake1Ref = useRef(0);
  const splitCount2Ref = useRef(0);
  const splitStake2Ref = useRef(0);
  const splitCount3Ref = useRef(0);
  const splitStake3Ref = useRef(0);

  // Sync refs with state
  useEffect(() => { leg1Ref.current = leg1; }, [leg1]);
  useEffect(() => { leg2Ref.current = leg2; }, [leg2]);
  useEffect(() => { leg3Ref.current = leg3; }, [leg3]);
  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  // Clean up all subscriptions on unmount or connection loss
  const cleanupSubscriptions = useCallback(() => {
    activeUnsubsRef.current.forEach((unsub) => {
      try {
        unsub();
      } catch (err) {
        console.error('Error cleaning up subscription:', err);
      }
    });
    activeUnsubsRef.current = [];
  }, []);

  useEffect(() => {
    if (!isConnected && isRunningRef.current) {
      stopAutoTrade('WebSocket disconnected.');
    }
    return () => {
      cleanupSubscriptions();
    };
  }, [isConnected, cleanupSubscriptions]);

  const addLog = useCallback((message: string, type: AutoTradeLog['type'] = 'info') => {
    const newLog: AutoTradeLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 100)); // Keep last 100 logs
  }, []);

  const calculateNextStake = useCallback((
    legKey: 'leg1' | 'leg2' | 'leg3',
    won: boolean,
    prevStake: number,
    baseStake: number,
    mult: number,
    recoveryMethod: string = 'martingale'
  ): number => {
    // 1. Martingale
    if (recoveryMethod === 'martingale') {
      return won ? baseStake : Math.round(prevStake * mult * 100) / 100;
    }

    // 2. Reverse Martingale
    if (recoveryMethod === 'reverse_martingale') {
      return won ? Math.round(prevStake * mult * 100) / 100 : baseStake;
    }

    // 3. D'Alembert
    if (recoveryMethod === 'dalembert') {
      if (won) {
        return Math.round(Math.max(baseStake, prevStake - baseStake) * 100) / 100;
      } else {
        return Math.round((prevStake + baseStake) * 100) / 100;
      }
    }

    // 4. Fibonacci
    if (recoveryMethod === 'fibonacci') {
      const fiboSeq = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377];
      const useUnified = !configRef.current || !configRef.current.isHedgeMode;
      const indexRef = useUnified ? fiboIndex1Ref : (legKey === 'leg1' ? fiboIndex1Ref : (legKey === 'leg2' ? fiboIndex2Ref : fiboIndex3Ref));
      if (won) {
        indexRef.current = Math.max(0, indexRef.current - 2);
      } else {
        indexRef.current = Math.min(fiboSeq.length - 1, indexRef.current + 1);
      }
      const multiplier = fiboSeq[indexRef.current];
      return Math.round(baseStake * multiplier * 100) / 100;
    }

    // 5. Oscar's Grind
    if (recoveryMethod === 'oscars_grind') {
      const useUnified = !configRef.current || !configRef.current.isHedgeMode;
      const ogCurrentUnitProfitRef = useUnified ? ogCurrentUnitProfit1Ref : (legKey === 'leg1' ? ogCurrentUnitProfit1Ref : (legKey === 'leg2' ? ogCurrentUnitProfit2Ref : ogCurrentUnitProfit3Ref));
      const profitFromLastTrade = won ? prevStake : -prevStake;
      ogCurrentUnitProfitRef.current += profitFromLastTrade;

      if (ogCurrentUnitProfitRef.current >= baseStake) {
        ogCurrentUnitProfitRef.current = 0;
        return baseStake;
      }

      if (won) {
        const nextTargetProfit = baseStake;
        const potentialProfitIfWin = ogCurrentUnitProfitRef.current + prevStake + baseStake;
        if (potentialProfitIfWin > nextTargetProfit) {
          return Math.round(Math.max(baseStake, nextTargetProfit - ogCurrentUnitProfitRef.current) * 100) / 100;
        }
        return Math.round((prevStake + baseStake) * 100) / 100;
      } else {
        return prevStake;
      }
    }

    return baseStake;
  }, []);

  const simulateContractOutcome = useCallback(
    (type: string, dur: number, barrierDigit: number): Promise<{ won: boolean; profit: number }> => {
      return new Promise((resolve) => {
        if (!ws || !configRef.current) return resolve({ won: false, profit: 0 });
        const symbol = configRef.current.symbol;
        let tickCount = 0;
        let startTick: number | null = null;
        let unsub: (() => void) | null = null;

        const handleTick = (data: any) => {
          if (data.msg_type === 'tick' && data.tick?.quote) {
            const quote = parseFloat(data.tick.quote);
            if (startTick === null) {
              startTick = quote;
              return;
            }
            tickCount++;
            if (tickCount >= dur) {
              if (unsub) unsub();
              let won = false;
              if (type === 'CALL') {
                won = quote > startTick;
              } else if (type === 'PUT') {
                won = quote < startTick;
              } else if (type === 'DIGITEVEN') {
                const lastDigit = parseInt(quote.toFixed(data.tick.pip_size || 2).slice(-1), 10);
                won = lastDigit % 2 === 0;
              } else if (type === 'DIGITODD') {
                const lastDigit = parseInt(quote.toFixed(data.tick.pip_size || 2).slice(-1), 10);
                won = lastDigit % 2 !== 0;
              } else if (type === 'DIGITMATCH') {
                const lastDigit = parseInt(quote.toFixed(data.tick.pip_size || 2).slice(-1), 10);
                won = lastDigit === barrierDigit;
              } else if (type === 'DIGITDIFF') {
                const lastDigit = parseInt(quote.toFixed(data.tick.pip_size || 2).slice(-1), 10);
                won = lastDigit !== barrierDigit;
              } else if (type === 'DIGITOVER') {
                const lastDigit = parseInt(quote.toFixed(data.tick.pip_size || 2).slice(-1), 10);
                won = lastDigit > barrierDigit;
              } else if (type === 'DIGITUNDER') {
                const lastDigit = parseInt(quote.toFixed(data.tick.pip_size || 2).slice(-1), 10);
                won = lastDigit < barrierDigit;
              }
              resolve({ won, profit: won ? 0.95 : -1 });
            }
          }
        };

        ws.subscribe({ ticks: symbol, subscribe: 1 }, handleTick)
          .then((sub) => {
            unsub = () => sub.unsubscribe();
          })
          .catch(() => resolve({ won: false, profit: 0 }));
      });
    },
    [ws]
  );

  const stopAutoTrade = useCallback((reason = 'Stopped by user') => {
    setIsRunning(false);
    cleanupSubscriptions();
    setStats((prev) => ({
      ...prev,
      isRunning: false,
      status: reason.includes('profit') ? 'completed' : 'stopped',
    }));
    setLeg1((prev) => ({ ...prev, isTrading: false, activeContractId: null }));
    setLeg2((prev) => ({ ...prev, isTrading: false, activeContractId: null }));
    addLog(`Autotrade stopped: ${reason}`, 'warn');
  }, [cleanupSubscriptions, addLog]);

  // Main purchase trigger for a specific leg
  const executeTrade = useCallback(async (legKey: 'leg1' | 'leg2') => {
    if (!ws || !isConnected || !isRunningRef.current || !configRef.current) return;

    const config = configRef.current;
    const isLeg1 = legKey === 'leg1';
    const leg = isLeg1 ? leg1Ref.current : leg2Ref.current;

    // Prevent concurrent trades on the same leg
    if (leg.isTrading || leg.activeContractId) return;

    const curStats = statsRef.current;

    // AI dynamic max runs override
    let finalMaxTrades = config.maxTradesLimit || 0;
    if (config.aiMaxRunsMode) {
      const winRate = curStats.totalTrades > 0 ? (curStats.wins / curStats.totalTrades) : 0.5;
      finalMaxTrades = winRate < 0.35 ? 10 : 0; 
    }
    if (finalMaxTrades > 0 && curStats.totalTrades >= finalMaxTrades) {
      stopAutoTrade(`Max Runs Limit of ${finalMaxTrades} reached.`);
      return;
    }

    // Check Cool-Off
    if (config.enableCoolOff && coolOffUntilRef.current && Date.now() < coolOffUntilRef.current) {
      const timeLeftMs = coolOffUntilRef.current - Date.now();
      addLog(`[System] Cool-Off Active. Pausing trade execution for ${(timeLeftMs / 1000).toFixed(0)}s...`, 'info');
      setTimeout(() => {
        if (isRunningRef.current) {
          executeTrade(legKey);
        }
      }, timeLeftMs);
      return;
    }

    // Check Take Profit / Stop Loss
    if (config.takeProfit > 0 && curStats.totalProfit >= config.takeProfit) {
      stopAutoTrade(`Take Profit target of $${config.takeProfit.toFixed(2)} reached!`);
      return;
    }
    if (config.stopLoss > 0 && curStats.totalProfit <= -config.stopLoss) {
      stopAutoTrade(`Stop Loss limit of $${config.stopLoss.toFixed(2)} hit.`);
      return;
    }

    peakProfitRef.current = Math.max(peakProfitRef.current, curStats.totalProfit);
    // AI dynamic trailing lock override
    let finalTrailingLock = config.trailingProfitLock || 0;
    if (config.aiTrailingLockMode) {
      finalTrailingLock = (config.takeProfit > 0 && curStats.totalProfit > config.takeProfit * 0.7) ? 85 : 50;
    }
    if (finalTrailingLock > 0 && peakProfitRef.current > 0) {
      const lockedFloor = Math.max(0, peakProfitRef.current * (finalTrailingLock / 100));
      if (curStats.totalProfit <= lockedFloor && curStats.totalProfit < peakProfitRef.current) {
        stopAutoTrade(`Trailing Profit Lock triggered: Secured $${curStats.totalProfit.toFixed(2)} (High-Water Mark: $${peakProfitRef.current.toFixed(2)}).`);
        return;
      }
    }

    // Dynamic Digit / Operator Objectives Parser
    let selectedDigit: number;
    const legDigitArray = isLeg1 ? config.selectedDigit : (config.selectedDigit2 || config.selectedDigit);
    const digitIndexRef = isLeg1 ? digitIndex1Ref : digitIndex2Ref;
    if (Array.isArray(legDigitArray) && legDigitArray.length > 0) {
      selectedDigit = legDigitArray[digitIndexRef.current % legDigitArray.length];
      digitIndexRef.current++;
    } else {
      selectedDigit = 5;
    }
    let computedMode = config.mode;

    if (config.aiDigitsMode && typeof window !== 'undefined' && (window as any).latestAiSignal) {
      selectedDigit = (window as any).latestAiSignal.predictionDigit;
    }

    if (config.multiDigitObjectives) {
      const targets = config.multiDigitObjectives.split(',').map(x => x.trim()).filter(x => x !== '');
      if (targets.length > 0) {
        const target = targets[multiDigitIndexRef.current % targets.length];
        multiDigitIndexRef.current++;
        
        const match = target.match(/^([>=<!]+)?(\d+)$/);
        if (match) {
          const operator = match[1] || '=';
          const digitVal = parseInt(match[2], 10);
          selectedDigit = digitVal;
          if (operator === '>') {
            computedMode = 'over-only';
          } else if (operator === '<') {
            computedMode = 'under-only';
          } else if (operator === '!=' || operator === '!') {
            computedMode = 'differ-only';
          } else {
            computedMode = 'match-only';
          }
          addLog(`[System] Operator Objective: '${target}' (Digit: ${selectedDigit}, Operator: ${operator})`);
        }
      }
    } else if (config.aiSignalsDriven && typeof window !== 'undefined' && (window as any).latestAiSignal) {
      const ai = (window as any).latestAiSignal;
      selectedDigit = ai.predictionDigit;
    }

    // Determine Contract Type based on computed mode
    let contractType = leg.contractType;
    if (computedMode === 'over-only') contractType = 'DIGITOVER';
    else if (computedMode === 'under-only') contractType = 'DIGITUNDER';
    else if (computedMode === 'match-only') contractType = 'DIGITMATCH';
    else if (computedMode === 'differ-only') contractType = 'DIGITDIFF';
    else if (computedMode === 'even-only') contractType = 'DIGITEVEN';
    else if (computedMode === 'odd-only') contractType = 'DIGITODD';
    else if (computedMode === 'rise-only') contractType = 'CALL';
    else if (computedMode === 'fall-only') contractType = 'PUT';

    // AI signals override
    if ((config.aiSignalsDriven || config.mode === 'ai-auto-individual' || config.mode === 'ai-auto-combo') && typeof window !== 'undefined' && (window as any).latestAiSignal) {
      const ai = (window as any).latestAiSignal;
      if (config.mode === 'ai-auto-individual' || config.mode === 'ai-auto-combo') {
        if (ai.confidence > 75) {
          contractType = 'DIGITMATCH';
          selectedDigit = ai.predictionDigit;
        } else {
          contractType = ai.direction;
        }
        addLog(`[System] AI Auto autonomous selection: ${contractType} ${contractType.startsWith('DIGIT') ? `@ ${selectedDigit}` : ''} (Confidence: ${ai.confidence.toFixed(0)}%)`);
      } else {
        // Mode-specific overrides
        if (config.mode === 'rise-fall') {
          contractType = ai.direction;
        } else if (config.mode === 'digits-even-odd') {
          contractType = ai.evenOdd;
        } else if (config.mode.startsWith('digits')) {
          selectedDigit = ai.predictionDigit;
        }
      }
    }

    // Stake Selection & dynamic AI Stake scaling
    const useUnifiedRefs = !config.isHedgeMode;
    const splitCountRef = useUnifiedRefs ? splitCount1Ref : (isLeg1 ? splitCount1Ref : splitCount2Ref);
    const splitStakeRef = useUnifiedRefs ? splitStake1Ref : (isLeg1 ? splitStake1Ref : splitStake2Ref);
    let currentStake = config.isHedgeMode ? leg.currentStake : activeStakeRef.current;
    if (splitCountRef.current > 0) {
      currentStake = splitStakeRef.current;
    }
    if (config.aiStakeMode && typeof window !== 'undefined' && (window as any).latestAiSignal) {
      const ai = (window as any).latestAiSignal;
      const multiplier = Math.max(0.5, Math.min(1.5, ai.confidence / 70));
      currentStake = config.baseStake * multiplier;
      addLog(`[System] AI dynamic stake scaling: $${currentStake.toFixed(2)} (${multiplier.toFixed(2)}x confidence multiplier)`);
    }
    const roundedStake = Math.round(currentStake * 100) / 100;

    // Next leg computation
    let nextLegToExecute = legKey;
    if (!config.isHedgeMode && config.isAlternateMode) {
      tradeCountRef.current += 1;
      if (tradeCountRef.current >= config.alternateFrequency) {
        const nextLeg = currentLegRef.current === 'leg1' ? 'leg2' : 'leg1';
        currentLegRef.current = nextLeg;
        tradeCountRef.current = 0;
      }
      nextLegToExecute = currentLegRef.current;
    }

    // Ghost loss evaluation & AI Ghost Loss overrides
    let ghostThreshold = config.ghostLossThreshold || 0;
    if (config.aiGhostFloorMode && typeof window !== 'undefined' && (window as any).latestAiSignal) {
      const ai = (window as any).latestAiSignal;
      ghostThreshold = ai.confidence > 80 ? 0 : 2;
    }
    const ghostLossesRef = useUnifiedRefs ? ghostLosses1Ref : (isLeg1 ? ghostLosses1Ref : ghostLosses2Ref);
    if (ghostThreshold > 0 && ghostLossesRef.current < ghostThreshold) {
      addLog(`[System] [Ghost Mode] Simulating virtual trade for ${leg.label} (${contractType} ${contractType.startsWith('DIGIT') ? `@ ${selectedDigit}` : ''})...`);
      simulateContractOutcome(contractType, config.duration, selectedDigit).then(({ won }) => {
        if (won) {
          ghostLossesRef.current = 0;
          addLog(`[System] [Ghost Mode] Virtual Win! Resetting streak.`, 'success');
        } else {
          ghostLossesRef.current++;
          addLog(`[System] [Ghost Mode] Virtual Loss! Streak: ${ghostLossesRef.current}/${ghostThreshold}`, 'warn');
        }

        setTimeout(() => {
          if (isRunningRef.current) {
            executeTrade(nextLegToExecute);
          }
        }, 1000);
      });
      return;
    }

    // Burst mode: trade ALL selected digits simultaneously (supports dual-leg in hedge mode)
    const isDigitType = ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(contractType);
    const burstDigits = isLeg1 ? config.selectedDigit : (config.selectedDigit2 || config.selectedDigit);
    if (isDigitType && Array.isArray(burstDigits) && burstDigits.length > 0 && !config.aiDigitsMode && !config.multiDigitObjectives) {
      // Inline burst logic — no refs, no closures, direct execution
      const executeDigitBurst = async (
        bLegKey: 'leg1' | 'leg2',
        bContractType: string,
        bStake: number,
        bDigits: number[],
        bSetLegState: React.Dispatch<React.SetStateAction<RunnerState>>,
        bIsLeg1: boolean,
      ) => {
        if (!ws || !isRunningRef.current) return;
        const bLegLabel = bIsLeg1 ? 'Leg 1' : 'Leg 2';
        addLog(`[${bLegLabel}] ⚡ Burst: ${bDigits.length} contracts (digits: ${bDigits.join(',')})`, 'info');

        const proposals = await Promise.allSettled(
          bDigits.map(d => placeProposal(bContractType, bStake, config, d))
        );
        const validProposals: { digit: number; proposalId: string }[] = [];
        proposals.forEach((res, i) => {
          if (res.status === 'fulfilled') validProposals.push({ digit: bDigits[i], proposalId: res.value });
          else addLog(`[${bLegLabel}] Proposal failed for digit ${bDigits[i]}: ${res.reason}`, 'error');
        });
        if (validProposals.length === 0) {
          addLog(`[${bLegLabel}] All proposals failed. Retrying...`, 'error');
          bSetLegState((prev) => ({ ...prev, isTrading: false }));
          setTimeout(() => { if (isRunningRef.current) executeTrade(bLegKey); }, 2000);
          return;
        }

        const buys = await Promise.allSettled(
          validProposals.map(p => buyContract(p.proposalId, bStake))
        );
        const contracts: { digit: number; contractId: number }[] = [];
        buys.forEach((res, i) => {
          if (res.status === 'fulfilled') contracts.push({ digit: validProposals[i].digit, contractId: res.value.contractId });
          else addLog(`[${bLegLabel}] Buy failed for digit ${validProposals[i].digit}: ${res.reason}`, 'error');
        });
        if (contracts.length === 0) {
          addLog(`[${bLegLabel}] All buys failed. Retrying...`, 'error');
          bSetLegState((prev) => ({ ...prev, isTrading: false }));
          setTimeout(() => { if (isRunningRef.current) executeTrade(bLegKey); }, 2000);
          return;
        }

        addLog(`[${bLegLabel}] ⚡ ${contracts.length} contracts bought. Waiting for settlement...`, 'success');

        const outcomes = await Promise.allSettled(
          contracts.map(c => waitForResult(c.contractId))
        );
        let wins = 0, losses = 0, totalPnl = 0;
        const detail: string[] = [];
        outcomes.forEach((res, i) => {
          const digit = contracts[i].digit;
          if (res.status === 'fulfilled') {
            if (res.value.won) wins++; else losses++;
            totalPnl += res.value.profit;
            detail.push(`#${digit}: ${res.value.won ? 'WIN' : 'LOSS'} ($${res.value.profit.toFixed(2)})`);
          } else { losses++; detail.push(`#${digit}: ERROR`); }
        });
        addLog(`[${bLegLabel}] ⚡ Burst results: ${wins}W/${losses}L — P&L: $${totalPnl.toFixed(2)} [${detail.join(', ')}]`, totalPnl >= 0 ? 'success' : 'error');

        const isWinRound = wins >= losses;
        setStats((prev) => ({ ...prev, wins: prev.wins + wins, losses: prev.losses + losses, totalProfit: prev.totalProfit + totalPnl, totalTrades: prev.totalTrades + contracts.length }));

        let finalRecovery = config.recoveryMethod || 'martingale';
        const nextStake = calculateNextStake(bLegKey, isWinRound, bStake, config.baseStake, config.martingaleMultiplier, finalRecovery);
        bSetLegState((prev) => ({ ...prev, isTrading: false, activeContractId: null, lastResult: isWinRound ? 'win' : 'loss', profit: prev.profit + totalPnl, currentStake: nextStake }));

        setTimeout(() => { if (isRunningRef.current) executeTrade(bLegKey); }, 1000);
      };

      if (config.isHedgeMode) {
        const otherLegKey = isLeg1 ? 'leg2' : 'leg1';
        const otherIsLeg1 = !isLeg1;
        const otherDigits = otherIsLeg1 ? config.selectedDigit : (config.selectedDigit2 || config.selectedDigit);
        const otherSetLegState = otherIsLeg1 ? setLeg1 : setLeg2;
        const otherContractType = otherIsLeg1 ? leg1Ref.current.contractType : leg2Ref.current.contractType;
        const otherStake = Math.round(((otherIsLeg1 ? config.baseStake : (config.baseStake2 || config.baseStake)) * 100)) / 100;

        setLegState((prev) => ({ ...prev, isTrading: true }));
        otherSetLegState((prev) => ({ ...prev, isTrading: true }));
        addLog(`[System] ⚡ Hedge Burst: L1 (${burstDigits.length} digits) + L2 (${otherDigits.length} digits) simultaneously`, 'info');

        return Promise.all([
          executeDigitBurst(legKey, contractType, roundedStake, burstDigits, setLegState, isLeg1),
          executeDigitBurst(otherLegKey, otherContractType, otherStake, otherDigits, otherSetLegState, otherIsLeg1),
        ]).then(() => {
          setTimeout(() => { if (isRunningRef.current) executeTrade(legKey); }, 1000);
        });
      } else {
        setLegState((prev) => ({ ...prev, isTrading: true }));
        return executeDigitBurst(legKey, contractType, roundedStake, burstDigits, setLegState, isLeg1);
      }
    }

    setLegState((prev) => ({ ...prev, isTrading: true }));

    try {
      const proposalPayload: Record<string, unknown> = {
        proposal: 1,
        amount: roundedStake,
        basis: 'stake',
        contract_type: contractType,
        currency: 'USD',
        underlying_symbol: config.symbol,
      };

      if (config.mode === 'accumulators') {
        proposalPayload.growth_rate = config.growthRate;
      } else {
        proposalPayload.duration = config.duration;
        proposalPayload.duration_unit = config.durationUnit || 't';

        if (
          computedMode === 'digits-match-differ' ||
          computedMode === 'digits-over-under' ||
          computedMode === 'match-only' ||
          computedMode === 'differ-only' ||
          computedMode === 'over-only' ||
          computedMode === 'under-only' ||
          contractType === 'DIGITMATCH' ||
          contractType === 'DIGITDIFF' ||
          contractType === 'DIGITOVER' ||
          contractType === 'DIGITUNDER'
        ) {
          proposalPayload.barrier = String(selectedDigit);
        }
      }

      addLog(`[${leg.label}] Requesting proposal... Stake: $${roundedStake.toFixed(2)}`);
      
      const proposalResponse = await ws.send<any>(proposalPayload);
      const proposalId = proposalResponse.proposal?.id;

      if (!proposalId) {
        throw new Error('Failed to retrieve proposal ID.');
      }

      addLog(`[${leg.label}] Proposal received. Buying contract...`);
      const buyResponse = await ws.send<any>({
        buy: proposalId,
        price: roundedStake,
      });

      const contractId = buyResponse.buy?.contract_id;
      if (!contractId) {
        throw new Error('Contract purchase did not return a contract ID.');
      }

      addLog(`[${leg.label}] Bought contract ID ${contractId}`, 'success');

      if (typeof window !== 'undefined' && (window as any).copyTradeBridge) {
        (window as any).copyTradeBridge(
          contractType,
          roundedStake,
          config.duration,
          config.durationUnit || 't',
          config.symbol,
          contractType.startsWith('DIGIT') ? selectedDigit : undefined
        ).catch(() => {});
      }

      setLegState((prev) => ({
        ...prev,
        isTrading: false,
        activeContractId: contractId,
      }));

      setStats((prev) => ({
        ...prev,
        totalTrades: prev.totalTrades + 1,
      }));

      let unsubscribed = false;
      let unsubscribeContract: () => void = () => {};

      const handleContractUpdate = (data: any) => {
        const poc = data.proposal_open_contract;
        if (!poc || poc.contract_id !== contractId || unsubscribed) return;

        if (config.mode === 'accumulators' && config.accumulatorAutoSellOffset && config.accumulatorAutoSellOffset > 0) {
          const buyPrice = parseFloat(poc.buy_price) || roundedStake;
          const currentProfit = parseFloat(poc.profit) || 0;
          const profitPerc = (currentProfit / buyPrice) * 100;
          if (profitPerc >= config.accumulatorAutoSellOffset && poc.status === 'open' && poc.is_valid_to_sell) {
            ws.send({ sell: contractId, price: 0 }).then(() => {
              addLog(`[System] [Auto-Sell] Secured Accumulator profit at ${profitPerc.toFixed(1)}%`, 'success');
            }).catch(() => {});
          }
        }

        if (poc.is_expired || poc.status !== 'open') {
          unsubscribed = true;
          unsubscribeContract();
          activeUnsubsRef.current = activeUnsubsRef.current.filter((u) => u !== unsubscribeContract);

          const profitLoss = parseFloat(poc.profit) || 0;
          const isWin = poc.status === 'won';

          addLog(
            `[${leg.label}] Contract ${contractId} finished. P/L: $${profitLoss.toFixed(2)} (${isWin ? 'WIN' : 'LOSS'})`,
            isWin ? 'success' : 'error'
          );

          setStats((prev) => {
            const nextProfit = prev.totalProfit + profitLoss;
            return {
              ...prev,
              wins: prev.wins + (isWin ? 1 : 0),
              losses: prev.losses + (isWin ? 0 : 1),
              totalProfit: nextProfit,
            };
          });

          // Dynamic AI Recovery selection
          let finalRecovery = config.recoveryMethod || 'martingale';
          if (config.aiRecoveryMode || finalRecovery === 'ai_auto') {
            const winRate = curStats.totalTrades > 0 ? (curStats.wins / curStats.totalTrades) : 0.5;
            if (winRate < 0.4) finalRecovery = 'fibonacci';
            else if (winRate < 0.5) finalRecovery = 'oscars_grind';
            else finalRecovery = 'martingale';
          }

          let nextStake = calculateNextStake(
            legKey,
            isWin,
            roundedStake,
            config.baseStake,
            config.martingaleMultiplier,
            finalRecovery
          );

          if (config.martingaleSplitMode === 'optional' && !isWin && nextStake > config.baseStake * 6) {
            splitCountRef.current = 2;
            splitStakeRef.current = Math.round((nextStake / 2) * 100) / 100;
            addLog(`[System] [Splitter] Stake of $${nextStake.toFixed(2)} split into 2 recovery trades of $${splitStakeRef.current.toFixed(2)}`, 'warn');
            nextStake = splitStakeRef.current;
          }

          if (isWin) {
            splitCountRef.current = 0;
            ghostLossesRef.current = 0;
          } else if (splitCountRef.current > 0) {
            splitCountRef.current--;
            if (splitCountRef.current > 0) {
              nextStake = splitStakeRef.current;
            }
          }

          if (config.isHedgeMode) {
            setLegState((prevLeg) => ({
              ...prevLeg,
              activeContractId: null,
              lastResult: isWin ? 'win' : 'loss',
              profit: prevLeg.profit + profitLoss,
              currentStake: nextStake,
            }));
          } else {
            activeStakeRef.current = nextStake;
            setLegState((prevLeg) => ({
              ...prevLeg,
              activeContractId: null,
              lastResult: isWin ? 'win' : 'loss',
              profit: prevLeg.profit + profitLoss,
              currentStake: nextStake,
            }));

            const otherSetLegState = isLeg1 ? setLeg2 : setLeg1;
            otherSetLegState((prevLeg) => ({
              ...prevLeg,
              currentStake: nextStake,
            }));
          }

          // Evaluate win/loss for Cool-Off
          if (isWin) {
            consecutiveWinsRef.current++;
            consecutiveLossesRef.current = 0;
          } else {
            consecutiveLossesRef.current++;
            consecutiveWinsRef.current = 0;
          }

          let delay = 1000;
          if (config.enableCoolOff) {
            const lossLimit = dynamicLossesLimitRef.current;
            const winLimit = dynamicWinsLimitRef.current;
            if (lossLimit && consecutiveLossesRef.current >= lossLimit) {
              const baseDuration = config.coolOffDuration || 60;
              const coolSecs = config.aiRandomCoolOff
                ? Math.round(baseDuration + (Math.random() * 10 - 5)) // ±5s jitter
                : baseDuration;
              const coolTime = Math.max(1, coolSecs) * 1000;
              coolOffUntilRef.current = Date.now() + coolTime;
              addLog(`[System] 🤖 AI Cool-Off: ${consecutiveLossesRef.current} consecutive losses. Pausing for ${Math.round(coolTime / 1000)}s...`, 'warn');
              consecutiveLossesRef.current = 0;
              delay = coolTime;
              // Re-randomize next thresholds
              if (config.aiRandomCoolOff) {
                dynamicLossesLimitRef.current = Math.max(1, (config.coolOffConsecutiveLosses || 3) + Math.floor(Math.random() * 3) - 1);
                dynamicWinsLimitRef.current = Math.max(1, (config.coolOffConsecutiveWins || 3) + Math.floor(Math.random() * 3) - 1);
              }
            } else if (winLimit && consecutiveWinsRef.current >= winLimit) {
              const baseDuration = config.coolOffDuration || 60;
              const coolSecs = config.aiRandomCoolOff
                ? Math.round(baseDuration + (Math.random() * 10 - 5))
                : baseDuration;
              const coolTime = Math.max(1, coolSecs) * 1000;
              coolOffUntilRef.current = Date.now() + coolTime;
              addLog(`[System] 🤖 AI Cool-Off: ${consecutiveWinsRef.current} consecutive wins. Pausing for ${Math.round(coolTime / 1000)}s...`, 'info');
              consecutiveWinsRef.current = 0;
              delay = coolTime;
              if (config.aiRandomCoolOff) {
                dynamicWinsLimitRef.current = Math.max(1, (config.coolOffConsecutiveWins || 3) + Math.floor(Math.random() * 3) - 1);
                dynamicLossesLimitRef.current = Math.max(1, (config.coolOffConsecutiveLosses || 3) + Math.floor(Math.random() * 3) - 1);
              }
            }
          }

          setTimeout(() => {
            if (isRunningRef.current) {
              executeTrade(nextLegToExecute);
            }
          }, delay);
        }
      };

      const subResult = await ws.subscribe(
        {
          proposal_open_contract: 1,
          contract_id: contractId,
          subscribe: 1,
        },
        handleContractUpdate
      );

      unsubscribeContract = subResult.unsubscribe;
      activeUnsubsRef.current.push(unsubscribeContract);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown trade placement error';
      addLog(`[${leg.label}] Error: ${errMsg}`, 'error');
      setLegState((prev) => ({ ...prev, isTrading: false, activeContractId: null }));
      
      const persistentErrors = [
        'unknown contract proposal',
        'barrier is not allowed',
        'contract type is not allowed',
        'invalid contract type',
        'contract proposal is invalid',
        'not available',
        'invalid symbol'
      ];
      const isPersistent = persistentErrors.some(pe => errMsg.toLowerCase().includes(pe));
      if (isPersistent) {
        stopAutoTrade(`Stopped due to configuration error: ${errMsg}`);
        return;
      }

      setTimeout(() => {
        if (isRunningRef.current) {
          executeTrade(legKey);
        }
      }, 5000);
    }
  }, [ws, isConnected, addLog, stopAutoTrade, calculateNextStake, simulateContractOutcome]);

  // ── Helper: place proposal ───────────────────────────────────────────────
  const placeProposal = useCallback(
    async (contractType: string, stakeAmount: number, config: AutoTradeConfig, dynamicDigit?: number, useWs?: DerivWS): Promise<string> => {
      const activeWs = useWs || ws;
      if (!activeWs) throw new Error('No WebSocket connection');

      const proposalPayload: Record<string, unknown> = {
        proposal: 1,
        amount: stakeAmount,
        basis: 'stake',
        contract_type: contractType,
        currency: 'USD',
        underlying_symbol: config.symbol,
      };

      if (contractType === 'ACCU') {
        proposalPayload.growth_rate = config.growthRate;
      } else {
        proposalPayload.duration = config.duration;
        proposalPayload.duration_unit = config.durationUnit || 't';
        
        const isDigitPrediction = ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(contractType);
        if (isDigitPrediction) {
          proposalPayload.barrier = String(dynamicDigit !== undefined ? dynamicDigit : config.selectedDigit[0]);
        }

        const isBarrierContract = ['HIGHER', 'LOWER', 'ONETOUCH', 'NOTOUCH'].includes(contractType);
        if (isBarrierContract) {
          let rawOffset = config.barrierOffset || '0.1';
          if (!rawOffset.startsWith('+') && !rawOffset.startsWith('-')) {
            if (contractType === 'HIGHER' || contractType === 'ONETOUCH') {
              proposalPayload.barrier = '+' + rawOffset;
            } else {
              proposalPayload.barrier = '-' + rawOffset;
            }
          } else {
            proposalPayload.barrier = rawOffset;
          }
        }
      }

      try {
        const resp = await activeWs.send<any>(proposalPayload);
        if (resp.error) {
          addLog(`[System] Proposal failed for type '${contractType}'. Payload: ${JSON.stringify(proposalPayload)}. Error: ${resp.error.message}`, 'error');
          throw new Error(resp.error.message ?? 'Proposal failed');
        }
        const proposalId = resp.proposal?.id;
        if (!proposalId) throw new Error('Failed to retrieve proposal ID.');
        return proposalId;
      } catch (err) {
        addLog(`[System] placeProposal error for '${contractType}': ${err instanceof Error ? err.message : String(err)}`, 'error');
        throw err;
      }
    },
    [ws]
  );

  // ── Helper: buy contract ──────────────────────────────────────────────────
  const buyContract = useCallback(
    async (proposalId: string, stakeAmount: number, useWs?: DerivWS): Promise<{ contractId: number }> => {
      const activeWs = useWs || ws;
      if (!activeWs) throw new Error('No WebSocket connection');

      const buyResp = await activeWs.send<any>({
        buy: proposalId,
        price: stakeAmount,
      });

      if (buyResp.error) throw new Error(buyResp.error.message ?? 'Buy failed');

      const contractId = buyResp.buy?.contract_id;
      if (!contractId) throw new Error('Buy response missing contract ID.');

      return { contractId };
    },
    [ws]
  );

  // ── Helper: wait for result ───────────────────────────────────────────────
  const waitForResult = useCallback(
    (contractId: number, useWs?: DerivWS): Promise<{ won: boolean; profit: number }> => {
      const activeWs = useWs || ws;
      return new Promise((resolve, reject) => {
        if (!activeWs) return reject(new Error('No WebSocket'));

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

        const globalUnsub = activeWs.onMessage(handleContractUpdate);

        activeWs.subscribe(
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

        const timer = setTimeout(() => {
          resolved = true;
          cleanup();
          reject(new Error('Contract result timeout after 2 minutes'));
        }, 120_000);
      });
    },
    [ws]
  );

  // ── Unified Simultaneous Hedge/Triple Loop ───────────────────────────────────────
  const executeHedgeRound = useCallback(async () => {
    if (!ws || !isConnected || !isRunningRef.current || !configRef.current) return;

    const config = configRef.current;
    
    // Check Cool-Off
    if (config.enableCoolOff && coolOffUntilRef.current && Date.now() < coolOffUntilRef.current) {
      const timeLeftMs = coolOffUntilRef.current - Date.now();
      addLog(`[System] Cool-Off Active. Pausing next hedge round for ${(timeLeftMs / 1000).toFixed(0)}s...`, 'info');
      setTimeout(() => {
        if (isRunningRef.current) {
          executeHedgeRound();
        }
      }, timeLeftMs);
      return;
    }

    // Check limits
    const curStats = statsRef.current;
    if (config.takeProfit > 0 && curStats.totalProfit >= config.takeProfit) {
      stopAutoTrade(`Take Profit target of $${config.takeProfit.toFixed(2)} reached!`);
      return;
    }
    if (config.stopLoss > 0 && curStats.totalProfit <= -config.stopLoss) {
      stopAutoTrade(`Stop Loss limit of $${config.stopLoss.toFixed(2)} hit.`);
      return;
    }

    peakProfitRef.current = Math.max(peakProfitRef.current, curStats.totalProfit);
    if (config.trailingProfitLock && config.trailingProfitLock > 0 && peakProfitRef.current > 0) {
      const lockedFloor = Math.max(0, peakProfitRef.current * (config.trailingProfitLock / 100));
      if (curStats.totalProfit <= lockedFloor && curStats.totalProfit < peakProfitRef.current) {
        stopAutoTrade(`Trailing Profit Lock triggered: Secured $${curStats.totalProfit.toFixed(2)} (High-Water Mark: $${peakProfitRef.current.toFixed(2)}).`);
        return;
      }
    }

    if (config.maxTradesLimit && config.maxTradesLimit > 0 && curStats.totalTrades >= config.maxTradesLimit) {
      stopAutoTrade(`Max Trades Limit of ${config.maxTradesLimit} reached.`);
      return;
    }

    // Determine Triple Mode or Hedge Mode
    let isTripleMode = false;
    let targetsList: string[] = [];
    if (config.multiDigitObjectives) {
      targetsList = config.multiDigitObjectives.split(',').map(x => x.trim()).filter(x => x !== '');
      if (targetsList.length === 3) {
        isTripleMode = true;
      }
    }

    // Target digit / operator parser helper
    const parseTarget = (str: string) => {
      // Special no-digit types: EVEN, ODD, RISE, FALL
      const upper = str.toUpperCase().trim();
      if (upper === 'EVEN') return { type: 'DIGITEVEN', digit: 0 };
      if (upper === 'ODD')  return { type: 'DIGITODD',  digit: 0 };
      if (upper === 'RISE' || upper === 'CALL') return { type: 'CALL', digit: 0 };
      if (upper === 'FALL' || upper === 'PUT')  return { type: 'PUT',  digit: 0 };
      // Digit-based types: >5 <3 =5 !=4
      const match = str.match(/^([><=!]+)?(\d+)$/);
      if (match) {
        const op = match[1] || '=';
        const digit = parseInt(match[2], 10);
        const type = op === '>' ? 'DIGITOVER' :
                     (op === '<' ? 'DIGITUNDER' :
                     (op === '!=' || op === '!' ? 'DIGITDIFF' : 'DIGITMATCH'));
        return { type, digit };
      }
      return { type: 'DIGITMATCH', digit: 5 };
    };

    // Cycle digit indices once per round for multi-leg trades
    const dArr1 = config.selectedDigit;
    const dArr2 = config.selectedDigit2 || config.selectedDigit;
    const dArr3 = config.selectedDigit;
    const dig1 = dArr1.length > 0 ? dArr1[digitIndex1Ref.current % dArr1.length] : 5;
    const dig2 = dArr2.length > 0 ? dArr2[digitIndex2Ref.current % dArr2.length] : dig1;
    const dig3 = dArr3.length > 0 ? dArr3[digitIndex3Ref.current % dArr3.length] : 5;
    if (dArr1.length > 1) digitIndex1Ref.current++;
    if (dArr2.length > 1) digitIndex2Ref.current++;
    if (dArr3.length > 1) digitIndex3Ref.current++;
    let selectedDigit = dig1;
    let contractType1 = leg1Ref.current.contractType;
    let contractType2 = leg2Ref.current.contractType;
    let contractType3 = leg3Ref.current.contractType;
    let digit1 = dig1;
    let digit2 = dig2;
    let digit3 = dig3;

    if (isTripleMode) {
      const p1 = parseTarget(targetsList[0]);
      contractType1 = p1.type;
      digit1 = p1.digit;

      const p2 = parseTarget(targetsList[1]);
      contractType2 = p2.type;
      digit2 = p2.digit;

      const p3 = parseTarget(targetsList[2]);
      contractType3 = p3.type;
      digit3 = p3.digit;
      
      addLog(`[System] Triple Mode Active: L1 (${targetsList[0]}), L2 (${targetsList[1]}), L3 (${targetsList[2]})`);
    } else {
      // 2-Leg setups: AI signals and Multi-digits
      if (config.multiDigitObjectives && targetsList.length > 0) {
        selectedDigit = parseInt(targetsList[multiDigitIndexRef.current % targetsList.length], 10);
        if (isNaN(selectedDigit)) {
          const parsed = parseTarget(targetsList[multiDigitIndexRef.current % targetsList.length]);
          selectedDigit = parsed.digit;
          contractType1 = parsed.type;
        } else {
          contractType1 = 'DIGITMATCH';
        }
        multiDigitIndexRef.current++;
        digit1 = selectedDigit;
        digit2 = selectedDigit;
        addLog(`[System] Multi-digit objective: Selected target digit ${selectedDigit} for this round.`);
      }

      if (config.aiSignalsDriven && typeof window !== 'undefined' && (window as any).latestAiSignal) {
        const ai = (window as any).latestAiSignal;
        if (config.mode === 'rise-fall') {
          contractType1 = ai.direction;
          contractType2 = ai.direction === 'CALL' ? 'PUT' : 'CALL';
        } else if (config.mode === 'digits-even-odd') {
          contractType1 = ai.evenOdd;
          contractType2 = ai.evenOdd === 'DIGITEVEN' ? 'DIGITODD' : 'DIGITEVEN';
        } else if (config.mode.startsWith('digits')) {
          selectedDigit = ai.predictionDigit;
          digit1 = selectedDigit;
          digit2 = selectedDigit;
        }
        addLog(`[System] AI Recommendations applied to Hedge Legs: ${contractType1} & ${contractType2}`, 'info');
      }
    }

    // Ghost Trading Bypass (Hedge/Triple)
    const threshold = config.ghostLossThreshold || 0;
    if (threshold > 0) {
      const isL1Ghost = ghostLosses1Ref.current < threshold;
      const isL2Ghost = ghostLosses2Ref.current < threshold;
      const isL3Ghost = isTripleMode ? (ghostLosses3Ref.current < threshold) : false;

      if (isL1Ghost && isL2Ghost && (!isTripleMode || isL3Ghost)) {
        addLog(`[System] [Ghost Mode] Simulating virtual round...`);
        const simPromises = [
          simulateContractOutcome(contractType1, config.duration, digit1),
          simulateContractOutcome(contractType2, config.duration, digit2)
        ];
        if (isTripleMode) {
          simPromises.push(simulateContractOutcome(contractType3, config.duration, digit3));
        }

        Promise.all(simPromises).then((results) => {
          const outcome1 = results[0];
          const outcome2 = results[1];
          const outcome3 = results[2];

          if (outcome1.won) ghostLosses1Ref.current = 0; else ghostLosses1Ref.current++;
          if (outcome2.won) ghostLosses2Ref.current = 0; else ghostLosses2Ref.current++;
          if (isTripleMode && outcome3) {
            if (outcome3.won) ghostLosses3Ref.current = 0; else ghostLosses3Ref.current++;
          }

          addLog(`[System] [Ghost Mode] Virtual results: L1 ${outcome1.won ? 'WIN' : 'LOSS'}, L2 ${outcome2.won ? 'WIN' : 'LOSS'}${isTripleMode && outcome3 ? `, L3 ${outcome3.won ? 'WIN' : 'LOSS'}` : ''}`);
          
          setTimeout(() => {
            if (isRunningRef.current) {
              executeHedgeRound();
            }
          }, 1000);
        });
        return;
      }
    }

    setLeg1((prev) => ({ ...prev, isTrading: true }));
    setLeg2((prev) => ({ ...prev, isTrading: true }));
    if (isTripleMode) {
      setLeg3((prev) => ({ ...prev, isTrading: true }));
    }

    // Determine Stakes
    let currentStake1 = leg1Ref.current.currentStake;
    if (splitCount1Ref.current > 0) currentStake1 = splitStake1Ref.current;
    const roundedStake1 = Math.round(currentStake1 * 100) / 100;

    let currentStake2 = leg2Ref.current.currentStake;
    if (splitCount2Ref.current > 0) currentStake2 = splitStake2Ref.current;
    const roundedStake2 = Math.round(currentStake2 * 100) / 100;

    let currentStake3 = leg3Ref.current.currentStake;
    if (splitCount3Ref.current > 0) currentStake3 = splitStake3Ref.current;
    const roundedStake3 = Math.round(currentStake3 * 100) / 100;

    try {
      addLog(`[System] Placing simultaneously: L1 ($${roundedStake1.toFixed(2)})${isTripleMode ? `, L2 ($${roundedStake2.toFixed(2)}), L3 ($${roundedStake3.toFixed(2)})` : ` & L2 ($${roundedStake2.toFixed(2)})`}...`);

      // 1. Get proposals in parallel
      const proposalPromises = [
        placeProposal(contractType1, roundedStake1, config, digit1),
        placeProposal(contractType2, roundedStake2, config, digit2)
      ];
      if (isTripleMode) {
        proposalPromises.push(placeProposal(contractType3, roundedStake3, config, digit3));
      }
      const proposals = await Promise.all(proposalPromises);

      // 2. Buy in parallel
      const buyPromises = [
        buyContract(proposals[0], roundedStake1),
        buyContract(proposals[1], roundedStake2)
      ];
      if (isTripleMode) {
        buyPromises.push(buyContract(proposals[2], roundedStake3));
      }
      const res = await Promise.all(buyPromises);

      addLog(`[Leg 1] Bought contract ID ${res[0].contractId}`, 'success');
      addLog(`[Leg 2] Bought contract ID ${res[1].contractId}`, 'success');
      if (isTripleMode) {
        addLog(`[Leg 3] Bought contract ID ${res[2].contractId}`, 'success');
      }

      // Copy Trading Bridge replicates trades
      if (typeof window !== 'undefined' && (window as any).copyTradeBridge) {
        (window as any).copyTradeBridge(contractType1, roundedStake1, config.duration, config.durationUnit || 't', config.symbol, digit1).catch(() => {});
        (window as any).copyTradeBridge(contractType2, roundedStake2, config.duration, config.durationUnit || 't', config.symbol, digit2).catch(() => {});
        if (isTripleMode) {
          (window as any).copyTradeBridge(contractType3, roundedStake3, config.duration, config.durationUnit || 't', config.symbol, digit3).catch(() => {});
        }
      }

      setLeg1((prev) => ({ ...prev, isTrading: false, activeContractId: res[0].contractId }));
      setLeg2((prev) => ({ ...prev, isTrading: false, activeContractId: res[1].contractId }));
      if (isTripleMode) {
        setLeg3((prev) => ({ ...prev, isTrading: false, activeContractId: res[2].contractId }));
      }

      setStats((prev) => ({
        ...prev,
        totalTrades: prev.totalTrades + (isTripleMode ? 3 : 2),
      }));

      // 3. Wait for outcomes in parallel
      const outcomePromises = [
        waitForResult(res[0].contractId),
        waitForResult(res[1].contractId)
      ];
      if (isTripleMode) {
        outcomePromises.push(waitForResult(res[2].contractId));
      }
      const outcomes = await Promise.all(outcomePromises);

      const p1 = outcomes[0].profit;
      const w1 = outcomes[0].won;
      const p2 = outcomes[1].profit;
      const w2 = outcomes[1].won;
      const p3 = isTripleMode ? outcomes[2].profit : 0;
      const w3 = isTripleMode ? outcomes[2].won : true;

      const roundNet = p1 + p2 + p3;

      addLog(`[Leg 1] Finished. P/L: $${p1.toFixed(2)} (${w1 ? 'WIN' : 'LOSS'})`, w1 ? 'success' : 'error');
      addLog(`[Leg 2] Finished. P/L: $${p2.toFixed(2)} (${w2 ? 'WIN' : 'LOSS'})`, w2 ? 'success' : 'error');
      if (isTripleMode) {
        addLog(`[Leg 3] Finished. P/L: $${p3.toFixed(2)} (${w3 ? 'WIN' : 'LOSS'})`, w3 ? 'success' : 'error');
      }

      // Update stats
      setStats((prev) => ({
        ...prev,
        wins: prev.wins + (w1 ? 1 : 0) + (w2 ? 1 : 0) + (isTripleMode && w3 ? 1 : 0),
        losses: prev.losses + (w1 ? 0 : 1) + (w2 ? 0 : 1) + (isTripleMode && !w3 ? 1 : 0),
        totalProfit: prev.totalProfit + roundNet,
      }));

      // Reset ghost streak on real wins
      if (w1) ghostLosses1Ref.current = 0;
      if (w2) ghostLosses2Ref.current = 0;
      if (isTripleMode && w3) ghostLosses3Ref.current = 0;

      // Dynamic AI Recovery selection
      let finalRecovery = config.recoveryMethod || 'martingale';
      if (config.aiRecoveryMode || finalRecovery === 'ai_auto') {
        const winRate = curStats.totalTrades > 0 ? (curStats.wins / curStats.totalTrades) : 0.5;
        if (winRate < 0.4) finalRecovery = 'fibonacci';
        else if (winRate < 0.5) finalRecovery = 'oscars_grind';
        else finalRecovery = 'martingale';
      }

      // Decide next stakes:
      const baseStake2 = config.baseStake2 !== undefined ? config.baseStake2 : config.baseStake;
      let nextStake1 = config.baseStake;
      let nextStake2 = baseStake2;
      let nextStake3 = config.baseStake;

      if (isTripleMode) {
        // 1. Calculate standard next stakes
        let stdNext1 = calculateNextStake('leg1', w1, roundedStake1, config.baseStake, config.martingaleMultiplier, finalRecovery);
        let stdNext2 = calculateNextStake('leg2', w2, roundedStake2, baseStake2, config.martingaleMultiplier, finalRecovery);
        let stdNext3 = calculateNextStake('leg3', w3, roundedStake3, config.baseStake, config.martingaleMultiplier, finalRecovery);

        // 2. Identify equal digit legs
        const isEq1 = targetsList[0]?.startsWith('=') || contractType1 === 'DIGITMATCH';
        const isEq2 = targetsList[1]?.startsWith('=') || contractType2 === 'DIGITMATCH';
        const isEq3 = targetsList[2]?.startsWith('=') || contractType3 === 'DIGITMATCH';

        // 3. Apply Equal Digit Loss Splitting
        if (isEq1 && !w1) {
          const splitRecovery = Math.round((roundedStake1 / 2) * config.martingaleMultiplier * 100) / 100;
          stdNext1 = config.baseStake; // Equal leg resets
          stdNext2 += splitRecovery;
          stdNext3 += splitRecovery;
          addLog(`[System] [Equal Digit Loss] Leg 1 lost. Split recovery of $${splitRecovery.toFixed(2)} added to Leg 2 and Leg 3.`, 'warn');
        }
        if (isEq2 && !w2) {
          const splitRecovery = Math.round((roundedStake2 / 2) * config.martingaleMultiplier * 100) / 100;
          stdNext2 = config.baseStake; // Equal leg resets
          stdNext1 += splitRecovery;
          stdNext3 += splitRecovery;
          addLog(`[System] [Equal Digit Loss] Leg 2 lost. Split recovery of $${splitRecovery.toFixed(2)} added to Leg 1 and Leg 3.`, 'warn');
        }
        if (isEq3 && !w3) {
          const splitRecovery = Math.round((roundedStake3 / 2) * config.martingaleMultiplier * 100) / 100;
          stdNext3 = config.baseStake; // Equal leg resets
          stdNext1 += splitRecovery;
          stdNext2 += splitRecovery;
          addLog(`[System] [Equal Digit Loss] Leg 3 lost. Split recovery of $${splitRecovery.toFixed(2)} added to Leg 1 and Leg 2.`, 'warn');
        }

        // 4. Apply Intertrade Switch Routing if enabled
        if (config.isAlternateMode) {
          const winners: number[] = [];
          const losers: number[] = [];
          if (w1) winners.push(1); else losers.push(1);
          if (w2) winners.push(2); else losers.push(2);
          if (w3) winners.push(3); else losers.push(3);

          if (winners.length === 1) {
            // One winner, route all recoveries to the winner
            const wIdx = winners[0];
            const rec1 = Math.max(0, stdNext1 - config.baseStake);
            const rec2 = Math.max(0, stdNext2 - config.baseStake);
            const rec3 = Math.max(0, stdNext3 - config.baseStake);

            if (wIdx === 1) {
              nextStake1 = Math.round((config.baseStake + rec1 + rec2 + rec3) * 100) / 100;
              nextStake2 = config.baseStake;
              nextStake3 = config.baseStake;
            } else if (wIdx === 2) {
              nextStake2 = Math.round((config.baseStake + rec1 + rec2 + rec3) * 100) / 100;
              nextStake1 = config.baseStake;
              nextStake3 = config.baseStake;
            } else {
              nextStake3 = Math.round((config.baseStake + rec1 + rec2 + rec3) * 100) / 100;
              nextStake1 = config.baseStake;
              nextStake2 = config.baseStake;
            }
            addLog(`[System] Intertrade Switch: Routed all recoveries to Leg ${wIdx}.`, 'info');
          } else if (winners.length === 2) {
            // Two winners, one loser. Split the loser's recovery between the two winners
            const lIdx = losers[0];
            const loserRec = (lIdx === 1 ? stdNext1 : (lIdx === 2 ? stdNext2 : stdNext3)) - config.baseStake;
            const splitRec = Math.round((Math.max(0, loserRec) / 2) * 100) / 100;

            nextStake1 = stdNext1;
            nextStake2 = stdNext2;
            nextStake3 = stdNext3;

            if (lIdx === 1) {
              nextStake1 = config.baseStake;
              nextStake2 = Math.round((nextStake2 + splitRec) * 100) / 100;
              nextStake3 = Math.round((nextStake3 + splitRec) * 100) / 100;
            } else if (lIdx === 2) {
              nextStake2 = config.baseStake;
              nextStake1 = Math.round((nextStake1 + splitRec) * 100) / 100;
              nextStake3 = Math.round((nextStake3 + splitRec) * 100) / 100;
            } else {
              nextStake3 = config.baseStake;
              nextStake1 = Math.round((nextStake1 + splitRec) * 100) / 100;
              nextStake2 = Math.round((nextStake2 + splitRec) * 100) / 100;
            }
            addLog(`[System] Intertrade Switch: Split Leg ${lIdx} recovery ($${loserRec.toFixed(2)}) between the two winning legs.`, 'info');
          } else {
            // All won or all lost. Keep standard stakes
            nextStake1 = stdNext1;
            nextStake2 = stdNext2;
            nextStake3 = stdNext3;
          }
        } else {
          // Standard linear recovery
          nextStake1 = stdNext1;
          nextStake2 = stdNext2;
          nextStake3 = stdNext3;
        }
      } else if (config.isAlternateMode) {
        // Intertrade Switch Recovery:
        if (config.mode === 'digits-match-differ') {
          // Custom Rule: Matches (Leg 1) lost, Differ (Leg 2) won -> recover on Differ.
          // Differ (Leg 2) lost, Matches (Leg 1) won -> recover on Differ itself (interchange disabled for Matches recovery).
          if (!w1 && w2) {
            nextStake1 = config.baseStake;
            nextStake2 = calculateNextStake('leg2', false, roundedStake1, baseStake2, config.martingaleMultiplier, finalRecovery);
            addLog(`[System] Intertrade Switch (MD): Leg 1 (Match) Lost / Leg 2 (Differ) Won. Recovery stake $${nextStake2.toFixed(2)} -> Leg 2.`, 'info');
          } else if (w1 && !w2) {
            nextStake1 = config.baseStake;
            nextStake2 = calculateNextStake('leg2', false, roundedStake2, baseStake2, config.martingaleMultiplier, finalRecovery);
            addLog(`[System] Intertrade Switch (MD): Leg 2 (Differ) Lost / Leg 1 (Match) Won. Recovery kept on Leg 2: $${nextStake2.toFixed(2)}.`, 'info');
          } else if (!w1 && !w2) {
            nextStake1 = config.baseStake;
            nextStake2 = calculateNextStake('leg2', false, roundedStake2, baseStake2, config.martingaleMultiplier, finalRecovery);
            addLog(`[System] Intertrade Switch (MD): Both legs lost. Leg 1 reset, recovery on Leg 2: $${nextStake2.toFixed(2)}.`, 'info');
          } else {
            // Both won
            nextStake1 = config.baseStake;
            nextStake2 = baseStake2;
          }
        } else {
          // Standard Intertrade Switch:
          if (!w1 && w2) {
            nextStake1 = config.baseStake;
            nextStake2 = calculateNextStake('leg2', false, roundedStake1, baseStake2, config.martingaleMultiplier, finalRecovery);
            addLog(`[System] Intertrade Switch: Leg 1 Lost / Leg 2 Won. Recovery stake $${nextStake2.toFixed(2)} -> Leg 2.`, 'info');
          } else if (w1 && !w2) {
            nextStake2 = baseStake2;
            nextStake1 = calculateNextStake('leg1', false, roundedStake2, config.baseStake, config.martingaleMultiplier, finalRecovery);
            addLog(`[System] Intertrade Switch: Leg 2 Lost / Leg 1 Won. Recovery stake $${nextStake1.toFixed(2)} -> Leg 1.`, 'info');
          } else {
            nextStake1 = calculateNextStake('leg1', w1, roundedStake1, config.baseStake, config.martingaleMultiplier, finalRecovery);
            nextStake2 = calculateNextStake('leg2', w2, roundedStake2, baseStake2, config.martingaleMultiplier, finalRecovery);
          }
        }
      } else {
        // Standard Independent Recovery
        nextStake1 = calculateNextStake('leg1', w1, roundedStake1, config.baseStake, config.martingaleMultiplier, finalRecovery);
        nextStake2 = calculateNextStake('leg2', w2, roundedStake2, baseStake2, config.martingaleMultiplier, finalRecovery);
      }

      // Apply Splitter L1
      if (config.martingaleSplitMode === 'optional' && !w1 && nextStake1 > config.baseStake * 6) {
        splitCount1Ref.current = 2;
        splitStake1Ref.current = Math.round((nextStake1 / 2) * 100) / 100;
        addLog(`[System] [Splitter L1] Stake $${nextStake1.toFixed(2)} split into 2 recovery trades of $${splitStake1Ref.current.toFixed(2)}`, 'warn');
        nextStake1 = splitStake1Ref.current;
      }
      if (w1) {
        splitCount1Ref.current = 0;
      } else if (splitCount1Ref.current > 0) {
        splitCount1Ref.current--;
        if (splitCount1Ref.current > 0) nextStake1 = splitStake1Ref.current;
      }

      // Apply Splitter L2
      if (config.martingaleSplitMode === 'optional' && !w2 && nextStake2 > baseStake2 * 6) {
        splitCount2Ref.current = 2;
        splitStake2Ref.current = Math.round((nextStake2 / 2) * 100) / 100;
        addLog(`[System] [Splitter L2] Stake $${nextStake2.toFixed(2)} split into 2 recovery trades of $${splitStake2Ref.current.toFixed(2)}`, 'warn');
        nextStake2 = splitStake2Ref.current;
      }
      if (w2) {
        splitCount2Ref.current = 0;
      } else if (splitCount2Ref.current > 0) {
        splitCount2Ref.current--;
        if (splitCount2Ref.current > 0) nextStake2 = splitStake2Ref.current;
      }

      // Apply Splitter L3
      if (config.martingaleSplitMode === 'optional' && isTripleMode && !w3 && nextStake3 > config.baseStake * 6) {
        splitCount3Ref.current = 2;
        splitStake3Ref.current = Math.round((nextStake3 / 2) * 100) / 100;
        addLog(`[System] [Splitter L3] Stake $${nextStake3.toFixed(2)} split into 2 recovery trades of $${splitStake3Ref.current.toFixed(2)}`, 'warn');
        nextStake3 = splitStake3Ref.current;
      }
      if (isTripleMode) {
        if (w3) {
          splitCount3Ref.current = 0;
        } else if (splitCount3Ref.current > 0) {
          splitCount3Ref.current--;
          if (splitCount3Ref.current > 0) nextStake3 = splitStake3Ref.current;
        }
      }

      setLeg1((prev) => ({
        ...prev,
        activeContractId: null,
        lastResult: w1 ? 'win' : 'loss',
        profit: prev.profit + p1,
        currentStake: nextStake1,
      }));

      setLeg2((prev) => ({
        ...prev,
        activeContractId: null,
        lastResult: w2 ? 'win' : 'loss',
        profit: prev.profit + p2,
        currentStake: nextStake2,
      }));

      if (isTripleMode) {
        setLeg3((prev) => ({
          ...prev,
          activeContractId: null,
          lastResult: w3 ? 'win' : 'loss',
          profit: prev.profit + p3,
          currentStake: nextStake3,
        }));
      }

      // Evaluate round win/loss for Cool-Off
      const roundProfit = p1 + p2 + (isTripleMode ? p3 : 0);
      if (roundProfit > 0) {
        consecutiveWinsRef.current++;
        consecutiveLossesRef.current = 0;
      } else if (roundProfit < 0) {
        consecutiveLossesRef.current++;
        consecutiveWinsRef.current = 0;
      }

      let delay = 1000;
      if (config.enableCoolOff) {
        const lossLimit = dynamicLossesLimitRef.current;
        const winLimit = dynamicWinsLimitRef.current;
        if (lossLimit && consecutiveLossesRef.current >= lossLimit) {
          const baseDuration = config.coolOffDuration || 60;
          const coolSecs = config.aiRandomCoolOff
            ? Math.round(baseDuration + (Math.random() * 10 - 5))
            : baseDuration;
          const coolTime = Math.max(1, coolSecs) * 1000;
          coolOffUntilRef.current = Date.now() + coolTime;
          addLog(`[System] 🤖 AI Cool-Off: ${consecutiveLossesRef.current} consecutive losses. Pausing for ${Math.round(coolTime / 1000)}s...`, 'warn');
          consecutiveLossesRef.current = 0;
          delay = coolTime;
          if (config.aiRandomCoolOff) {
            dynamicLossesLimitRef.current = Math.max(1, (config.coolOffConsecutiveLosses || 3) + Math.floor(Math.random() * 3) - 1);
            dynamicWinsLimitRef.current = Math.max(1, (config.coolOffConsecutiveWins || 3) + Math.floor(Math.random() * 3) - 1);
          }
        } else if (winLimit && consecutiveWinsRef.current >= winLimit) {
          const baseDuration = config.coolOffDuration || 60;
          const coolSecs = config.aiRandomCoolOff
            ? Math.round(baseDuration + (Math.random() * 10 - 5))
            : baseDuration;
          const coolTime = Math.max(1, coolSecs) * 1000;
          coolOffUntilRef.current = Date.now() + coolTime;
          addLog(`[System] 🤖 AI Cool-Off: ${consecutiveWinsRef.current} consecutive wins. Pausing for ${Math.round(coolTime / 1000)}s...`, 'info');
          consecutiveWinsRef.current = 0;
          delay = coolTime;
          if (config.aiRandomCoolOff) {
            dynamicWinsLimitRef.current = Math.max(1, (config.coolOffConsecutiveWins || 3) + Math.floor(Math.random() * 3) - 1);
            dynamicLossesLimitRef.current = Math.max(1, (config.coolOffConsecutiveLosses || 3) + Math.floor(Math.random() * 3) - 1);
          }
        }
      }

      // Trigger next round
      setTimeout(() => {
        if (isRunningRef.current) {
          executeHedgeRound();
        }
      }, delay);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Simultaneous execution failed';
      addLog(`[System] Error: ${errMsg}`, 'error');
      setLeg1((prev) => ({ ...prev, isTrading: false, activeContractId: null }));
      setLeg2((prev) => ({ ...prev, isTrading: false, activeContractId: null }));
      setLeg3((prev) => ({ ...prev, isTrading: false, activeContractId: null }));

      const persistentErrors = [
        'unknown contract proposal',
        'barrier is not allowed',
        'contract type is not allowed',
        'invalid contract type',
        'contract proposal is invalid',
        'not available',
        'invalid symbol'
      ];
      const isPersistent = persistentErrors.some(pe => errMsg.toLowerCase().includes(pe));
      if (isPersistent) {
        stopAutoTrade(`Stopped due to configuration error: ${errMsg}`);
        return;
      }

      setTimeout(() => {
        if (isRunningRef.current) {
          executeHedgeRound();
        }
      }, 5000);
    }
  }, [ws, isConnected, addLog, stopAutoTrade, placeProposal, buyContract, waitForResult, calculateNextStake, simulateContractOutcome]);

  const startAutoTrade = useCallback((config: AutoTradeConfig) => {
    if (!ws || !isConnected) {
      addLog('Cannot start autotrading: WebSocket not connected.', 'error');
      return;
    }

    // Dynamic config overrides for individual modes
    let finalHedge = config.isHedgeMode;
    let finalAlternate = config.isAlternateMode;
    if (config.mode.endsWith('-only') || config.mode === 'ai-auto-individual') {
      finalHedge = false;
      finalAlternate = false;
    }

    const modifiedConfig = {
      ...config,
      isHedgeMode: finalHedge,
      isAlternateMode: finalAlternate,
    };

    configRef.current = modifiedConfig;
    cleanupSubscriptions();

    // Map legs based on trading mode
    let leg1Label = 'Leg 1';
    let leg1Contract = 'CALL';
    let leg2Label = 'Leg 2';
    let leg2Contract = 'PUT';

    switch (modifiedConfig.mode) {
      case 'rise-fall':
        leg1Label = 'Rise (CALL)';
        leg1Contract = 'CALL';
        leg2Label = 'Fall (PUT)';
        leg2Contract = 'PUT';
        break;
      case 'digits-even-odd':
        leg1Label = 'Digit Even';
        leg1Contract = 'DIGITEVEN';
        leg2Label = 'Digit Odd';
        leg2Contract = 'DIGITODD';
        break;
      case 'digits-match-differ':
        leg1Label = 'Digit Match';
        leg1Contract = 'DIGITMATCH';
        leg2Label = 'Digit Differ';
        leg2Contract = 'DIGITDIFF';
        break;
      case 'digits-over-under':
        leg1Label = 'Digit Over';
        leg1Contract = 'DIGITOVER';
        leg2Label = 'Digit Under';
        leg2Contract = 'DIGITUNDER';
        break;
      case 'accumulators':
        leg1Label = 'Accumulator A';
        leg1Contract = 'ACCU';
        leg2Label = 'Accumulator B';
        leg2Contract = 'ACCU';
        break;
      case 'higher-lower':
        leg1Label = 'Higher';
        leg1Contract = 'HIGHER';
        leg2Label = 'Lower';
        leg2Contract = 'LOWER';
        break;
      case 'touch-no-touch':
        leg1Label = 'Touch';
        leg1Contract = 'ONETOUCH';
        leg2Label = 'No Touch';
        leg2Contract = 'NOTOUCH';
        break;
      case 'asian-up-down':
        leg1Label = 'Asian Up';
        leg1Contract = 'ASIANU';
        leg2Label = 'Asian Down';
        leg2Contract = 'ASIAND';
        break;
      case 'reset-call-put':
        leg1Label = 'Reset Call';
        leg1Contract = 'RESETCALL';
        leg2Label = 'Reset Put';
        leg2Contract = 'RESETPUT';
        break;
      case 'rise-only':
        leg1Label = 'Rise (CALL)';
        leg1Contract = 'CALL';
        leg2Label = 'Rise (CALL) [Inactive]';
        leg2Contract = 'CALL';
        break;
      case 'fall-only':
        leg1Label = 'Fall (PUT)';
        leg1Contract = 'PUT';
        leg2Label = 'Fall (PUT) [Inactive]';
        leg2Contract = 'PUT';
        break;
      case 'even-only':
        leg1Label = 'Digit Even';
        leg1Contract = 'DIGITEVEN';
        leg2Label = 'Digit Even [Inactive]';
        leg2Contract = 'DIGITEVEN';
        break;
      case 'odd-only':
        leg1Label = 'Digit Odd';
        leg1Contract = 'DIGITODD';
        leg2Label = 'Digit Odd [Inactive]';
        leg2Contract = 'DIGITODD';
        break;
      case 'match-only':
        leg1Label = 'Digit Match';
        leg1Contract = 'DIGITMATCH';
        leg2Label = 'Digit Match [Inactive]';
        leg2Contract = 'DIGITMATCH';
        break;
      case 'differ-only':
        leg1Label = 'Digit Differ';
        leg1Contract = 'DIGITDIFF';
        leg2Label = 'Digit Differ [Inactive]';
        leg2Contract = 'DIGITDIFF';
        break;
      case 'over-only':
        leg1Label = 'Digit Over';
        leg1Contract = 'DIGITOVER';
        leg2Label = 'Digit Over [Inactive]';
        leg2Contract = 'DIGITOVER';
        break;
      case 'under-only':
        leg1Label = 'Digit Under';
        leg1Contract = 'DIGITUNDER';
        leg2Label = 'Digit Under [Inactive]';
        leg2Contract = 'DIGITUNDER';
        break;
      case 'higher-only':
        leg1Label = 'Higher';
        leg1Contract = 'HIGHER';
        leg2Label = 'Higher [Inactive]';
        leg2Contract = 'HIGHER';
        break;
      case 'lower-only':
        leg1Label = 'Lower';
        leg1Contract = 'LOWER';
        leg2Label = 'Lower [Inactive]';
        leg2Contract = 'LOWER';
        break;
      case 'touch-only':
        leg1Label = 'Touch';
        leg1Contract = 'ONETOUCH';
        leg2Label = 'Touch [Inactive]';
        leg2Contract = 'ONETOUCH';
        break;
      case 'no-touch-only':
        leg1Label = 'No Touch';
        leg1Contract = 'NOTOUCH';
        leg2Label = 'No Touch [Inactive]';
        leg2Contract = 'NOTOUCH';
        break;
      case 'asian-up-only':
        leg1Label = 'Asian Up';
        leg1Contract = 'ASIANU';
        leg2Label = 'Asian Up [Inactive]';
        leg2Contract = 'ASIANU';
        break;
      case 'asian-down-only':
        leg1Label = 'Asian Down';
        leg1Contract = 'ASIAND';
        leg2Label = 'Asian Down [Inactive]';
        leg2Contract = 'ASIAND';
        break;
      case 'reset-call-only':
        leg1Label = 'Reset Call';
        leg1Contract = 'RESETCALL';
        leg2Label = 'Reset Call [Inactive]';
        leg2Contract = 'RESETCALL';
        break;
      case 'reset-put-only':
        leg1Label = 'Reset Put';
        leg1Contract = 'RESETPUT';
        leg2Label = 'Reset Put [Inactive]';
        leg2Contract = 'RESETPUT';
        break;
      case 'ai-auto-combo':
        leg1Label = 'AI Autonomous A';
        leg1Contract = 'CALL';
        leg2Label = 'AI Autonomous B';
        leg2Contract = 'PUT';
        break;
      case 'ai-auto-individual':
        leg1Label = 'AI Autonomous';
        leg1Contract = 'CALL';
        leg2Label = 'AI Autonomous [Inactive]';
        leg2Contract = 'PUT';
        break;
    }

    let leg3Label = 'Leg 3 [Inactive]';
    let leg3Contract = 'DIGITMATCH';

    if (modifiedConfig.multiDigitObjectives) {
      const targets = modifiedConfig.multiDigitObjectives.split(',').map(x => x.trim()).filter(x => x !== '');
      if (targets.length === 3) {
        // Shared resolver that handles EVEN/ODD/RISE/FALL and digit ops
        const resolveTarget = (t: string): string => {
          const u = t.toUpperCase();
          if (u === 'EVEN') return 'DIGITEVEN';
          if (u === 'ODD')  return 'DIGITODD';
          if (u === 'RISE' || u === 'CALL') return 'CALL';
          if (u === 'FALL' || u === 'PUT')  return 'PUT';
          const m = t.match(/^([><=!]+)?(\d+)$/);
          if (!m) return 'DIGITMATCH';
          return m[1] === '>' ? 'DIGITOVER' :
                 (m[1] === '<' ? 'DIGITUNDER' :
                 (m[1] === '!=' || m[1] === '!' ? 'DIGITDIFF' : 'DIGITMATCH'));
        };
        leg1Label = `Leg 1 (${targets[0]})`;
        leg1Contract = resolveTarget(targets[0]);
        leg2Label = `Leg 2 (${targets[1]})`;
        leg2Contract = resolveTarget(targets[1]);
        leg3Label = `Leg 3 (${targets[2]})`;
        leg3Contract = resolveTarget(targets[2]);
      }
    }

    activeStakeRef.current = Math.round(modifiedConfig.baseStake * 100) / 100;
    currentLegRef.current = 'leg1';
    tradeCountRef.current = 0;

    // Reset advanced system tracking refs
    peakProfitRef.current = 0;
    consecutiveWinsRef.current = 0;
    consecutiveLossesRef.current = 0;
    coolOffUntilRef.current = null;
    if (modifiedConfig.enableCoolOff) {
      if (modifiedConfig.aiRandomCoolOff) {
        const initialLosses = modifiedConfig.coolOffConsecutiveLosses ?? 3;
        dynamicLossesLimitRef.current = Math.max(1, initialLosses + Math.floor(Math.random() * 3) - 1);
        const initialWins = modifiedConfig.coolOffConsecutiveWins ?? 3;
        dynamicWinsLimitRef.current = Math.max(1, initialWins + Math.floor(Math.random() * 3) - 1);
      } else {
        dynamicLossesLimitRef.current = modifiedConfig.coolOffConsecutiveLosses ?? 3;
        dynamicWinsLimitRef.current = modifiedConfig.coolOffConsecutiveWins ?? 3;
      }
    }
    fiboIndex1Ref.current = 0;
    fiboIndex2Ref.current = 0;
    fiboIndex3Ref.current = 0;
    ogTarget1Ref.current = 0;
    ogTarget2Ref.current = 0;
    ogTarget3Ref.current = 0;
    ogCurrentUnitProfit1Ref.current = 0;
    ogCurrentUnitProfit2Ref.current = 0;
    ogCurrentUnitProfit3Ref.current = 0;
    ghostLosses1Ref.current = 0;
    ghostLosses2Ref.current = 0;
    ghostLosses3Ref.current = 0;
    multiDigitIndexRef.current = 0;
    digitIndex1Ref.current = 0;
    digitIndex2Ref.current = 0;
    digitIndex3Ref.current = 0;
    splitCount1Ref.current = 0;
    splitStake1Ref.current = 0;
    splitCount2Ref.current = 0;
    splitStake2Ref.current = 0;
    splitCount3Ref.current = 0;
    splitStake3Ref.current = 0;

    setLeg1({
      label: leg1Label,
      contractType: leg1Contract,
      currentStake: activeStakeRef.current,
      isTrading: false,
      activeContractId: null,
      lastResult: null,
      profit: 0,
    });

    setLeg2({
      label: leg2Label,
      contractType: leg2Contract,
      currentStake: modifiedConfig.baseStake2 !== undefined ? Math.round(modifiedConfig.baseStake2 * 100) / 100 : activeStakeRef.current,
      isTrading: false,
      activeContractId: null,
      lastResult: null,
      profit: 0,
    });

    setLeg3({
      label: leg3Label,
      contractType: leg3Contract,
      currentStake: activeStakeRef.current,
      isTrading: false,
      activeContractId: null,
      lastResult: null,
      profit: 0,
    });

    setStats({
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      isRunning: true,
      status: 'running',
    });

    setLogs([]);
    setIsRunning(true);
    addLog(`Starting autotrade in ${modifiedConfig.mode.toUpperCase()} on ${modifiedConfig.symbol}...`, 'info');

    if (modifiedConfig.isHedgeMode) {
      addLog('Hedge Mode enabled. Executing both legs simultaneously.', 'info');
    } else if (modifiedConfig.isAlternateMode) {
      addLog(`Alternate Mode enabled. Alternating recovery every ${modifiedConfig.alternateFrequency} trades sequentially.`, 'info');
    } else {
      addLog('Single execution active. Trading Leg 1 only.', 'info');
    }

    // Trigger initial trades
    setTimeout(() => {
      if (modifiedConfig.isHedgeMode) {
        // Use executeTrade for hedge mode — it detects digit burst and fires both legs simultaneously
        addLog('[System] Hedge mode starting via executeTrade for burst-compatible execution.', 'info');
        executeTrade('leg1');
      } else {
        executeTrade('leg1');
      }
    }, 100);
  }, [ws, isConnected, executeTrade, executeHedgeRound, cleanupSubscriptions, addLog]);

  // Register window.placeAutoTrade for AI signal auto-execution
  useEffect(() => {
    const lastPlaceRef = { ts: 0 };
    window.placeAutoTrade = async (contractType: string, digit: number) => {
      const now = Date.now();
      if (now - lastPlaceRef.ts < 500) return; // 500ms rate-limit guard
      lastPlaceRef.ts = now;
      const cfg = configRef.current;
      if (!cfg || !ws) return;

      try {
        const stake = cfg.baseStake;
        addLog(`[AI Signal] Executing auto-trade: ${contractType} (Digit: ${digit}, Stake: $${stake})`, 'info');
        const propId = await placeProposal(contractType, stake, cfg, digit);
        const buyResp = await buyContract(propId, stake);
        addLog(`[AI Signal] Bought contract ID ${buyResp.contractId}`, 'success');

        // Copy Trading Bridge replicates trades if enabled
        if (typeof window !== 'undefined' && (window as any).copyTradeBridge) {
          (window as any).copyTradeBridge(contractType, stake, cfg.duration, cfg.durationUnit || 't', cfg.symbol, digit).catch(() => {});
        }

        // Wait for outcome and update stats
        waitForResult(buyResp.contractId).then((outcome) => {
          const won = outcome.won;
          const profit = outcome.profit;
          addLog(`[AI Signal] Finished. P/L: $${profit.toFixed(2)} (${won ? 'WIN' : 'LOSS'})`, won ? 'success' : 'error');
          setStats((prev) => ({
            ...prev,
            totalTrades: prev.totalTrades + 1,
            wins: prev.wins + (won ? 1 : 0),
            losses: prev.losses + (won ? 0 : 1),
            totalProfit: prev.totalProfit + profit,
          }));
        }).catch((e) => {
          console.error('[AI Signal] Error waiting for result:', e);
        });
      } catch (err) {
        addLog(`[AI Signal] Trade placement failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    };
    return () => { delete window.placeAutoTrade; };
  }, [ws, placeProposal, buyContract, waitForResult, addLog]);

  return {
    isRunning,
    startAutoTrade,
    stopAutoTrade,
    logs,
    stats,
    leg1,
    leg2,
    leg3,
  };
}
