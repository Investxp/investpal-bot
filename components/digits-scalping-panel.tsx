'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useDigitsScalping } from '@/hooks/use-digits-scalping';
import type { DerivWS, DurationLimits } from '@deriv/core';

type ScalpingPanelProps = {
  ws: DerivWS | null;
  isConnected: boolean;
  symbol: string;
  stake: string;
  duration: number;
  durationLimits: DurationLimits;
  contractType: string;
};

export function DigitsScalpingPanel({ ws, isConnected, symbol, stake, duration, durationLimits, contractType }: ScalpingPanelProps) {
  const [selectedDigits, setSelectedDigits] = useState<number[]>([1, 3, 5, 7, 9]);
  const [tradeCount, setTradeCount] = useState(5);
  const [intervalMs, setIntervalMs] = useState(500);
  const [cycleMode, setCycleMode] = useState<'sequential' | 'random'>('sequential');
  const [showPanel, setShowPanel] = useState(false);

  const stakeNum = parseFloat(stake) || 1;

  const allDigits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  const toggleDigit = useCallback((d: number) => {
    setSelectedDigits(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );
  }, []);

  const selectAll = useCallback(() => setSelectedDigits([...allDigits]), []);
  const selectNone = useCallback(() => setSelectedDigits([]), []);
  const selectEven = useCallback(() => setSelectedDigits([0, 2, 4, 6, 8]), []);
  const selectOdd = useCallback(() => setSelectedDigits([1, 3, 5, 7, 9]), []);

  const scalping = useDigitsScalping({
    ws,
    isConnected,
    symbol,
    stake: stakeNum,
    duration,
    contractType,
    selectedDigits,
    tradeCount,
    intervalMs,
    cycleMode,
  });

  const winRate = scalping.stats.completed > 0
    ? ((scalping.stats.wins / scalping.stats.completed) * 100).toFixed(1)
    : '0.0';

  const isRunning = scalping.status === 'running';

  return (
    <div className="mt-3 border border-zinc-800 rounded-lg overflow-hidden" style={{ background: '#151717' }}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-zinc-300 hover:text-white transition-all"
        style={{ background: '#1c1c1c' }}
        onClick={() => setShowPanel(!showPanel)}
      >
        <span>⚡ Scalping Mode</span>
        <span className="text-zinc-600 text-[10px]">{showPanel ? '▲' : '▼'}</span>
      </button>

      {showPanel && (
        <div className="p-3 space-y-3">
          {/* Digit selection grid */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Select Digits</span>
              <div className="flex gap-1">
                <button onClick={selectAll} className="text-[9px] text-zinc-600 hover:text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-800">All</button>
                <button onClick={selectEven} className="text-[9px] text-zinc-600 hover:text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-800">Even</button>
                <button onClick={selectOdd} className="text-[9px] text-zinc-600 hover:text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-800">Odd</button>
                <button onClick={selectNone} className="text-[9px] text-zinc-600 hover:text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-800">None</button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {allDigits.map(d => {
                const isSelected = selectedDigits.includes(d);
                const digitResult = scalping.results.find(r => r.digit === d && r.status !== 'pending');
                return (
                  <button
                    key={d}
                    onClick={() => toggleDigit(d)}
                    disabled={isRunning}
                    className={`text-center py-1.5 rounded text-xs font-bold transition-all border ${
                      isSelected
                        ? 'bg-red-600/20 text-red-400 border-red-600/40'
                        : 'text-zinc-600 border-zinc-800 hover:text-zinc-400'
                    } ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {d}
                    {digitResult && (
                      <span className={`ml-0.5 text-[9px] ${digitResult.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                        {digitResult.status === 'won' ? '✓' : '✗'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Settings row */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider block mb-0.5">Trades</label>
              <select
                value={tradeCount}
                onChange={e => setTradeCount(Number(e.target.value))}
                disabled={isRunning}
                className="w-full px-1.5 py-1 rounded text-xs text-zinc-300 border border-zinc-800 bg-zinc-900"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider block mb-0.5">Interval</label>
              <select
                value={intervalMs}
                onChange={e => setIntervalMs(Number(e.target.value))}
                disabled={isRunning}
                className="w-full px-1.5 py-1 rounded text-xs text-zinc-300 border border-zinc-800 bg-zinc-900"
              >
                <option value={250}>250ms</option>
                <option value={500}>500ms</option>
                <option value={1000}>1s</option>
                <option value={2000}>2s</option>
                <option value={3000}>3s</option>
                <option value={5000}>5s</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider block mb-0.5">Mode</label>
              <select
                value={cycleMode}
                onChange={e => setCycleMode(e.target.value as 'sequential' | 'random')}
                disabled={isRunning}
                className="w-full px-1.5 py-1 rounded text-xs text-zinc-300 border border-zinc-800 bg-zinc-900"
              >
                <option value="sequential">Sequential</option>
                <option value="random">Random</option>
              </select>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex gap-2">
            {!isRunning ? (
              <button
                onClick={scalping.start}
                disabled={selectedDigits.length === 0 || scalping.status === 'completed'}
                className="flex-1 py-1.5 rounded text-xs font-bold text-white transition-all"
                style={{ background: selectedDigits.length > 0 && scalping.status !== 'completed' ? '#22c55e' : '#2a2a2a' }}
              >
                {scalping.status === 'completed' ? 'Completed' : 'Start Scalping'}
              </button>
            ) : (
              <button
                onClick={scalping.stop}
                className="flex-1 py-1.5 rounded text-xs font-bold text-white transition-all"
                style={{ background: '#ef4444' }}
              >
                Stop ({scalping.currentTradeIndex + 1}/{tradeCount})
              </button>
            )}
            {scalping.status !== 'idle' && (
              <button
                onClick={scalping.reset}
                className="px-3 py-1.5 rounded text-xs text-zinc-400 border border-zinc-800 hover:text-zinc-200 transition-all"
              >
                Reset
              </button>
            )}
          </div>

          {/* Stats */}
          {scalping.stats.completed > 0 && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded p-1.5" style={{ background: '#1c1c1c' }}>
                <p className="text-[18px] font-bold text-zinc-100">{scalping.stats.wins}</p>
                <p className="text-[9px] text-green-500 font-bold uppercase tracking-wider">Won</p>
              </div>
              <div className="rounded p-1.5" style={{ background: '#1c1c1c' }}>
                <p className="text-[18px] font-bold text-zinc-100">{scalping.stats.losses}</p>
                <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider">Lost</p>
              </div>
              <div className="rounded p-1.5" style={{ background: '#1c1c1c' }}>
                <p className="text-[18px] font-bold text-zinc-100">{winRate}%</p>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Win Rate</p>
              </div>
              <div className="rounded p-1.5" style={{ background: '#1c1c1c' }}>
                <p className={`text-[18px] font-bold ${scalping.stats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {scalping.stats.totalProfit >= 0 ? '+' : ''}{scalping.stats.totalProfit.toFixed(2)}
                </p>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">P&L</p>
              </div>
            </div>
          )}

          {/* Trade list */}
          {scalping.results.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {scalping.results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-2 py-1 rounded text-[10px] font-mono"
                  style={{
                    background: r.status === 'pending' ? 'transparent' : r.status === 'won' ? 'rgba(34,197,94,0.1)' : r.status === 'lost' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,0,0.05)',
                    opacity: r.status === 'pending' ? 0.4 : 1,
                  }}
                >
                  <span className="text-zinc-500">#{r.index + 1}</span>
                  <span className={selectedDigits.includes(r.digit) ? 'text-red-400 font-bold' : 'text-zinc-400'}>
                    Digit {r.digit}
                  </span>
                  <span className="text-zinc-500">{r.contractType}</span>
                  {r.status === 'pending' && <span className="text-zinc-600">waiting...</span>}
                  {r.status === 'won' && <span className="text-green-400">+{r.profit.toFixed(2)}</span>}
                  {r.status === 'lost' && <span className="text-red-400">{r.profit.toFixed(2)}</span>}
                  {r.status === 'error' && <span className="text-yellow-400" title={r.error}>error</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
