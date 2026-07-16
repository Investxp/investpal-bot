'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Copy, Link2, AlertCircle, Eye, EyeOff, ShieldCheck, CheckSquare, Square } from 'lucide-react';

declare global {
  interface Window {
    copyTradeBridge?: (type: string, stake: number, dur: number, durUnit: string, symbol: string, barrierDigit?: number) => Promise<void>;
  }
}

interface CopyTradingBridgeProps {
  activeAccountId: string | null;
  appId: string;
}

type StakeMode = 'same' | 'custom' | 'proportional';

class DerivCopyWS {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private pending = new Map<number, (r: any) => void>();
  private balance: number | null = null;

  constructor(private endpoint: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.endpoint);
      this.ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.req_id && this.pending.has(data.req_id)) {
          const cb = this.pending.get(data.req_id)!;
          this.pending.delete(data.req_id);
          cb(data);
        }
        if (data.msg_type === 'balance') {
          this.balance = data.balance?.balance ?? null;
        }
      };
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
      this.ws.onclose = () => {
        this.pending.forEach(cb => cb({ error: { message: 'Connection closed' } }));
        this.pending.clear();
      };
    });
  }

  async send<T>(payload: Record<string, unknown>): Promise<T> {
    return new Promise((resolve) => {
      const id = this.msgId++;
      this.pending.set(id, resolve);
      this.ws?.send(JSON.stringify({ ...payload, req_id: id }));
    });
  }

  getBalance() { return this.balance; }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}

