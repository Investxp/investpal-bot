'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAutoTrade, AutoTradeMode, AutoTradeConfig } from '@/hooks/use-autotrade';
import type { UseAuthReturn } from '@/hooks/use-auth';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import { Play, Square, Terminal, TrendingUp, ShieldAlert, Award, Hash, Zap, Sparkles, BarChart2, ShieldCheck } from 'lucide-react';
import { AISignalsWidget } from './ai-signals-widget';
import { CopyTradingBridge } from './copy-trading-bridge';

interface AutoTradeViewProps {
  auth: UseAuthReturn;
}

const POPULAR_SYMBOLS = [
  // --- Synthetic Indices ---
  { value: 'R_10', label: 'Volatility 10 Index', category: 'synthetic' },
  { value: 'R_25', label: 'Volatility 25 Index', category: 'synthetic' },
  { value: 'R_50', label: 'Volatility 50 Index', category: 'synthetic' },
  { value: 'R_75', label: 'Volatility 75 Index', category: 'synthetic' },
  { value: 'R_100', label: 'Volatility 100 Index', category: 'synthetic' },
  { value: '1HZ10V', label: 'Volatility 10 (1s) Index', category: 'synthetic' },
  { value: '1HZ25V', label: 'Volatility 25 (1s) Index', category: 'synthetic' },
  { value: '1HZ50V', label: 'Volatility 50 (1s) Index', category: 'synthetic' },
  { value: '1HZ75V', label: 'Volatility 75 (1s) Index', category: 'synthetic' },
  { value: '1HZ100V', label: 'Volatility 100 (1s) Index', category: 'synthetic' },
  { value: '1HZ150V', label: 'Volatility 150 (1s) Index', category: 'synthetic' },
  { value: '1HZ250V', label: 'Volatility 250 (1s) Index', category: 'synthetic' },
  { value: '1HZ300V', label: 'Volatility 300 (1s) Index', category: 'synthetic' },
  { value: 'JM10', label: 'Jump 10 Index', category: 'synthetic' },
  { value: 'JM25', label: 'Jump 25 Index', category: 'synthetic' },
  { value: 'JM50', label: 'Jump 50 Index', category: 'synthetic' },
  { value: 'JM75', label: 'Jump 75 Index', category: 'synthetic' },
  { value: 'JM100', label: 'Jump 100 Index', category: 'synthetic' },
  { value: 'STPR', label: 'Step Index', category: 'synthetic' },
  { value: 'RDBEAR', label: 'Bear Market Index', category: 'synthetic' },
  { value: 'RDBULL', label: 'Bull Market Index', category: 'synthetic' },
  { value: 'BOOM300', label: 'Boom 300 Index', category: 'synthetic' },
  { value: 'BOOM500', label: 'Boom 500 Index', category: 'synthetic' },
  { value: 'BOOM1000', label: 'Boom 1000 Index', category: 'synthetic' },
  { value: 'CRASH300', label: 'Crash 300 Index', category: 'synthetic' },
  { value: 'CRASH500', label: 'Crash 500 Index', category: 'synthetic' },
  { value: 'CRASH1000', label: 'Crash 1000 Index', category: 'synthetic' },
  
  // --- Forex Major Pairs ---
  { value: 'frxAUDUSD', label: 'AUD/USD Forex', category: 'forex' },
  { value: 'frxEURUSD', label: 'EUR/USD Forex', category: 'forex' },
  { value: 'frxGBPUSD', label: 'GBP/USD Forex', category: 'forex' },
  { value: 'frxUSDCAD', label: 'USD/CAD Forex', category: 'forex' },
  { value: 'frxUSDCHF', label: 'USD/CHF Forex', category: 'forex' },
  { value: 'frxUSDJPY', label: 'USD/JPY Forex', category: 'forex' },

  // --- Commodities & Metals ---
  { value: 'XAUUSD', label: 'Gold (USD)', category: 'commodity' },
  { value: 'XAGUSD', label: 'Silver (USD)', category: 'commodity' },
];

