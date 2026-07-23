'use client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BOT_ENGINE_URL || 'http://localhost:4000';

export type AutoTradeMode =
  | 'rise-fall' | 'digits-even-odd' | 'digits-match-differ' | 'digits-over-under'
  | 'accumulators' | 'higher-lower' | 'touch-no-touch' | 'asian-up-down' | 'reset-call-put'
  | 'rise-only' | 'fall-only' | 'even-only' | 'odd-only' | 'match-only' | 'differ-only'
  | 'over-only' | 'under-only' | 'higher-only' | 'lower-only' | 'touch-only' | 'no-touch-only'
  | 'asian-up-only' | 'asian-down-only' | 'reset-call-only' | 'reset-put-only'
  | 'ai-auto-combo' | 'ai-auto-individual';

export interface TradeConfig {
  mode: AutoTradeMode;
  symbol: string;
  baseStake: number;
  baseStake2?: number;
  duration: number;
  durationUnit: 't' | 's' | 'm' | 'h' | 'd';
  martingaleMultiplier: number;
  takeProfit: number;
  stopLoss: number;
  selectedDigit: number[];
  selectedDigit2?: number[];
  growthRate: number;
  isHedgeMode: boolean;
  isAlternateMode: boolean;
  alternateFrequency: number;
  recoveryMethod?: 'martingale' | 'reverse_martingale' | 'dalembert' | 'fibonacci' | 'oscars_grind' | 'ai_auto';
  ghostLossThreshold?: number;
  maxTradesLimit?: number;
  trailingProfitLock?: number;
  accumulatorAutoSellOffset?: number;
  aiSignalsDriven?: boolean;
  multiDigitObjectives?: string;
  aiStakeMode?: boolean;
  aiRecoveryMode?: boolean;
  aiGhostFloorMode?: boolean;
  aiMaxRunsMode?: boolean;
  aiTrailingLockMode?: boolean;
  aiDigitsMode?: boolean;
  martingaleSplitMode?: 'optional' | 'full';
  barrierOffset?: string;
  enableCoolOff?: boolean;
  coolOffConsecutiveLosses?: number;
  coolOffConsecutiveWins?: number;
  coolOffDuration?: number;
  burstMode?: 'parallel' | 'sequential';
  burstSize?: number;
  recoverySplitCount?: number;
  aiRandomCoolOff?: boolean;
}

export interface RunnerState {
  label: string;
  contractType: string;
  currentStake: number;
  isTrading: boolean;
  activeContractId: number | null;
  lastResult: 'win' | 'loss' | null;
  profit: number;
}

export interface TradeLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

export interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  totalProfit: number;
  status: 'idle' | 'running' | 'completed' | 'stopped';
}

export interface TradeStatus {
  isRunning: boolean;
  stats: TradeStats;
  logs: TradeLog[];
  leg1: RunnerState;
  leg2: RunnerState;
  leg3: RunnerState;
}

type StatusCallback = (status: TradeStatus) => void;
type LogCallback = (log: TradeLog) => void;

class ApiClient {
  private ws: WebSocket | null = null;
  private statusCbs = new Set<StatusCallback>();
  private logCbs = new Set<LogCallback>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _isConnected = false;

  get isConnected() { return this._isConnected; }

  private getWsUrl() {
    const base = BACKEND_URL.replace(/^http/, 'ws');
    return `${base}/ws`;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    try {
      this.ws = new WebSocket(this.getWsUrl());
      this.ws.onopen = () => {
        this._isConnected = true;
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'status') this.statusCbs.forEach(cb => cb(msg.data));
          if (msg.type === 'log') this.logCbs.forEach(cb => cb(msg.data));
        } catch { /* ignore */ }
      };
      this.ws.onclose = () => {
        this._isConnected = false;
        this.ws = null;
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };
      this.ws.onerror = () => { this.ws?.close(); };
    } catch { /* ignore */ }
  }

  disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
  }

  async start(config: TradeConfig): Promise<void> {
    const resp = await fetch(`${BACKEND_URL}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to start');
    }
  }

  async stop(): Promise<void> {
    await fetch(`${BACKEND_URL}/api/stop`, { method: 'POST' }).catch(() => {});
  }

  async getStatus(): Promise<TradeStatus> {
    const resp = await fetch(`${BACKEND_URL}/api/status`);
    return resp.json();
  }

  onStatus(cb: StatusCallback) { this.statusCbs.add(cb); return () => this.statusCbs.delete(cb); }
  onLog(cb: LogCallback) { this.logCbs.add(cb); return () => this.logCbs.delete(cb); }
}

export const apiClient = new ApiClient();
