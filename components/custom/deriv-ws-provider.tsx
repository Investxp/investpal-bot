'use client';

import { createContext, useContext, useEffect } from 'react';
import { useDerivWS } from '@deriv/core';
import { useAuth } from '@/hooks/use-auth';
import type { DerivWS } from '@deriv/core';
import type { UseAuthReturn } from '@/hooks/use-auth';

interface DerivWSContextValue {
  ws: DerivWS | null;
  isConnected: boolean;
  isExhausted: boolean;
  auth: UseAuthReturn;
}

const DerivWSContext = createContext<DerivWSContextValue | null>(null);

/**
 * Maintains a single WebSocket connection and auth state above all page components
 * so navigation between pages (e.g. main → reports → back) does not tear down
 * and recreate the connection.
 */
export function DerivWSProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { ws, isConnected, isExhausted } = useDerivWS({
    url: auth.wsUrl,
    accountId: auth.activeAccountId ?? undefined,
  });

  // Real-time balance subscription
  useEffect(() => {
    if (!ws || !isConnected || !auth.activeAccountId) return;

    let unsubscribe: (() => void) | null = null;

    const handleBalance = (data: any) => {
      if (data.msg_type === 'balance' && data.balance) {
        const balVal = data.balance.balance;
        const balStr = typeof balVal === 'number' ? balVal.toFixed(2) : String(balVal);
        auth.updateAccountBalance(data.balance.loginid, balStr);
      }
    };

    const globalUnsub = ws.onMessage(handleBalance);

    ws.subscribe({ balance: 1, subscribe: 1 }, handleBalance)
      .then((sub) => {
        unsubscribe = () => {
          globalUnsub();
          sub.unsubscribe();
        };
      })
      .catch((err) => {
        console.error('Balance subscription error:', err);
        globalUnsub();
      });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [ws, isConnected, auth.activeAccountId, auth.updateAccountBalance]);

  return (
    <DerivWSContext.Provider value={{ ws, isConnected, isExhausted, auth }}>
      {children}
    </DerivWSContext.Provider>
  );
}

export function useDerivWSContext(): DerivWSContextValue {
  const ctx = useContext(DerivWSContext);
  if (!ctx) {
    throw new Error('useDerivWSContext must be used within a DerivWSProvider');
  }
  return ctx;
}
