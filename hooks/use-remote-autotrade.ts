'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import type { TradeStatus, TradeConfig } from '@/lib/api-client';

const emptyStatus: TradeStatus = {
  isRunning: false,
  stats: { totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, status: 'idle' },
  logs: [],
  leg1: { label: 'Leg 1', contractType: 'CALL', currentStake: 0, isTrading: false, activeContractId: null, lastResult: null, profit: 0 },
  leg2: { label: 'Leg 2', contractType: 'PUT', currentStake: 0, isTrading: false, activeContractId: null, lastResult: null, profit: 0 },
  leg3: { label: 'Leg 3', contractType: 'DIGITMATCH', currentStake: 0, isTrading: false, activeContractId: null, lastResult: null, profit: 0 },
};

export function useRemoteAutoTrade() {
  const [status, setStatus] = useState<TradeStatus>(emptyStatus);
  const [backendConnected, setBackendConnected] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    apiClient.connect();
    apiClient.getStatus().then(setStatus).catch(() => {});

    const unsubStatus = apiClient.onStatus((s) => {
      setStatus(s);
      setBackendConnected(true);
    });
    const unsubLog = apiClient.onLog(() => {});

    const interval = setInterval(() => {
      apiClient.getStatus().then(setStatus).catch(() => setBackendConnected(false));
    }, 2000);

    return () => {
      unsubStatus(); unsubLog(); clearInterval(interval);
    };
  }, []);

  const startAutoTrade = useCallback(async (config: TradeConfig) => {
    await apiClient.start(config);
    const s = await apiClient.getStatus();
    setStatus(s);
  }, []);

  const stopAutoTrade = useCallback(async (reason?: string) => {
    await apiClient.stop();
    const s = await apiClient.getStatus();
    setStatus(s);
    if (reason) {
      const log = { id: '0', timestamp: new Date().toLocaleTimeString(), type: 'warn' as const, message: `[System] Stopped: ${reason}` };
      setStatus(prev => ({ ...prev, logs: [...prev.logs, log] }));
    }
  }, []);

  return {
    isRunning: status.isRunning,
    backendConnected,
    startAutoTrade,
    stopAutoTrade,
    logs: status.logs,
    stats: status.stats,
    leg1: status.leg1,
    leg2: status.leg2,
    leg3: status.leg3,
  };
}