function EquityCurveChart({ history }: { history: number[] }) {
  if (history.length < 2) {
    return (
      <Card className="border border-zinc-800 bg-zinc-950/60 p-6 flex flex-col justify-center items-center h-48 text-zinc-500">
        <BarChart2 className="w-8 h-8 mb-2 text-zinc-700 animate-pulse" />
        <span className="text-xs">Waiting for trading data to render equity curve...</span>
      </Card>
    );
  }

  const maxVal = Math.max(...history, 5);
  const minVal = Math.min(...history, -5);
  const range = maxVal - minVal;

  const width = 500;
  const height = 150;
  const padding = 10;

  const points = history.map((val, idx) => {
    const x = padding + (idx / (history.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - minVal) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const zeroY = height - padding - ((0 - minVal) / range) * (height - 2 * padding);

  return (
    <Card className="border border-zinc-800 bg-zinc-950/60 p-4 space-y-2 shadow-xl">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
          Equity Curve Chart
        </span>
        <Badge variant="outline" className="text-[9px] border-zinc-800 text-zinc-400">
          Max: ${maxVal.toFixed(2)} | Min: ${minVal.toFixed(2)}
        </Badge>
      </div>
      <div className="relative h-[150px] w-full bg-zinc-950/40 rounded-lg overflow-hidden border border-zinc-900/60">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          {zeroY >= padding && zeroY <= height - padding && (
            <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#3f3f46" strokeDasharray="3,3" strokeWidth="1" />
          )}

          <path
            d={`M ${padding},${height - padding} L ${points} L ${width - padding},${height - padding} Z`}
            fill="url(#equityGradient)"
            opacity="0.15"
          />

          <polyline
            fill="none"
            stroke={history[history.length - 1] >= 0 ? '#10b981' : '#ef4444'}
            strokeWidth="2.5"
            points={points}
          />

          {history.length > 0 && (
            <circle
              cx={padding + (history.length - 1) / (history.length - 1) * (width - 2 * padding)}
              cy={height - padding - ((history[history.length - 1] - minVal) / range) * (height - 2 * padding)}
              r="4"
              fill={history[history.length - 1] >= 0 ? '#10b981' : '#ef4444'}
            />
          )}

          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={history[history.length - 1] >= 0 ? '#10b981' : '#ef4444'} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </Card>
  );
}

export function AutoTradeView({ auth }: AutoTradeViewProps) {
  const { ws, isConnected } = useDerivWSContext();
  const { authState } = auth;
  
  const {
    isRunning,
    startAutoTrade,
    stopAutoTrade,
    logs,
    stats,
    leg1,
    leg2,
    leg3,
  } = useAutoTrade(ws, isConnected);

  // Form State
  const [mode, setMode] = useState<AutoTradeMode>('digits-even-odd');
  const [symbol, setSymbol] = useState('1HZ10V');
  const [baseStake, setBaseStake] = useState('0.35');
  const [baseStake2, setBaseStake2] = useState('0.35');
  const [duration, setDuration] = useState('1');
  const [durationUnit, setDurationUnit] = useState<'t' | 's' | 'm' | 'h' | 'd'>('t');
  const [martingale, setMartingale] = useState('2.5');
  const [takeProfit, setTakeProfit] = useState('1000');
  const [stopLoss, setStopLoss] = useState('1000');
  const [selectedDigit, setSelectedDigit] = useState<string[]>(['5']);
  const [selectedDigit2, setSelectedDigit2] = useState<string[]>(['5']);
  const [growthRate, setGrowthRate] = useState('0.01');
  const [isHedgeMode, setIsHedgeMode] = useState(true);
  const [isAlternateMode, setIsAlternateMode] = useState(false);
  const [alternateFrequency, setAlternateFrequency] = useState('1');

  // Advanced Feature States
  const [recoveryMethod, setRecoveryMethod] = useState<'martingale' | 'reverse_martingale' | 'dalembert' | 'fibonacci' | 'oscars_grind' | 'ai_auto'>('martingale');
  const [ghostLossThreshold, setGhostLossThreshold] = useState('0');
  const [maxTradesLimit, setMaxTradesLimit] = useState('0');
  const [trailingProfitLock, setTrailingProfitLock] = useState('0');
  const [accumulatorAutoSellOffset, setAccumulatorAutoSellOffset] = useState('0');
  const [barrierOffset, setBarrierOffset] = useState('0.1');
  const [enableCoolOff, setEnableCoolOff] = useState(false);
  const [coolOffConsecutiveLosses, setCoolOffConsecutiveLosses] = useState('3');
  const [coolOffConsecutiveWins, setCoolOffConsecutiveWins] = useState('3');
  const [coolOffDuration, setCoolOffDuration] = useState('60');
  const [aiRandomCoolOff, setAiRandomCoolOff] = useState(false);
  const [aiSignalsDriven, setAiSignalsDriven] = useState(false);
  const [multiDigitObjectives, setMultiDigitObjectives] = useState('');
  const [targetOp1, setTargetOp1] = useState('>');
  const [targetDigit1, setTargetDigit1] = useState('5');
  const [targetOp2, setTargetOp2] = useState('=');
  const [targetDigit2, setTargetDigit2] = useState('3');
  const [targetOp3, setTargetOp3] = useState('<');
  const [targetDigit3, setTargetDigit3] = useState('4');
  const [enableTripleLegMode, setEnableTripleLegMode] = useState(false);
  const [equityHistory, setEquityHistory] = useState<number[]>([]);

  // AI-Auto modes
  const [aiStakeMode, setAiStakeMode] = useState(false);
  const [aiRecoveryMode, setAiRecoveryMode] = useState(false);
  const [aiGhostFloorMode, setAiGhostFloorMode] = useState(false);
  const [aiMaxRunsMode, setAiMaxRunsMode] = useState(false);
  const [aiTrailingLockMode, setAiTrailingLockMode] = useState(false);
  const [aiDigitsMode, setAiDigitsMode] = useState(false);
  const [martingaleSplitMode, setMartingaleSplitMode] = useState<'optional' | 'full'>('full');

  // Dynamically filter options based on symbol category and trade type requirements
  const selectedSymbol = POPULAR_SYMBOLS.find(s => s.value === symbol);
  const isSynthetic = !selectedSymbol || selectedSymbol.category === 'synthetic';

  useEffect(() => {
    // If mode is accumulators or digits and the symbol is not in the supported list, switch to R_10
    const isDigitMode = mode.startsWith('digits') ||
      ['even-only', 'odd-only', 'match-only', 'differ-only', 'over-only', 'under-only'].includes(mode) ||
      mode.startsWith('ai-auto');
    const supportedDigitsOrAccuSymbols = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'];
    if ((mode === 'accumulators' || isDigitMode) && !supportedDigitsOrAccuSymbols.includes(symbol)) {
      setSymbol('R_10');
      return;
    }

    // If a non-synthetic index (Forex / Commodity) is selected, filter out Digits and Accumulators modes
    if (selectedSymbol && selectedSymbol.category !== 'synthetic') {
      const isSyntheticOnly = mode.startsWith('digits') ||
        mode === 'accumulators' ||
        ['even-only', 'odd-only', 'match-only', 'differ-only', 'over-only', 'under-only'].includes(mode) ||
        mode.startsWith('ai-auto');
      if (isSyntheticOnly) {
        setMode('rise-fall');
      }
      // Forex/Commodities must trade in minutes or seconds (no ticks support)
      if (durationUnit === 't') {
        setDurationUnit('m');
        setDuration('2');
      }
    }
  }, [symbol, selectedSymbol, mode, durationUnit]);

  // Reactively adjust defaults based on mode selection (Matches/Differ matches 11 martingale and 2 ticks)
  useEffect(() => {
    if (mode === 'digits-match-differ') {
      setDuration('2');
      setMartingale('11');
    } else {
      setDuration('1');
      setMartingale('2.5');
    }
  }, [mode]);

  // Sync 3 target boxes to multiDigitObjectives
  useEffect(() => {
    if (enableTripleLegMode) {
      const NO_DIGIT_OPS = ['EVEN', 'ODD', 'RISE', 'FALL'];
      const t1 = NO_DIGIT_OPS.includes(targetOp1) ? targetOp1 : `${targetOp1}${targetDigit1}`;
      const t2 = NO_DIGIT_OPS.includes(targetOp2) ? targetOp2 : `${targetOp2}${targetDigit2}`;
      const t3 = NO_DIGIT_OPS.includes(targetOp3) ? targetOp3 : `${targetOp3}${targetDigit3}`;
      setMultiDigitObjectives(`${t1},${t2},${t3}`);
    } else {
      setMultiDigitObjectives('');
    }
  }, [enableTripleLegMode, targetOp1, targetDigit1, targetOp2, targetDigit2, targetOp3, targetDigit3]);

  // Adjust duration if the user types a duration below limits
  useEffect(() => {
    if (selectedSymbol && selectedSymbol.category !== 'synthetic') {
      const durVal = parseInt(duration, 10) || 0;
      if (durationUnit === 'm' && durVal < 2) {
        setDuration('2');
      } else if (durationUnit === 's' && durVal < 120) {
        setDuration('120');
      }
    }

    // Tick limits for specific modes: Touch/No Touch, Higher/Lower, Asians, Reset Call/Put
    const isBarrierOrAsianOrReset = [
      'higher-lower', 'touch-no-touch', 'asian-up-down', 'reset-call-put',
      'higher-only', 'lower-only', 'touch-only', 'no-touch-only',
      'asian-up-only', 'asian-down-only', 'reset-call-only', 'reset-put-only'
    ].includes(mode);

    if (isBarrierOrAsianOrReset && durationUnit === 't') {
      const durVal = parseInt(duration, 10) || 0;
      if (durVal < 5) {
        setDuration('5');
      } else if (mode.includes('touch') && durVal > 10) {
        setDuration('10');
      }
    }
  }, [duration, durationUnit, selectedSymbol, mode]);

  useEffect(() => {
    if (isRunning) {
      setEquityHistory(prev => [...prev, stats.totalProfit]);
    } else {
      setEquityHistory([]);
    }
  }, [stats.totalProfit, isRunning]);

  const handleStart = () => {
    const config: AutoTradeConfig = {
      mode,
      symbol,
      baseStake: parseFloat(baseStake) || 1,
      baseStake2: parseFloat(baseStake2) || 1,
      duration: parseInt(duration, 10) || 1,
      durationUnit,
      martingaleMultiplier: parseFloat(martingale) || 2.5,
      takeProfit: parseFloat(takeProfit) || 1000,
      stopLoss: parseFloat(stopLoss) || 1000,
      selectedDigit: selectedDigit.length > 0 ? selectedDigit.map(x => parseInt(x, 10)) : [5],
      selectedDigit2: selectedDigit2.length > 0 ? selectedDigit2.map(x => parseInt(x, 10)) : [5],
      growthRate: parseFloat(growthRate) || 0.01,
      isHedgeMode: (mode.endsWith('-only') || mode === 'ai-auto-individual') ? false : isHedgeMode,
      isAlternateMode: (mode.endsWith('-only') || mode === 'ai-auto-individual') ? false : isAlternateMode,
      alternateFrequency: parseInt(alternateFrequency, 10) || 1,
      recoveryMethod,
      ghostLossThreshold: parseInt(ghostLossThreshold, 10) || 0,
      maxTradesLimit: parseInt(maxTradesLimit, 10) || 0,
      trailingProfitLock: parseFloat(trailingProfitLock) || 0,
      accumulatorAutoSellOffset: parseFloat(accumulatorAutoSellOffset) || 0,
      aiSignalsDriven,
      multiDigitObjectives: multiDigitObjectives || undefined,
      aiStakeMode,
      aiRecoveryMode,
      aiGhostFloorMode,
      aiMaxRunsMode,
      aiTrailingLockMode,
      aiDigitsMode,
      martingaleSplitMode,
      barrierOffset,
      enableCoolOff,
      coolOffConsecutiveLosses: parseInt(coolOffConsecutiveLosses, 10) || 3,
      coolOffConsecutiveWins: parseInt(coolOffConsecutiveWins, 10) || 3,
      coolOffDuration: parseInt(coolOffDuration, 10) || 60,
      aiRandomCoolOff,
    };

    startAutoTrade(config);
  };

  const winRate = stats.totalTrades > 0 ? (stats.wins / stats.totalTrades) * 100 : 0;

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6 animate-in fade-in duration-500">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-2">
            <Zap className="text-red-500 fill-red-500 w-6 h-6" />
            Automated Hedge Bot
          </h1>
          <p className="text-xs text-zinc-400">
            Automate trading using dual legs and independent Martingale multiplier scaling.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? 'default' : 'destructive'} className="h-6 font-semibold uppercase tracking-wider">
            {isConnected ? 'API Connected' : 'Disconnected'}
          </Badge>
          <Badge variant={isRunning ? 'secondary' : 'outline'} className={`h-6 font-semibold uppercase tracking-wider ${isRunning ? 'bg-green-600/20 text-green-400 border-green-800/40' : 'border-zinc-800 text-zinc-400'}`}>
            {stats.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Settings Panel */}
        <Card className="border border-zinc-800 bg-zinc-950/60 backdrop-blur-md shadow-xl lg:col-span-1">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold text-zinc-200">Bot Settings</CardTitle>
            <CardDescription className="text-zinc-500">Configure your automated trade execution parameters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode selection */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300 font-semibold">Trading Mode</Label>
              <Select value={mode} onValueChange={(val) => setMode(val as AutoTradeMode)} disabled={isRunning}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  {isSynthetic && (
                    <>
                      <SelectItem value="digits-even-odd">Combo: Digits - Even / Odd</SelectItem>
                      <SelectItem value="digits-match-differ">Combo: Digits - Match / Differ</SelectItem>
                      <SelectItem value="digits-over-under">Combo: Digits - Over / Under</SelectItem>
                    </>
                  )}
                  <SelectItem value="rise-fall">Combo: Rise / Fall</SelectItem>
                  <SelectItem value="higher-lower">Combo: Higher / Lower</SelectItem>
                  <SelectItem value="touch-no-touch">Combo: Touch / No Touch</SelectItem>
                  <SelectItem value="asian-up-down">Combo: Asian Up / Down</SelectItem>
                  <SelectItem value="reset-call-put">Combo: Reset Call / Put</SelectItem>
                  {isSynthetic && (
                    <SelectItem value="accumulators">Combo: Accumulators</SelectItem>
                  )}
                  {isSynthetic && (
                    <SelectItem value="ai-auto-combo">AI Auto Combo</SelectItem>
                  )}
                  {isSynthetic && (
                    <>
                      <SelectItem value="even-only">Indiv: Digit Even Only</SelectItem>
                      <SelectItem value="odd-only">Indiv: Digit Odd Only</SelectItem>
                      <SelectItem value="match-only">Indiv: Digit Match Only</SelectItem>
                      <SelectItem value="differ-only">Indiv: Digit Differ Only</SelectItem>
                      <SelectItem value="over-only">Indiv: Digit Over Only</SelectItem>
                      <SelectItem value="under-only">Indiv: Digit Under Only</SelectItem>
                    </>
                  )}
                  <SelectItem value="rise-only">Indiv: Rise Only</SelectItem>
                  <SelectItem value="fall-only">Indiv: Fall Only</SelectItem>
                  <SelectItem value="higher-only">Indiv: Higher Only</SelectItem>
                  <SelectItem value="lower-only">Indiv: Lower Only</SelectItem>
                  <SelectItem value="touch-only">Indiv: Touch Only</SelectItem>
                  <SelectItem value="no-touch-only">Indiv: No Touch Only</SelectItem>
                  <SelectItem value="asian-up-only">Indiv: Asian Up Only</SelectItem>
                  <SelectItem value="asian-down-only">Indiv: Asian Down Only</SelectItem>
                  <SelectItem value="reset-call-only">Indiv: Reset Call Only</SelectItem>
                  <SelectItem value="reset-put-only">Indiv: Reset Put Only</SelectItem>
                  {isSynthetic && (
                    <SelectItem value="ai-auto-individual">AI Auto Individual</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Symbol selection */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300 font-semibold">Underlying Symbol</Label>
              <Select value={symbol} onValueChange={setSymbol} disabled={isRunning}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  <SelectValue placeholder="Select symbol" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  {POPULAR_SYMBOLS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parameters Row 1 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className="text-xs text-zinc-300 font-semibold">Base Stake 1 (Leg 1) ($)</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-500 font-medium">AI</span>
                    <Switch
                      checked={aiStakeMode}
                      onCheckedChange={setAiStakeMode}
                      disabled={isRunning}
                      className="scale-75 origin-right"
                    />
                  </div>
                </div>
                <Input
                  type="number"
                  value={baseStake}
                  onChange={(e) => setBaseStake(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-200"
                  disabled={isRunning || aiStakeMode}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300 font-semibold">Martingale Factor</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={martingale}
                  onChange={(e) => setMartingale(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-200"
                  disabled={isRunning}
                />
              </div>
            </div>

            {/* Conditionally show Base Stake 2 if Hedge Mode is active */}
            {isHedgeMode && !(mode.endsWith('-only') || mode === 'ai-auto-individual') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300 font-semibold">Base Stake 2 (Leg 2) ($)</Label>
                  <Input
                    type="number"
                    value={baseStake2}
                    onChange={(e) => setBaseStake2(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-200"
                    disabled={isRunning || aiStakeMode}
                  />
                </div>
                <div className="flex items-end text-zinc-500 text-[10px] pb-2 font-medium italic">
                  Leg 2 utilizes a separate base stake level.
                </div>
              </div>
            )}

            {/* Parameters Row 2 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300 font-semibold">Take Profit ($)</Label>
                <Input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-200"
                  disabled={isRunning}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300 font-semibold">Stop Loss ($)</Label>
                <Input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-200"
                  disabled={isRunning}
                />
              </div>
            </div>

            {/* Mode-specific settings */}
            {mode !== 'accumulators' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300 font-semibold">Duration</Label>
                  <Input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-200"
                    disabled={isRunning}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300 font-semibold">Timeframe Unit</Label>
                  <Select value={durationUnit} onValueChange={(val: any) => setDurationUnit(val)} disabled={isRunning}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      {isSynthetic && (
                        <SelectItem value="t">Ticks</SelectItem>
                      )}
                      {!mode.startsWith('digits') && !mode.includes('only') && !mode.startsWith('ai-auto') && (
                        <>
                          <SelectItem value="s">Seconds</SelectItem>
                          <SelectItem value="m">Minutes</SelectItem>
                          <SelectItem value="h">Hours</SelectItem>
                          <SelectItem value="d">Days</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {(mode.startsWith('digits') || mode.includes('only') || mode === 'ai-auto-combo' || mode === 'ai-auto-individual') && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-zinc-300 font-semibold">
                      {['digits-match-differ', 'digits-over-under'].includes(mode)
                        ? 'Multi-Digit 1 (Match / Over)'
                        : 'Multi-Digit (0-9)'}
                    </Label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelectedDigit([])}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
                        disabled={isRunning || aiDigitsMode}>None</button>
                      <button onClick={() => setSelectedDigit(['0','1','2','3','4','5','6','7','8','9'])}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
                        disabled={isRunning || aiDigitsMode}>All</button>
                      <span className="text-[10px] text-zinc-500 font-medium">AI</span>
                      <Switch checked={aiDigitsMode} onCheckedChange={setAiDigitsMode} disabled={isRunning}
                        className="scale-75 origin-right" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
                      const s = d.toString();
                      const selected = selectedDigit.includes(s);
                      return (
                        <button key={d} onClick={() => {
                          if (selected) setSelectedDigit(selectedDigit.filter(x => x !== s));
                          else setSelectedDigit([...selectedDigit, s]);
                        }} disabled={isRunning || aiDigitsMode}
                          style={{
                            width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 13,
                            background: selected ? '#7c3aed' : '#2a2a3e', color: selected ? '#fff' : '#aaa',
                            border: selected ? '1px solid #7c3aed' : '1px solid #3a3a4e',
                            opacity: (isRunning || aiDigitsMode) ? 0.4 : 1,
                          }}>{d}</button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-zinc-500">{selectedDigit.length} digit{selectedDigit.length !== 1 ? 's' : ''} selected — trades cycle through them</span>
                </div>

                {['digits-match-differ', 'digits-over-under'].includes(mode) && (
                  <div className="space-y-1.5 animate-in slide-in-from-top duration-200">
                    <Label className="text-xs text-zinc-300 font-semibold">
                      Multi-Digit 2 (Differ / Under)
                    </Label>
                    <div className="flex gap-2 items-center mb-2">
                      <button onClick={() => setSelectedDigit2([])}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
                        disabled={isRunning || aiDigitsMode}>None</button>
                      <button onClick={() => setSelectedDigit2(['0','1','2','3','4','5','6','7','8','9'])}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
                        disabled={isRunning || aiDigitsMode}>All</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
                        const s = d.toString();
                        const selected = selectedDigit2.includes(s);
                        return (
                          <button key={d} onClick={() => {
                            if (selected) setSelectedDigit2(selectedDigit2.filter(x => x !== s));
                            else setSelectedDigit2([...selectedDigit2, s]);
                          }} disabled={isRunning || aiDigitsMode}
                            style={{
                              width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 13,
                              background: selected ? '#7c3aed' : '#2a2a3e', color: selected ? '#fff' : '#aaa',
                              border: selected ? '1px solid #7c3aed' : '1px solid #3a3a4e',
                              opacity: (isRunning || aiDigitsMode) ? 0.4 : 1,
                            }}>{d}</button>
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-zinc-500">{selectedDigit2.length} digit{selectedDigit2.length !== 1 ? 's' : ''} selected — trades cycle through them</span>
                  </div>
                )}
              </div>
            )}

            {mode === 'accumulators' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-300 font-semibold">Growth Rate</Label>
                <Select value={growthRate} onValueChange={setGrowthRate} disabled={isRunning}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectValue placeholder="Select growth rate" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="0.01">1%</SelectItem>
                    <SelectItem value="0.02">2%</SelectItem>
                    <SelectItem value="0.03">3%</SelectItem>
                    <SelectItem value="0.04">4%</SelectItem>
                    <SelectItem value="0.05">5%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {['higher-lower', 'touch-no-touch', 'higher-only', 'lower-only', 'touch-only', 'no-touch-only'].includes(mode) && (
              <div className="space-y-1.5 animate-in slide-in-from-top duration-200">
                <Label className="text-xs text-zinc-300 font-semibold">Barrier Offset</Label>
                <Input
                  type="text"
                  placeholder="e.g. 0.1 or +0.1"
                  value={barrierOffset}
                  onChange={(e) => setBarrierOffset(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-200"
                  disabled={isRunning}
                />
              </div>
            )}

            {/* Hedge Mode Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-900 bg-zinc-900/20 pt-3">
              <div className="space-y-0.5">
                <Label className="text-xs text-zinc-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  Simultaneous Hedge Mode
                </Label>
                <p className="text-[10px] text-zinc-500">Buy opposite contract types simultaneously.</p>
              </div>
              <Switch
                checked={isHedgeMode}
                onCheckedChange={setIsHedgeMode}
                disabled={isRunning}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-900 bg-zinc-900/20 animate-in fade-in duration-300">
              <div className="space-y-0.5">
                <Label className="text-xs text-zinc-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  {isHedgeMode ? "Intertrade Switch" : "Alternate Recovery"}
                </Label>
                <p className="text-[10px] text-zinc-500">
                  {isHedgeMode
                    ? "Switch recovery stakes to the winning side on loss."
                    : "Switch trading sides sequentially after trades."}
                </p>
              </div>
              <Switch
                checked={isAlternateMode}
                onCheckedChange={setIsAlternateMode}
                disabled={isRunning}
              />
            </div>

            {!isHedgeMode && isAlternateMode && (
              <div className="space-y-1.5 p-3 rounded-lg border border-zinc-900 bg-zinc-900/10 animate-in slide-in-from-top duration-200">
                <Label className="text-xs text-zinc-300 font-semibold">Alternation Frequency (Trades)</Label>
                <Input
                  type="number"
                  min="1"
                  value={alternateFrequency}
                  onChange={(e) => setAlternateFrequency(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-xs"
                  disabled={isRunning}
                />
              </div>
            )}

            {/* Advanced Bot Strategies */}
            <div className="space-y-3 border-t border-zinc-900 pt-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Advanced Mechanics
              </Label>

              {/* Recovery Method dropdown */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-zinc-400">Recovery Strategy</Label>
                <Select value={recoveryMethod} onValueChange={(val: any) => setRecoveryMethod(val)} disabled={isRunning}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-xs">
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="martingale">Martingale (Scale on Loss)</SelectItem>
                    <SelectItem value="reverse_martingale">Reverse Martingale (Scale on Win)</SelectItem>
                    <SelectItem value="dalembert">D'Alembert (Arithmetic step)</SelectItem>
                    <SelectItem value="fibonacci">Fibonacci Sequence Recovery</SelectItem>
                    <SelectItem value="oscars_grind">Oscar's Grind Cycle</SelectItem>
                    <SelectItem value="ai_auto">🤖 AI Auto Select Method</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Martingale Splitter dropdown */}
              <div className="space-y-1.5 animate-in slide-in-from-top duration-200">
                <Label className="text-[11px] text-zinc-400">Martingale Splitter</Label>
                <Select value={martingaleSplitMode} onValueChange={(val: any) => setMartingaleSplitMode(val)} disabled={isRunning}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-xs">
                    <SelectValue placeholder="Select splitter mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="optional">Optional Split (Divide Large Stakes)</SelectItem>
                    <SelectItem value="full">Full Stake (No Split / Trade Full Martingale)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Grid for Ghost loss and Max Trades */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label className="text-[11px] text-zinc-400">Ghost Loss Floor</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-zinc-500 font-medium">AI</span>
                      <Switch
                        checked={aiGhostFloorMode}
                        onCheckedChange={setAiGhostFloorMode}
                        disabled={isRunning}
                        className="scale-75 origin-right"
                      />
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={ghostLossThreshold}
                    onChange={(e) => setGhostLossThreshold(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-xs"
                    placeholder="0 = off"
                    disabled={isRunning || aiGhostFloorMode}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label className="text-[11px] text-zinc-400">Max Runs Limit</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-zinc-500 font-medium">AI</span>
                      <Switch
                        checked={aiMaxRunsMode}
                        onCheckedChange={setAiMaxRunsMode}
                        disabled={isRunning}
                        className="scale-75 origin-right"
                      />
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={maxTradesLimit}
                    onChange={(e) => setMaxTradesLimit(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-xs"
                    placeholder="0 = off"
                    disabled={isRunning || aiMaxRunsMode}
                  />
                </div>
              </div>

              {/* Trailing Profit lock */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label className="text-[11px] text-zinc-400">Trailing Profit Lock (%)</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-zinc-500 font-medium">AI</span>
                      <Switch
                        checked={aiTrailingLockMode}
                        onCheckedChange={setAiTrailingLockMode}
                        disabled={isRunning}
                        className="scale-75 origin-right"
                      />
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={trailingProfitLock}
                    onChange={(e) => setTrailingProfitLock(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-xs"
                    placeholder="e.g. 50"
                    disabled={isRunning || aiTrailingLockMode}
                  />
                </div>
                {mode === 'accumulators' && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-zinc-400">Auto-Sell Target (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={accumulatorAutoSellOffset}
                      onChange={(e) => setAccumulatorAutoSellOffset(e.target.value)}
                      className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-xs"
                      placeholder="e.g. 15"
                      disabled={isRunning}
                    />
                  </div>
                )}
              </div>

              {/* Cool-Off Settings */}
              <div className="space-y-2 border-t border-zinc-900 pt-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs text-zinc-200 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      Cool-Off Periods
                    </Label>
                    <p className="text-[10px] text-zinc-500">
                      Pause trading temporarily on consecutive wins or losses.
                    </p>
                  </div>
                  <Switch
                    checked={enableCoolOff}
                    onCheckedChange={setEnableCoolOff}
                    disabled={isRunning}
                  />
                </div>

                {enableCoolOff && (
                  <div className="space-y-2 animate-in slide-in-from-top duration-200">
                    {/* AI Random master toggle */}
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        const next = !aiRandomCoolOff;
                        setAiRandomCoolOff(next);
                        if (next) {
                          // seed random initial values
                          setCoolOffConsecutiveLosses(String(Math.floor(Math.random() * 4) + 2)); // 2-5
                          setCoolOffConsecutiveWins(String(Math.floor(Math.random() * 4) + 2));   // 2-5
                          setCoolOffDuration(String(Math.floor(Math.random() * 9) + 1));           // 1-10
                        }
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                        aiRandomCoolOff
                          ? 'bg-violet-950/40 border-violet-500/40 text-violet-300'
                          : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`text-base ${aiRandomCoolOff ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }}>🎲</span>
                        AI Random
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        aiRandomCoolOff ? 'bg-violet-500/20 text-violet-300' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {aiRandomCoolOff ? 'ON — Unpredictable' : 'OFF'}
                      </span>
                    </button>

                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg border border-zinc-900 bg-zinc-950/20">
                      {/* Consec. Losses */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] text-zinc-400">Consec. Losses</Label>
                          {aiRandomCoolOff && (
                            <button
                              type="button"
                              onClick={() => setCoolOffConsecutiveLosses(String(Math.floor(Math.random() * 4) + 2))}
                              disabled={isRunning}
                              title="Re-randomize"
                              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                            >🎲</button>
                          )}
                        </div>
                        <Input
                          type="number"
                          min="1"
                          value={coolOffConsecutiveLosses}
                          onChange={(e) => setCoolOffConsecutiveLosses(e.target.value)}
                          className={`bg-zinc-900 h-7 text-xs ${
                            aiRandomCoolOff ? 'border-violet-800/50 text-violet-200' : 'border-zinc-800 text-zinc-200'
                          }`}
                          disabled={isRunning}
                        />
                      </div>

                      {/* Consec. Wins */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] text-zinc-400">Consec. Wins</Label>
                          {aiRandomCoolOff && (
                            <button
                              type="button"
                              onClick={() => setCoolOffConsecutiveWins(String(Math.floor(Math.random() * 4) + 2))}
                              disabled={isRunning}
                              title="Re-randomize"
                              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                            >🎲</button>
                          )}
                        </div>
                        <Input
                          type="number"
                          min="1"
                          value={coolOffConsecutiveWins}
                          onChange={(e) => setCoolOffConsecutiveWins(e.target.value)}
                          className={`bg-zinc-900 h-7 text-xs ${
                            aiRandomCoolOff ? 'border-violet-800/50 text-violet-200' : 'border-zinc-800 text-zinc-200'
                          }`}
                          disabled={isRunning}
                        />
                      </div>

                      {/* Duration (Secs) */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] text-zinc-400">Duration (Secs)</Label>
                          {aiRandomCoolOff && (
                            <button
                              type="button"
                              onClick={() => setCoolOffDuration(String(Math.floor(Math.random() * 9) + 1))}
                              disabled={isRunning}
                              title="Re-randomize"
                              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                            >🎲</button>
                          )}
                        </div>
                        <Input
                          type="number"
                          min="1"
                          value={coolOffDuration}
                          onChange={(e) => setCoolOffDuration(e.target.value)}
                          className={`bg-zinc-900 h-7 text-xs ${
                            aiRandomCoolOff ? 'border-violet-800/50 text-violet-200' : 'border-zinc-800 text-zinc-200'
                          }`}
                          disabled={isRunning}
                        />
                      </div>
                    </div>

                    {aiRandomCoolOff && (
                      <p className="text-[10px] text-violet-400/70 flex items-center gap-1 px-1">
                        🤖 Thresholds & duration vary randomly each cycle — trading pattern stays unpredictable.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Multi digit settings */}
              {(mode.startsWith('digits') || mode.includes('only') || mode.startsWith('ai-auto')) && (
                <div className="space-y-2 border-t border-zinc-900 pt-3 animate-in slide-in-from-top-1 duration-200">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-zinc-400" />
                      Multi-Digit Targets (Triple Mode)
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetOp1('>');
                        setTargetDigit1('5');
                        setTargetOp2('=');
                        setTargetDigit2('3');
                        setTargetOp3('<');
                        setTargetDigit3('4');
                        setEnableTripleLegMode(true);
                      }}
                      className="text-[9px] text-purple-400 hover:text-purple-300 font-medium underline"
                      disabled={isRunning}
                    >
                      AI Auto Recommend
                    </button>
                  </div>
                  <p className="text-[9px] text-zinc-500">Configure three comparison targets to execute Triple Leg Simultaneous mode.</p>
                  
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {/* Leg 1 Target */}
                    <div className="space-y-1.5 p-2 rounded bg-zinc-900/30 border border-zinc-900">
                      <span className="text-[9px] text-zinc-400 font-bold block mb-1">Target 1</span>
                      <div className="space-y-1">
                        <Select value={targetOp1} onValueChange={setTargetOp1} disabled={isRunning}>
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-300 h-7 text-[11px] px-2">
                            <SelectValue placeholder="Op" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            <SelectItem value=">">&#62; (Over)</SelectItem>
                            <SelectItem value="<">&#60; (Under)</SelectItem>
                            <SelectItem value="=">=  (Matches)</SelectItem>
                            <SelectItem value="!=">!= (Differs)</SelectItem>
                            <SelectItem value="EVEN">〰 Even</SelectItem>
                            <SelectItem value="ODD">〜 Odd</SelectItem>
                            <SelectItem value="RISE">↑ Rise (Call)</SelectItem>
                            <SelectItem value="FALL">↓ Fall (Put)</SelectItem>
                          </SelectContent>
                        </Select>
                        {!['EVEN','ODD','RISE','FALL'].includes(targetOp1) && (
                        <Select value={targetDigit1} onValueChange={setTargetDigit1} disabled={isRunning}>
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-300 h-7 text-[11px] px-2">
                            <SelectValue placeholder="Digit" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                              <SelectItem key={d} value={d.toString()}>{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        )}
                      </div>
                    </div>

                    {/* Leg 2 Target */}
                    <div className="space-y-1.5 p-2 rounded bg-zinc-900/30 border border-zinc-900">
                      <span className="text-[9px] text-zinc-400 font-bold block mb-1">Target 2</span>
                      <div className="space-y-1">
                        <Select value={targetOp2} onValueChange={setTargetOp2} disabled={isRunning}>
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-300 h-7 text-[11px] px-2">
                            <SelectValue placeholder="Op" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            <SelectItem value=">">&#62; (Over)</SelectItem>
                            <SelectItem value="<">&#60; (Under)</SelectItem>
                            <SelectItem value="=">=  (Matches)</SelectItem>
                            <SelectItem value="!=">!= (Differs)</SelectItem>
                            <SelectItem value="EVEN">〰 Even</SelectItem>
                            <SelectItem value="ODD">〜 Odd</SelectItem>
                            <SelectItem value="RISE">↑ Rise (Call)</SelectItem>
                            <SelectItem value="FALL">↓ Fall (Put)</SelectItem>
                          </SelectContent>
                        </Select>
                        {!['EVEN','ODD','RISE','FALL'].includes(targetOp2) && (
                        <Select value={targetDigit2} onValueChange={setTargetDigit2} disabled={isRunning}>
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-300 h-7 text-[11px] px-2">
                            <SelectValue placeholder="Digit" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                              <SelectItem key={d} value={d.toString()}>{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        )}
                      </div>
                    </div>

                    {/* Leg 3 Target */}
                    <div className="space-y-1.5 p-2 rounded bg-zinc-900/30 border border-zinc-900">
                      <span className="text-[9px] text-zinc-400 font-bold block mb-1">Target 3</span>
                      <div className="space-y-1">
                        <Select value={targetOp3} onValueChange={setTargetOp3} disabled={isRunning}>
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-300 h-7 text-[11px] px-2">
                            <SelectValue placeholder="Op" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            <SelectItem value=">">&#62; (Over)</SelectItem>
                            <SelectItem value="<">&#60; (Under)</SelectItem>
                            <SelectItem value="=">=  (Matches)</SelectItem>
                            <SelectItem value="!=">!= (Differs)</SelectItem>
                            <SelectItem value="EVEN">〰 Even</SelectItem>
                            <SelectItem value="ODD">〜 Odd</SelectItem>
                            <SelectItem value="RISE">↑ Rise (Call)</SelectItem>
                            <SelectItem value="FALL">↓ Fall (Put)</SelectItem>
                          </SelectContent>
                        </Select>
                        {!['EVEN','ODD','RISE','FALL'].includes(targetOp3) && (
                        <Select value={targetDigit3} onValueChange={setTargetDigit3} disabled={isRunning}>
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-300 h-7 text-[11px] px-2">
                            <SelectValue placeholder="Digit" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                              <SelectItem key={d} value={d.toString()}>{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Switch to enable Triple Leg Mode */}
                  <div className="flex items-center justify-between p-2 mt-2 rounded bg-purple-950/10 border border-purple-900/20">
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-zinc-200 font-semibold">Enable Triple Leg Mode</Label>
                      <p className="text-[9px] text-zinc-500">Run Leg 1, Leg 2, and Leg 3 simultaneously.</p>
                    </div>
                    <Switch
                      checked={enableTripleLegMode}
                      onCheckedChange={setEnableTripleLegMode}
                      disabled={isRunning}
                    />
                  </div>
                </div>
              )}

              {/* AI signal trigger switch */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-900 bg-zinc-900/10">
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-zinc-300 font-bold uppercase flex items-center gap-1">
                    AI-Signals Driven
                  </Label>
                  <p className="text-[9px] text-zinc-500">Auto-override direction using AI recommendation.</p>
                </div>
                <Switch
                  checked={aiSignalsDriven}
                  onCheckedChange={setAiSignalsDriven}
                  disabled={isRunning}
                />
              </div>
            </div>

            {/* Run Button */}
            <div className="pt-2">
              {isRunning ? (
                <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold gap-2" onClick={() => stopAutoTrade()}>
                  <Square size={16} fill="white" />
                  Stop Autotrading
                </Button>
              ) : (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold gap-2"
                  onClick={handleStart}
                  disabled={!isConnected}
                >
                  <Play size={16} fill="white" />
                  Start Bot
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right Stats & Console Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border border-zinc-800 bg-zinc-950/60 p-4 space-y-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1">
                <TrendingUp size={12} /> Total Profit/Loss
              </span>
              <p className={`text-xl font-black ${stats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${stats.totalProfit.toFixed(2)}
              </p>
            </Card>

            <Card className="border border-zinc-800 bg-zinc-950/60 p-4 space-y-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1">
                <Award size={12} /> Win Rate
              </span>
              <p className="text-xl font-black text-zinc-200">{winRate.toFixed(1)}%</p>
            </Card>

            <Card className="border border-zinc-800 bg-zinc-950/60 p-4 space-y-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1">
                <Hash size={12} /> Total Trades
              </span>
              <p className="text-xl font-black text-zinc-200">{stats.totalTrades}</p>
            </Card>

            <Card className="border border-zinc-800 bg-zinc-950/60 p-4 space-y-1">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1">
                <ShieldAlert size={12} /> Wins / Losses
              </span>
              <p className="text-xl font-black text-zinc-200">
                <span className="text-green-500">{stats.wins}</span>
                <span className="text-zinc-600"> / </span>
                <span className="text-red-500">{stats.losses}</span>
              </p>
            </Card>
          </div>

          {/* Equity Curve Chart */}
          <EquityCurveChart history={equityHistory} />

          {/* AI Signals & Copy Trading Widgets */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AISignalsWidget symbol={symbol} ws={ws} isConnected={isConnected} />
            <CopyTradingBridge 
              activeAccountId={auth.activeAccountId} 
              appId={(typeof window !== 'undefined' ? localStorage.getItem('custom_app_id') : null) || process.env.NEXT_PUBLIC_DERIV_APP_ID || ''} 
            />
          </div>

          {/* Multi-Leg States */}
          {isRunning && (
            <div className={`grid grid-cols-1 ${
              (multiDigitObjectives.split(',').map(x => x.trim()).filter(x => x !== '').length === 3) 
                ? 'md:grid-cols-3' 
                : isHedgeMode ? 'md:grid-cols-2' : 'md:grid-cols-1'
            } gap-4 animate-in slide-in-from-bottom duration-300`}>
              {/* Leg 1 Card */}
              <Card className="border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-300">{leg1.label}</span>
                  <Badge variant={leg1.activeContractId ? 'default' : 'outline'} className={leg1.activeContractId ? 'bg-blue-600/20 text-blue-400 border-blue-900/40' : 'text-zinc-600'}>
                    {leg1.activeContractId ? 'Active' : 'Idle'}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Current Stake:</span>
                  <span className="font-semibold text-zinc-200">${leg1.currentStake.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Leg Profit:</span>
                  <span className={`font-bold ${leg1.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${leg1.profit.toFixed(2)}
                  </span>
                </div>
              </Card>

              {/* Leg 2 Card */}
              {(isHedgeMode || (multiDigitObjectives.split(',').map(x => x.trim()).filter(x => x !== '').length === 3)) && (
                <Card className="border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-300">{leg2.label}</span>
                    <Badge variant={leg2.activeContractId ? 'default' : 'outline'} className={leg2.activeContractId ? 'bg-blue-600/20 text-blue-400 border-blue-900/40' : 'text-zinc-600'}>
                      {leg2.activeContractId ? 'Active' : 'Idle'}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Current Stake:</span>
                    <span className="font-semibold text-zinc-200">${leg2.currentStake.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Leg Profit:</span>
                    <span className={`font-bold ${leg2.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${leg2.profit.toFixed(2)}
                    </span>
                  </div>
                </Card>
              )}

              {/* Leg 3 Card */}
              {(multiDigitObjectives.split(',').map(x => x.trim()).filter(x => x !== '').length === 3) && (
                <Card className="border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-300">{leg3.label}</span>
                    <Badge variant={leg3.activeContractId ? 'default' : 'outline'} className={leg3.activeContractId ? 'bg-blue-600/20 text-blue-400 border-blue-900/40' : 'text-zinc-600'}>
                      {leg3.activeContractId ? 'Active' : 'Idle'}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Current Stake:</span>
                    <span className="font-semibold text-zinc-200">${leg3.currentStake.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Leg Profit:</span>
                    <span className={`font-bold ${leg3.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${leg3.profit.toFixed(2)}
                    </span>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Console Log */}
          <Card className="border border-zinc-800 bg-zinc-950/60 shadow-xl">
            <CardHeader className="pb-2 border-b border-zinc-900/60">
              <CardTitle className="text-sm font-semibold text-zinc-300 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-zinc-400" />
                Live Execution Console
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-64 overflow-y-auto p-4 font-mono text-xs space-y-2 bg-zinc-950/80 rounded-b-xl flex flex-col">
                {logs.length === 0 ? (
                  <div className="text-zinc-600 text-center py-12">Console is ready. Start the bot to stream logs.</div>
                ) : (
                  logs.map((l) => {
                    let textClass = 'text-zinc-400';
                    if (l.type === 'success') textClass = 'text-green-400 font-semibold';
                    if (l.type === 'error') textClass = 'text-red-400 font-semibold';
                    if (l.type === 'warn') textClass = 'text-amber-500';

                    return (
                      <div key={l.id} className="flex gap-2.5 items-start leading-5 select-text">
                        <span className="text-zinc-600 shrink-0 select-none">[{l.timestamp}]</span>
                        <span className={textClass}>{l.message}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