export function CopyTradingBridge({ appId }: CopyTradingBridgeProps) {
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [targetAccountId, setTargetAccountId] = useState<string | null>(null);
  const [targetBalance, setTargetBalance] = useState<number | null>(null);
  const [stakeMode, setStakeMode] = useState<StakeMode>('same');
  const [customStake, setCustomStake] = useState('0.35');
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const wsRef = useRef<DerivCopyWS | null>(null);
  const isEnabledRef = useRef(false);
  isEnabledRef.current = isEnabled;
  const stakeModeRef = useRef<StakeMode>('same');
  stakeModeRef.current = stakeMode;
  const customStakeRef = useRef('0.35');
  customStakeRef.current = customStake;
  const targetBalanceRef = useRef<number | null>(null);
  targetBalanceRef.current = targetBalance;

  const maskedToken = apiToken.length > 4
    ? '\u2022'.repeat(apiToken.length - 4) + apiToken.slice(-4)
    : apiToken;

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    wsRef.current = null;
    setStatus('idle');
    setTargetAccountId(null);
    setTargetBalance(null);
  }, []);

  const connect = useCallback(async () => {
    if (!apiToken.trim()) { setErrorMsg('Please enter an API token'); return; }
    if (!disclaimerAccepted) { setErrorMsg('Please accept the legal disclaimer first'); return; }
    disconnect();
    setStatus('connecting');
    setErrorMsg(null);

    const customServer = typeof window !== 'undefined' ? (localStorage.getItem('config.server_url') || localStorage.getItem('server_url')) : null;
    const candidates: string[] = [];
    if (customServer) {
      const cleanServer = customServer.replace(/^(wss?:\/\/)/, '');
      candidates.push(`wss://${cleanServer}/websockets/v3?app_id=${appId}&l=EN&brand=deriv`);
    }
    candidates.push(
      `wss://ws.derivws.com/websockets/v3?app_id=${appId}&l=EN&brand=deriv`,
      `wss://ws.binaryws.com/websockets/v3?app_id=${appId}&l=EN&brand=deriv`,
      `wss://staging-ws.derivws.com/websockets/v3?app_id=${appId}&l=EN&brand=deriv`
    );

    let connectedWs: DerivCopyWS | null = null;
    let lastError: Error | null = null;

    for (const endpoint of candidates) {
      try {
        console.info(`[CopyBridge] Attempting connection to: ${endpoint}`);
        const ws = new DerivCopyWS(endpoint);
        await ws.connect();
        connectedWs = ws;
        break; // Successfully connected
      } catch (err) {
        console.warn(`[CopyBridge] Failed to connect to: ${endpoint}`, err);
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (!connectedWs) {
      disconnect();
      setStatus('error');
      setErrorMsg(lastError?.message ?? 'WebSocket connection failed across all endpoints');
      return;
    }

    try {
      wsRef.current = connectedWs;
      const authResp = await connectedWs.send<any>({ authorize: apiToken.trim() });
      if (authResp.error) throw new Error(authResp.error.message ?? 'Authorization failed');
      setTargetAccountId(authResp.authorize?.loginid ?? 'Unknown');
      const balResp = await connectedWs.send<any>({ balance: 1 });
      setTargetBalance(balResp.balance?.balance ?? null);
      setStatus('connected');
    } catch (err) {
      disconnect();
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [apiToken, appId, disclaimerAccepted, disconnect]);

  useEffect(() => {
    const handler = async (type: string, stake: number, dur: number, durUnit: string, symbol: string, barrierDigit?: number) => {
      const ws = wsRef.current;
      if (!isEnabledRef.current || !ws || status !== 'connected') return;
      let actualStake = stake;
      if (stakeModeRef.current === 'custom') {
        actualStake = parseFloat(customStakeRef.current) || stake;
      } else if (stakeModeRef.current === 'proportional') {
        const bal = targetBalanceRef.current;
        if (bal && bal > 0) actualStake = Math.max(0.35, Math.round((stake / 100) * bal * 100) / 100);
      }
      try {
        const propPayload: Record<string, unknown> = {
          proposal: 1, amount: actualStake, basis: 'stake',
          contract_type: type, currency: 'USD',
          duration: dur, duration_unit: durUnit,
          underlying_symbol: symbol,
        };
        if (['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(type)) {
          propPayload.barrier = String(barrierDigit ?? 5);
        }
        const propResp = await ws.send<any>(propPayload);
        if (propResp.error) throw new Error(propResp.error.message);
        const propId = propResp.proposal?.id;
        if (!propId) throw new Error('No proposal ID returned');
        const buyResp = await ws.send<any>({ buy: propId, price: actualStake });
        if (buyResp.error) throw new Error(buyResp.error.message);
      } catch (err) {
        console.error('[CopyBridge]', err);
      }
    };
    window.copyTradeBridge = handler;
    return () => { delete window.copyTradeBridge; };
  }, [status]);

  useEffect(() => { if (!isEnabled) disconnect(); }, [isEnabled, disconnect]);

  const STAKE_MODES: { id: StakeMode; label: string; desc: string }[] = [
    { id: 'same',         label: 'Same as Sender',      desc: 'Mirror the exact stake (e.g. $0.35 \u2192 $0.35)' },
    { id: 'custom',       label: 'Custom Amount',        desc: 'Use a fixed stake you configure' },
    { id: 'proportional', label: 'Proportional Balance', desc: 'Proportional to your balance vs the sender\u2019s' },
  ];

  return (
    <Card className="border border-zinc-800 bg-zinc-950/60 shadow-xl overflow-hidden backdrop-blur-md">
      <CardHeader className="pb-3 border-b border-zinc-900/60 flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <Copy className="w-4 h-4 text-emerald-400" />
          Copy Trading Bridge
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge
            variant={status === 'connected' ? 'default' : status === 'connecting' ? 'secondary' : 'outline'}
            className="text-[9px] font-extrabold uppercase"
          >
            {status === 'connected' ? '\u25cf Live' : status === 'connecting' ? '\u25cc Connecting' : status === 'error' ? '\u00d7 Error' : '\u25cb Idle'}
          </Badge>
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} disabled={status === 'connecting'} />
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Legal Disclaimer */}
        <button
          type="button"
          onClick={() => setDisclaimerAccepted(!disclaimerAccepted)}
          className={`w-full flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all ${
            disclaimerAccepted
              ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-400'
              : 'bg-amber-950/20 border-amber-800/40 text-amber-400'
          }`}
        >
          {disclaimerAccepted ? <CheckSquare className="w-4 h-4 mt-0.5 shrink-0" /> : <Square className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="text-[10px] leading-snug">
            <strong>Legal Disclaimer:</strong> I confirm I own the target Deriv account and accept full responsibility for all trades. InvestPal bears no liability for losses.
          </span>
        </button>

        {/* API Token */}
        <div className="space-y-1.5">
          <Label className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-500" /> Target Account API Token
          </Label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={showToken ? apiToken : maskedToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Enter Deriv API token..."
              className="bg-zinc-900 border-zinc-800 text-zinc-200 h-8 text-xs pr-8 font-mono"
              disabled={isEnabled}
            />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" onClick={() => setShowToken(!showToken)}>
              {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[9px] text-zinc-600">Deriv.com &rarr; Settings &rarr; API Token &rarr; Create token with &ldquo;Trade&rdquo; permission</p>
        </div>

        {/* Stake Mode */}
        <div className="space-y-1.5">
          <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Copied Stake Mode</Label>
          <div className="space-y-1.5">
            {STAKE_MODES.map(({ id, label, desc }) => (
              <button key={id} type="button" disabled={isEnabled} onClick={() => setStakeMode(id)}
                className={`w-full flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all ${
                  stakeMode === id
                    ? 'bg-emerald-950/20 border-emerald-700/40 text-emerald-300'
                    : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <span className={`mt-0.5 w-3 h-3 rounded-full border-2 shrink-0 ${stakeMode === id ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'}`} />
                <span className="space-y-0.5">
                  <span className="text-[11px] font-bold block">{label}</span>
                  <span className="text-[10px] opacity-70">{desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {stakeMode === 'custom' && (
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Custom Stake ($)</Label>
            <Input type="number" min="0.35" step="0.01" value={customStake} onChange={(e) => setCustomStake(e.target.value)}
              className="bg-zinc-900 border-zinc-800 text-zinc-200 h-7 text-xs" disabled={isEnabled} />
          </div>
        )}

        {/* Connect/Disconnect */}
        <div className="flex gap-2">
          {status !== 'connected' ? (
            <Button className="flex-1 h-8 text-xs bg-emerald-700 hover:bg-emerald-600 text-white" onClick={connect} disabled={status === 'connecting' || isEnabled}>
              {status === 'connecting' ? 'Validating Token...' : 'Connect & Validate Token'}
            </Button>
          ) : (
            <Button variant="outline" className="flex-1 h-8 text-xs border-zinc-700 text-zinc-400" onClick={disconnect}>Disconnect</Button>
          )}
        </div>

        {/* Status Panel */}
        {status === 'connected' && targetAccountId && (
          <div className="bg-emerald-950/20 border border-emerald-800/30 p-2.5 rounded-lg space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 flex items-center gap-1"><Link2 className="w-3 h-3" /> Account</span>
              <span className="text-emerald-300 font-bold">{targetAccountId}</span>
            </div>
            {targetBalance !== null && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Balance</span>
                <span className="text-emerald-300 font-bold">${targetBalance.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Stake Mode</span>
              <span className="text-emerald-300 font-bold capitalize">{stakeMode}{stakeMode === 'custom' ? ` ($${customStake})` : ''}</span>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="flex gap-2 items-start bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
