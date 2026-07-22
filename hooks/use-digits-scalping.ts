'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { DerivWS, ProposalInfo } from '@deriv/core';

type ScalpingStatus = 'idle' | 'running' | 'stopped' | 'completed';

type ScalpingTradeResult = {
  index: number;
  digit: number;
  contractType: string;
  stake: number;
  status: 'pending' | 'won' | 'lost' | 'error';
  profit: number;
  contractId?: number;
  error?: string;
};

type UseDigitsScalpingParams = {
  ws: DerivWS | null;
  isConnected: boolean;
  symbol: string;
  stake: number;
  duration: number;
  durationUnit?: 't' | 's';
  contractType: string;
  selectedDigits: number[];
  tradeCount: number;
  intervalMs: number;
  cycleMode: 'sequential' | 'random';
};

type UseDigitsScalpingReturn = {
  status: ScalpingStatus;
  results: ScalpingTradeResult[];
  currentTradeIndex: number;
  stats: { wins: number; losses: number; totalProfit: number; completed: number };
  start: () => void;
  stop: () => void;
  reset: () => void;
};

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useDigitsScalping({
  ws, isConnected, symbol, stake, duration, durationUnit = 't',
  contractType, selectedDigits, tradeCount, intervalMs, cycleMode,
}: UseDigitsScalpingParams): UseDigitsScalpingReturn {
  const [status, setStatus] = useState<ScalpingStatus>('idle');
  const [results, setResults] = useState<ScalpingTradeResult[]>([]);
  const [currentTradeIndex, setCurrentTradeIndex] = useState(0);

  const runningRef = useRef(false);
  const abortRef = useRef(false);
  const currentProposalReqId = useRef<string | null>(null);
  const unsubsRef = useRef<Set<() => void>>(new Set());
  const digitIndexRef = useRef(0);
  const resultsRef = useRef<ScalpingTradeResult[]>([]);

  const cleanup = useCallback(() => {
    unsubsRef.current.forEach(fn => { try { fn(); } catch {} });
    unsubsRef.current.clear();
    currentProposalReqId.current = null;
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      runningRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  const start = useCallback(() => {
    if (!ws || !isConnected || selectedDigits.length === 0) return;
    if (runningRef.current) return;

    abortRef.current = false;
    runningRef.current = true;
    digitIndexRef.current = 0;
    resultsRef.current = [];
    setResults([]);
    setCurrentTradeIndex(0);
    setStatus('running');

    const totalTrades = Math.min(tradeCount, 100);
    const trades: ScalpingTradeResult[] = [];
    for (let i = 0; i < totalTrades; i++) {
      const digit = cycleMode === 'random'
        ? selectedDigits[Math.floor(Math.random() * selectedDigits.length)]
        : selectedDigits[i % selectedDigits.length];
      trades.push({
        index: i,
        digit,
        contractType,
        stake,
        status: 'pending',
        profit: 0,
      });
    }
    resultsRef.current = trades;
    setResults(trades);

    let currentIdx = 0;

    const executeNext = async () => {
      if (abortRef.current || !runningRef.current || currentIdx >= trades.length) {
        runningRef.current = false;
        if (!abortRef.current) setStatus('completed');
        else setStatus('stopped');
        return;
      }

      const trade = trades[currentIdx];
      setCurrentTradeIndex(currentIdx);

      // Calculate barrier based on contract type
      const needsBarrier = contractType !== 'DIGITEVEN' && contractType !== 'DIGITODD';

      // Generate proposal
      const reqId = `scalp_${generateId()}`;
      currentProposalReqId.current = reqId;

      try {
        const proposalPromise = new Promise<ProposalInfo>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Proposal timeout')), 10000);

          const unsub = ws!.onMessage((data: any) => {
            if (data.msg_type === 'proposal' && data.echo_req?.req_id === reqId && data.proposal) {
              clearTimeout(timeout);
              resolve(data.proposal);
            }
            if (data.msg_type === 'error' && data.echo_req?.req_id === reqId) {
              clearTimeout(timeout);
              reject(new Error(data.error?.message || 'Proposal error'));
            }
          });
          unsubsRef.current.add(unsub);

          ws!.send({
            proposal: 1,
            req_id: reqId,
            amount: stake,
            basis: 'stake',
            contract_type: contractType,
            currency: 'USD',
            duration,
            duration_unit: durationUnit,
            symbol,
            ...(needsBarrier ? { barrier: trade.digit } : {}),
          });
        });

        const proposal = await proposalPromise;

        // Buy the contract
        const buyReqId = `scalp_buy_${generateId()}`;
        const buyPromise = new Promise<{ buy: any; buy_id: number }>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Buy timeout')), 15000);

          const unsub = ws!.onMessage((data: any) => {
            if (data.msg_type === 'buy' && data.echo_req?.req_id === buyReqId) {
              clearTimeout(timeout);
              if (data.error) reject(new Error(data.error.message));
              else resolve({ buy: data.buy, buy_id: data.buy?.contract_id });
            }
          });
          unsubsRef.current.add(unsub);

          ws!.send({
            buy: proposal.id,
            req_id: buyReqId,
            price: proposal.spot?.toString() || proposal.obj_contract?.spot || proposal.longcode || '',
          });
        });

        const { buy_id } = await buyPromise;

        // Wait for settlement
        const contractPromise = new Promise<{ profit: number; status: string }>((resolve) => {
          const timeout = setTimeout(() => resolve({ profit: 0, status: 'open' }), 60000);

          const unsub = ws!.onMessage((data: any) => {
            if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract?.contract_id === buy_id) {
              const poc = data.proposal_open_contract;
              if (poc.is_sold || poc.status === 'sold' || poc.status === 'won' || poc.status === 'lost') {
                clearTimeout(timeout);
                resolve({
                  profit: parseFloat(poc.profit || '0'),
                  status: parseFloat(poc.profit || '0') > 0 ? 'won' : 'lost',
                });
              }
            }
          });
          unsubsRef.current.add(unsub);
        });

        const result = await contractPromise;

        // Update result
        const updated = [...resultsRef.current];
        updated[currentIdx] = {
          ...updated[currentIdx],
          status: result.status === 'won' ? 'won' : 'lost',
          profit: result.profit,
          contractId: buy_id,
        };
        resultsRef.current = updated;
        setResults(updated);
      } catch (err: any) {
        const updated = [...resultsRef.current];
        updated[currentIdx] = {
          ...updated[currentIdx],
          status: 'error',
          profit: 0,
          error: err.message,
        };
        resultsRef.current = updated;
        setResults(updated);
      }

      currentIdx++;
      setTimeout(executeNext, intervalMs);
    };

    executeNext();
  }, [ws, isConnected, symbol, stake, duration, durationUnit, contractType, selectedDigits, tradeCount, intervalMs, cycleMode, cleanup]);

  const stop = useCallback(() => {
    abortRef.current = true;
    runningRef.current = false;
    setStatus('stopped');
    cleanup();
  }, [cleanup]);

  const reset = useCallback(() => {
    abortRef.current = true;
    runningRef.current = false;
    cleanup();
    resultsRef.current = [];
    setResults([]);
    setCurrentTradeIndex(0);
    setStatus('idle');
  }, [cleanup]);

  const stats = (() => {
    const completed = results.filter(r => r.status !== 'pending');
    const wins = completed.filter(r => r.status === 'won').length;
    const losses = completed.filter(r => r.status === 'lost' || r.status === 'error').length;
    const totalProfit = completed.reduce((sum, r) => sum + r.profit, 0);
    return { wins, losses, totalProfit, completed: completed.length };
  })();

  return { status, results, currentTradeIndex, stats, start, stop, reset };
}
