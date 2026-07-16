import { javascriptGenerator } from 'blockly/javascript';

export interface TradeResult {
  contract_id: number;
  buy_price: number;
  payout: number;
  profit: number;
  status: 'won' | 'lost' | 'open';
  entry_tick: number;
  exit_tick: number | null;
  contract_type: string;
  symbol: string;
}

export interface StrategySettings {
  telegramToken: string;
  telegramChatId: string;
  showChart: boolean;
  stakeAmount: number;
  contractType: string;
  symbol: string;
  prediction: string;
  durationAmount: number;
  durationUnit: string;
}

export const DEFAULT_SETTINGS: StrategySettings = {
  telegramToken: '',
  telegramChatId: '',
  showChart: false,
  stakeAmount: 1,
  contractType: 'RISE_FALL',
  symbol: 'R_100',
  prediction: 'RISE',
  durationAmount: 1,
  durationUnit: 't',
};

export interface EngineOptions {
  sendMessage: (msg: Record<string, unknown>) => Promise<any>;
  onLog: (msg: string) => void;
  onTradeUpdate: (result: TradeResult) => void;
  onError: (err: string) => void;
  onStatusChange: (running: boolean) => void;
  settings?: StrategySettings;
}

interface OhlcCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  epoch: number;
}

export class TradingEngine {
  private api: EngineOptions['sendMessage'];
  private onLog: EngineOptions['onLog'];
  private onTradeUpdate: EngineOptions['onTradeUpdate'];
  private onError: EngineOptions['onError'];
  private onStatusChange: EngineOptions['onStatusChange'];
  private _settings: StrategySettings;
  private _running = false;
  private _currentTick = 0;
  private _currentContract: Record<string, unknown> | null = null;
  private _tickCallbacks: Array<() => Promise<void>> = [];
  private _tickHistory: number[] = [];
  private _tickSubscriptionId: string | null = null;
  private _currentSymbol = 'R_100';
  private _lastContractBought: Record<string, unknown> | null = null;
  private _lastContractResult: Record<string, unknown> | null = null;
  private _balance = 0;
  private _loginId = '';
  private _totalRuns = 0;

  constructor(opts: EngineOptions) {
    this.api = opts.sendMessage;
    this.onLog = opts.onLog;
    this.onTradeUpdate = opts.onTradeUpdate;
    this.onError = opts.onError;
    this.onStatusChange = opts.onStatusChange;
    this._settings = opts.settings || DEFAULT_SETTINGS;
  }

  get running() { return this._running; }
  get currentTick() { return this._currentTick; }
  get currentContract() { return this._currentContract; }

  setAccountInfo(balance: number, loginId: string) {
    this._balance = balance;
    this._loginId = loginId;
  }

