'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Brain, TrendingUp, TrendingDown, Activity, Zap, CheckSquare, Square } from 'lucide-react';
import type { DerivWS } from '@deriv/core';

interface AISignalsWidgetProps {
  ws: DerivWS | null;
  isConnected: boolean;
  symbol: string;
  onSignalUpdate?: (signal: AISignal) => void;
  baseStake?: number;
  duration?: number;
  durationUnit?: string;
}

interface AISignal {
  direction: 'CALL' | 'PUT';
  evenOdd: 'DIGITEVEN' | 'DIGITODD';
  predictionDigit: number;
  confidence: number;
}

type AutoExecType = 'direction' | 'evenOdd' | 'digit';

declare global {
  interface Window {
    placeAutoTrade?: (type: string, digit: number) => void;
  }
}

export function AISignalsWidget({ ws, isConnected, symbol, onSignalUpdate, baseStake = 0.35, duration = 1, durationUnit = 't' }: AISignalsWidgetProps) {
  const [tickHistory, setTickHistory] = useState<number[]>([]);
  const [rsi, setRsi] = useState<number>(50);
  const [volatility, setVolatility] = useState<number>(0);
  const [signal, setSignal] = useState<AISignal>({
    direction: 'CALL', evenOdd: 'DIGITEVEN', predictionDigit: 5, confidence: 50,
  });

  // Auto-Execute
  const [autoExecEnabled, setAutoExecEnabled] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState('70');
  const [cooldownSecs, setCooldownSecs] = useState('3');
  const [execTypes, setExecTypes] = useState<Record<AutoExecType, boolean>>({
    direction: true, evenOdd: false, digit: false,
  });
  const [lastExecTime, setLastExecTime] = useState<number | null>(null);
  const [autoTradeCount, setAutoTradeCount] = useState(0);
  const [lastTradeDesc, setLastTradeDesc] = useState<string | null>(null);

  const autoExecRef = useRef(false);
  autoExecRef.current = autoExecEnabled;
  const execTypesRef = useRef(execTypes);
  execTypesRef.current = execTypes;
  const lastExecRef = useRef<number | null>(null);
  lastExecRef.current = lastExecTime;

  const onSignalUpdateRef = useRef(onSignalUpdate);
  useEffect(() => { onSignalUpdateRef.current = onSignalUpdate; }, [onSignalUpdate]);

  const tryAutoExec = useCallback((sig: AISignal) => {
    if (!autoExecRef.current) return;
    const conf = parseFloat(confidenceThreshold) || 70;
    if (sig.confidence < conf) return;
    const now = Date.now();
    const coolMs = (parseFloat(cooldownSecs) || 3) * 1000;
    if (lastExecRef.current && now - lastExecRef.current < coolMs) return;

    const placer = window.placeAutoTrade;
    if (!placer) return;

    const types = execTypesRef.current;
    setLastExecTime(now);

    if (types.direction) {
      placer(sig.direction, 0);
      setLastTradeDesc(`${sig.direction === 'CALL' ? '? CALL' : '? PUT'} auto-executed`);
      setAutoTradeCount(c => c + 1);
    }
    if (types.evenOdd) {
      placer(sig.evenOdd, 0);
      setLastTradeDesc(`${sig.evenOdd === 'DIGITEVEN' ? 'EVEN' : 'ODD'} auto-executed`);
      setAutoTradeCount(c => c + 1);
    }
    if (types.digit) {
      placer('DIGITMATCH', sig.predictionDigit);
      setLastTradeDesc(`MATCH digit ${sig.predictionDigit} auto-executed`);
      setAutoTradeCount(c => c + 1);
    }
  }, [confidenceThreshold, cooldownSecs]);

  useEffect(() => {
    if (!ws || !isConnected || !symbol) return;
    let unsubscribe: (() => void) | null = null;
    const history: number[] = [];

    const handleTick = (data: any) => {
      if (data.msg_type === 'tick' && data.tick?.quote) {
        const quote = parseFloat(data.tick.quote);
        history.push(quote);
        if (history.length > 25) history.shift();
        let gains = 0, losses = 0;
        for (let i = 1; i < history.length; i++) {
          const diff = history[i] - history[i - 1];
          if (diff > 0) gains += diff; else losses -= diff;
        }
        const calculatedRsi = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
        const diffs = [];
        for (let i = 1; i < history.length; i++) diffs.push(Math.abs(history[i] - history[i - 1]));
        const calculatedVol = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
        const lastDigits = history.map(v => parseInt(v.toFixed(data.tick.pip_size || 2).slice(-1), 10));
        const digitCounts: Record<number, number> = {};
        lastDigits.forEach(d => { digitCounts[d] = (digitCounts[d] || 0) + 1; });
        let coldDigit = 5, minCount = 999;
        for (let d = 0; d <= 9; d++) {
          const count = digitCounts[d] || 0;
          if (count < minCount) { minCount = count; coldDigit = d; }
        }
        const evenCount = lastDigits.filter(d => d % 2 === 0).length;
        const oddCount = lastDigits.length - evenCount;
        const computedDirection = calculatedRsi > 50 ? 'CALL' : 'PUT';
        const computedEvenOdd = evenCount >= oddCount ? 'DIGITEVEN' : 'DIGITODD';
        const trendConfidence = Math.round(50 + Math.abs(calculatedRsi - 50) * 1.8);
        const newSignal: AISignal = {
          direction: computedDirection as 'CALL' | 'PUT',
          evenOdd: computedEvenOdd as 'DIGITEVEN' | 'DIGITODD',
          predictionDigit: coldDigit,
          confidence: Math.min(98, Math.max(50, trendConfidence)),
        };
        setTickHistory([...history]);
        setRsi(calculatedRsi);
        setVolatility(calculatedVol);
        setSignal(newSignal);
        if (onSignalUpdateRef.current) onSignalUpdateRef.current(newSignal);
        tryAutoExec(newSignal);
      }
    };

    const globalUnsub = ws.onMessage(handleTick);
    ws.subscribe({ ticks: symbol, subscribe: 1 }, handleTick)
      .then((sub) => { unsubscribe = () => { globalUnsub(); sub.unsubscribe(); }; })
      .catch((err) => { console.error('Tick subscription error:', err); globalUnsub(); });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [ws, isConnected, symbol, tryAutoExec]);

  const trendStatus = rsi > 58 ? 'BULLISH' : rsi < 42 ? 'BEARISH' : 'NEUTRAL';

  const EXEC_TYPE_OPTS: { id: AutoExecType; label: string; desc: string }[] = [
    { id: 'direction', label: 'Rise/Fall Direction', desc: 'CALL or PUT based on RSI trend' },
    { id: 'evenOdd',   label: 'Even / Odd',          desc: 'DIGITEVEN or DIGITODD based on last-digit stats' },
    { id: 'digit',     label: 'Digit Prediction',    desc: 'DIGITMATCH on coldest under-represented digit' },
  ];

  const toggleExecType = (id: AutoExecType) => {
    setExecTypes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Card className="border border-zinc-800 bg-zinc-950/60 shadow-xl overflow-hidden backdrop-blur-md">
      <CardHeader className="pb-3 border-b border-zinc-900/60 flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
          Real-Time AI Signal Engine
        </CardTitle>
        <Badge
          variant={trendStatus === 'BULLISH' ? 'default' : trendStatus === 'BEARISH' ? 'destructive' : 'outline'}
          className="text-[9px] font-extrabold"
        >
          {trendStatus}
        </Badge>
      </CardHeader>
      <CardContent className="pt-3 space-y-4">
        {/* Indicators */}
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-zinc-900/40 border border-zinc-850 p-2.5 rounded-lg">
            <span className="text-[10px] text-zinc-500 uppercase font-semibold block mb-0.5">Micro-RSI</span>
            <span className="text-sm font-black text-zinc-200">{rsi.toFixed(1)}</span>
            <div className="w-full bg-zinc-800 h-1 rounded-full mt-2 overflow-hidden">
              <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${rsi}%` }} />
            </div>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-850 p-2.5 rounded-lg">
            <span className="text-[10px] text-zinc-500 uppercase font-semibold block mb-0.5">Tick Volatility</span>
            <span className="text-sm font-black text-zinc-200 flex items-center justify-center gap-1">
              <Activity className="w-3.5 h-3.5 text-amber-500" />
              {volatility > 0 ? volatility.toFixed(5) : '0.00000'}
            </span>
            <span className="text-[8px] text-zinc-600 block mt-2">25-tick window</span>
          </div>
        </div>

        {/* Signals */}
        <div className="bg-zinc-900/20 border border-zinc-850 rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 font-medium">Trend Prediction</span>
            <span className={`font-bold flex items-center gap-1 ${signal.direction === 'CALL' ? 'text-green-400' : 'text-red-400'}`}>
              {signal.direction === 'CALL' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {signal.direction === 'CALL' ? 'CALL (Rise)' : 'PUT (Fall)'}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 font-medium">Even/Odd Signal</span>
            <span className="text-zinc-200 font-bold">{signal.evenOdd === 'DIGITEVEN' ? 'EVEN' : 'ODD'}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 font-medium">Coldest Digit</span>
            <span className="text-zinc-200 font-bold">{signal.predictionDigit}</span>
          </div>
          <div className="border-t border-zinc-900/60 pt-2 flex justify-between items-center text-xs">
            <span className="text-zinc-400 font-medium">Signal Confidence</span>
            <span className="text-purple-400 font-extrabold text-sm">{signal.confidence}%</span>
          </div>
        </div>

        {/* Auto-Execute Section */}
        <div className="border-t border-zinc-900 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                Auto-Execute Signals
              </Label>
              <p className="text-[10px] text-zinc-500">Automatically place trades when signals fire above confidence threshold.</p>
            </div>
            <Switch checked={autoExecEnabled} onCheckedChange={setAutoExecEnabled} />
          </div>

          {autoExecEnabled && (
            <div className="space-y-3 animate-in slide-in-from-top duration-200">
              {/* Confidence + Cooldown */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-zinc-400">Min Confidence (%)</Label>
                  <Input type="number" min="50" max="98" value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-7 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-zinc-400">Cooldown (Secs)</Label>
                  <Input type="number" min="1" value={cooldownSecs}
                    onChange={(e) => setCooldownSecs(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-7 text-xs" />
                </div>
              </div>

              {/* Signal Types to Execute */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Signal Types to Auto-Trade</Label>
                {EXEC_TYPE_OPTS.map(({ id, label, desc }) => (
                  <button key={id} type="button" onClick={() => toggleExecType(id)}
                    className={`w-full flex items-start gap-2 p-2 rounded-lg border text-left transition-all ${
                      execTypes[id]
                        ? 'bg-purple-950/30 border-purple-700/40 text-purple-300'
                        : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {execTypes[id]
                      ? <CheckSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      : <Square className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                    <span className="space-y-0.5">
                      <span className="text-[11px] font-bold block">{label}</span>
                      <span className="text-[10px] opacity-70">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>

              {/* Live Status */}
              <div className="bg-purple-950/10 border border-purple-900/20 p-2.5 rounded-lg space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Auto-Trades Fired</span>
                  <span className="text-purple-300 font-bold">{autoTradeCount}</span>
                </div>
                {lastTradeDesc && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Last Action</span>
                    <span className="text-purple-300 font-medium text-[10px]">{lastTradeDesc}</span>
                  </div>
                )}
                <p className="text-[9px] text-zinc-600">Requires autotrade engine to be running.</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