  async start(workspace: any, symbol: string) {
    this._currentSymbol = symbol;
    this._running = true;
    this._currentContract = null;
    this._lastContractBought = null;
    this._tickCallbacks = [];
    this._tickHistory = [];
    this.onStatusChange(true);

    const code = javascriptGenerator.workspaceToCode(workspace as any);
    this.onLog('Generated strategy code:');
    this.onLog(code);
    this.onLog('---');

    // Subscribe to ticks for the selected symbol
    try {
      await this.subscribeTicks(symbol);
    } catch (err: any) {
      this.onError(`Failed to subscribe to ticks: ${err.message}`);
      this.stop();
      return;
    }

    // Indicator helpers
    const sma = (period: number, data: number[]) => {
      if (data.length < period) return 0;
      const slice = data.slice(-period);
      return slice.reduce((a, b) => a + b, 0) / period;
    };

    const rsiFn = (period: number, data: number[]) => {
      if (data.length < period + 1) return 50;
      const slice = data.slice(-(period + 1));
      let gains = 0, losses = 0;
      for (let i = 1; i < slice.length; i++) {
        const diff = slice[i] - slice[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - 100 / (1 + rs);
    };

    const bbands = (period: number, stddev: number, data: number[]) => {
      const avg = sma(period, data);
      const slice = data.slice(-period);
      const variance = slice.reduce((sum, v) => sum + (v - avg) ** 2, 0) / period;
      const sd = Math.sqrt(variance);
      return { upper: avg + stddev * sd, middle: avg, lower: avg - stddev * sd };
    };

    const highest = (period: number, data: number[]) => {
      const slice = data.slice(-period);
      return slice.length ? Math.max(...slice) : 0;
    };

    const lowest = (period: number, data: number[]) => {
      const slice = data.slice(-period);
      return slice.length ? Math.min(...slice) : 0;
    };

    const emaFn = (period: number, data: number[]) => {
      if (data.length < period) return 0;
      const slice = data.slice(-period);
      const k = 2 / (period + 1);
      let ema = slice[0];
      for (let i = 1; i < slice.length; i++) {
        ema = slice[i] * k + ema * (1 - k);
      }
      return ema;
    };

    const macdFn = (fast: number, slow: number, signal: number, data: number[]) => {
      const macdLine = emaFn(fast, data) - emaFn(slow, data);
      const signalLine = emaFn(signal, [macdLine]);
      return { macd: macdLine, signal: signalLine, histogram: macdLine - signalLine };
    };

    let _totalProfit = 0;
    let _totalRunsRef = { value: 0 };
    let _stopLossAmount = 0;
    let _takeProfitAmount = 0;
    let _accuTakeProfitAmount = 0;

    const Deriv = {
      buyContract: async (params: {
        contract_type: string;
        symbol: string;
        options?: { prediction?: string; stake?: { amount: number; currency: string }; duration?: { amount: number; unit: string } };
        stake?: { amount: number; currency: string };
        duration?: { amount: number; unit: string };
        barrier?: number | null;
        growth_rate?: number | null;
      }) => {
        const stake = params.options?.stake || params.stake || { amount: 1, currency: 'USD' };
        const duration = params.options?.duration || params.duration || { amount: 1, unit: 't' };
        const contractType = params.contract_type;

        const proposalReq: Record<string, unknown> = {
          proposal: 1,
          amount: stake.amount,
          basis: 'stake',
          contract_type: contractType,
          currency: stake.currency,
          duration: duration.amount,
          duration_unit: duration.unit,
          symbol: params.symbol,
        };
        if (params.barrier != null) proposalReq.barrier = params.barrier;
        if (params.growth_rate != null) proposalReq.growth_rate = params.growth_rate;

        this.onLog(`Requesting proposal for ${contractType} on ${params.symbol}...`);
        const proposalResp = await this.api(proposalReq);
        if (proposalResp.error) {
          this.onError(`Proposal error: ${proposalResp.error.message}`);
          return;
        }

        const proposal = proposalResp.proposal;
        this.onLog(`Proposal received — payout: ${proposal.payout}, ask: ${proposal.ask_price}`);

        const buyReq = { buy: proposal.id, price: proposal.ask_price };
        this.onLog('Buying contract...');
        const buyResp = await this.api(buyReq);
        if (buyResp.error) {
          this.onError(`Buy error: ${buyResp.error.message}`);
          return;
        }

        const buy = buyResp.buy;
        const contractData: any = {
          contract_id: buy.contract_id,
          buy_price: parseFloat(buy.buy_price),
          contract_type: contractType,
          symbol: params.symbol,
        };
        this._currentContract = contractData;
        this._lastContractBought = contractData;
        this._lastContractResult = null;

        this.onLog(`Contract bought — ID: ${buy.contract_id}, price: ${buy.buy_price}`);

        try {
          await this.api({
            subscribe: 1,
            proposal_open_contract: 1,
            contract_id: buy.contract_id,
          });
        } catch (e: any) { this.onLog(`Contract subscription note: ${e.message}`); }
      },

      sellContract: async (contract?: Record<string, unknown> | null) => {
        const target = contract || this._currentContract;
        if (!target) {
          this.onLog('No contract to sell');
          return;
        }
        this.onLog(`Selling contract ${target.contract_id}...`);
        const resp = await this.api({ sell: target.contract_id, price: 0 });
        if (resp.error) {
          this.onError(`Sell error: ${resp.error.message}`);
          return;
        }
        this.onLog(`Contract ${target.contract_id} sold for ${resp?.sell?.sold_for}`);
      },

      onTick: (cb: () => Promise<void>) => {
        this._tickCallbacks.push(cb);
      },

      currentTick: () => this._currentTick,
      currentContract: () => this._currentContract,
      lastContract: () => this._lastContractResult,
      log: (msg: string) => this.onLog(msg),

      getTickHistory: (count: number) => this._tickHistory.slice(-count),
      sma,
      ema: emaFn,
      rsi: rsiFn,
      bbands,
      macd: macdFn,
      highest,
      lowest,

      accountBalance: () => this._balance,
      accountLoginId: () => this._loginId,
      isVirtual: () => this._loginId.startsWith('VR'),
      totalProfit: () => _totalProfit,
      totalRuns: () => _totalRunsRef.value,

      checkDirection: (period: number, direction: string) => {
        const slice = this._tickHistory.slice(-period);
        if (slice.length < 2) return false;
        const changes = slice.slice(1).map((v, i) => v - slice[i]);
        const upCount = changes.filter(c => c > 0).length;
        return direction === 'rising' ? upCount > changes.length / 2 : upCount < changes.length / 2;
      },

      getOhlc: (count: number) => {
        const candles: OhlcCandle[] = [];
        const tickData = this._tickHistory;
        if (tickData.length === 0) return candles;
        const chunkSize = Math.max(1, Math.floor(tickData.length / count));
        for (let i = 0; i < tickData.length && candles.length < count; i += chunkSize) {
          const chunk = tickData.slice(i, i + chunkSize);
          candles.push({
            open: chunk[0],
            high: Math.max(...chunk),
            low: Math.min(...chunk),
            close: chunk[chunk.length - 1],
            epoch: Date.now() + i,
          });
        }
        return candles;
      },

      stat: (data: number[], func: string) => {
        if (!data.length) return 0;
        const sorted = [...data].sort((a, b) => a - b);
        switch (func) {
          case 'min': return Math.min(...data);
          case 'max': return Math.max(...data);
          case 'mean': return data.reduce((a, b) => a + b, 0) / data.length;
          case 'median': return sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
          case 'mode': { const m = new Map<number, number>(); data.forEach(v => m.set(v, (m.get(v) || 0) + 1)); let maxC = 0, mode = 0; m.forEach((c, v) => { if (c > maxC) { maxC = c; mode = v; }}); return mode; }
          case 'stddev': { const avg = data.reduce((a, b) => a + b, 0) / data.length; return Math.sqrt(data.reduce((s, v) => s + (v - avg) ** 2, 0) / data.length); }
          case 'sum': return data.reduce((a, b) => a + b, 0);
          default: return 0;
        }
      },

      smaArray: (period: number, data: number[]) => {
        if (data.length < period) return [];
        const result: number[] = [];
        for (let i = period; i <= data.length; i++) {
          const slice = data.slice(i - period, i);
          result.push(slice.reduce((a, b) => a + b, 0) / period);
        }
        return result;
      },

      emaArray: (period: number, data: number[]) => {
        if (data.length < period) return [];
        const result: number[] = [];
        const k = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        result.push(ema);
        for (let i = period; i < data.length; i++) {
          ema = data[i] * k + ema * (1 - k);
          result.push(ema);
        }
        return result;
      },

      rsiArray: (period: number, data: number[]) => {
        if (data.length < period + 1) return [];
        const result: number[] = [];
        for (let i = period + 1; i <= data.length; i++) {
          const slice = data.slice(i - period - 1, i);
          let gains = 0, losses = 0;
          for (let j = 1; j < slice.length; j++) {
            const diff = slice[j] - slice[j - 1];
            if (diff > 0) gains += diff; else losses -= diff;
          }
          const avgGain = gains / period;
          const avgLoss = losses / period;
          if (avgLoss === 0) result.push(100);
          else result.push(100 - 100 / (1 + avgGain / avgLoss));
        }
        return result;
      },

      bbandsArray: (period: number, stddev: number, data: number[]) => {
        const result = { upper: [] as number[], middle: [] as number[], lower: [] as number[] };
        for (let i = period; i <= data.length; i++) {
          const slice = data.slice(i - period, i);
          const avg = slice.reduce((a, b) => a + b, 0) / period;
          const variance = slice.reduce((s, v) => s + (v - avg) ** 2, 0) / period;
          const sd = Math.sqrt(variance);
          result.upper.push(avg + stddev * sd);
          result.middle.push(avg);
          result.lower.push(avg - stddev * sd);
        }
        return result;
      },

      macdArray: (fast: number, slow: number, signal: number, data: number[]) => {
        const macdLine = Deriv.emaArray(fast, data).slice(-data.length - slow + fast);
        const sigLine = Deriv.emaArray(signal, macdLine);
        const result = { macd: [] as number[], signal: [] as number[], histogram: [] as number[] };
        for (let i = 0; i < sigLine.length; i++) {
          result.macd.push(macdLine[i + macdLine.length - sigLine.length]);
          result.signal.push(sigLine[i]);
          result.histogram.push(result.macd[i] - result.signal[i]);
        }
        return result;
      },

      telegramNotify: async (token: string, chatId: string, message: string) => {
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message }),
          });
        } catch (e: any) {
          Deriv.log(`Telegram notify failed: ${e.message}`);
        }
      },

      showLoader: (show: boolean) => {
        this.onLog(show ? 'Loading...' : 'Loading complete');
      },

      setStopLoss: (amount: number) => { _stopLossAmount = amount; },
      setTakeProfit: (amount: number) => { _takeProfitAmount = amount; },
      setAccumulatorTakeProfit: (amount: number) => { _accuTakeProfitAmount = amount; },

      waitTicks: async (count: number) => {
        const target = this._tickHistory.length + count;
        await new Promise<void>((resolve) => {
          const check = () => {
            if (this._tickHistory.length >= target || !this._running) resolve();
            else setTimeout(check, 50);
          };
          check();
        });
      },

      settings: this._settings || DEFAULT_SETTINGS,
    };

    // Execute the generated strategy code
    try {
      const asyncFn = new Function('Deriv', `return (async () => { ${code} })();`);
      await asyncFn(Deriv);
    } catch (err: any) {
      this.onError(`Strategy execution error: ${err.message}`);
    }
  }

  stop() {
    this._running = false;
    this._tickCallbacks = [];
    if (this._tickSubscriptionId) {
      this.api({ forget: this._tickSubscriptionId }).catch(() => {});
      this._tickSubscriptionId = null;
    }
    this.onStatusChange(false);
    this.onLog('Bot stopped');
  }

  handleTick(tick: any) {
    const value = tick.quote ?? tick.tick ?? 0;
    this._currentTick = value;
    this._tickHistory.push(value);
    if (this._tickHistory.length > 1000) this._tickHistory.shift();
    if (this._running) {
      const cbs = this._tickCallbacks.slice();
      cbs.forEach(cb => cb().catch(e => this.onError(`Tick callback error: ${e.message}`)));
    }
  }

  handleContractUpdate(update: any) {
    const contract = update?.proposal_open_contract;
    if (contract) {
      this._currentContract = contract;
      if (contract.is_sold) {
        const result: TradeResult = {
          contract_id: contract.contract_id,
          buy_price: parseFloat(contract.buy_price),
          payout: parseFloat(contract.payout),
          profit: parseFloat(contract.profit),
          status: parseFloat(contract.profit) > 0 ? 'won' : 'lost',
          entry_tick: contract.entry_tick,
          exit_tick: contract.exit_tick,
          contract_type: contract.contract_type || '',
          symbol: contract.symbol || '',
        };
        this._currentContract = null;
        this._lastContractResult = { ...result, status: result.status };
        this._totalRuns++;
        this.onTradeUpdate(result);
        this.onLog(`Contract #${result.contract_id} ${result.status.toUpperCase()} — profit: ${result.profit.toFixed(2)}`);
      }
    }
  }

  private async subscribeTicks(symbol: string) {
    const resp = await this.api({ ticks: symbol, subscribe: 1 });
    if (resp.error) throw new Error(resp.error.message);
    this._tickSubscriptionId = resp.tick?.id ?? null;
    this.onLog(`Subscribed to ticks for ${symbol}`);
  }
}
