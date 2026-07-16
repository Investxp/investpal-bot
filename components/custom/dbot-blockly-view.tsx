'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { UseAuthReturn } from '@/hooks/use-auth';

export function DbotBlocklyView({ auth }: { auth: UseAuthReturn }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authRef = useRef(auth);
  authRef.current = auth;

  useEffect(() => {
    const { authState, accounts, activeAccount } = authRef.current;
    if (authState !== 'authenticated' || accounts.length === 0) {
      setError('Log in or authorize with a PAT token in the Dashboard to use the Bot Builder');
      setIsLoading(false);
      return;
    }

    // Seed localStorage for the bot SPA before the iframe loads
    const activeId = activeAccount?.account_id ?? accounts[0].account_id;
    const isDemo = activeId.startsWith('VR') || activeId.startsWith('VRTC');
    const sessionToken = localStorage.getItem('session_token') ?? '';
    const storedAccountsList: Record<string, string> = {};
    const storedClientAccounts: Record<string, unknown> = {};
    let primaryToken = '';
    accounts.forEach(acc => {
      const token = (acc as any).token || sessionToken;
      if (!primaryToken) primaryToken = token;
      storedAccountsList[acc.account_id] = token;
      storedClientAccounts[acc.account_id] = {
        loginid: acc.account_id, token,
        currency: acc.currency || 'USD',
        is_virtual: acc.account_id.startsWith('VR') ? 1 : 0,
        balance: parseFloat((acc as any).balance ?? '0'),
      };
    });
    localStorage.setItem('active_loginid', activeId);
    localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
    localStorage.setItem('accountsList', JSON.stringify(storedAccountsList));
    localStorage.setItem('clientAccounts', JSON.stringify(storedClientAccounts));
    localStorage.setItem('authToken', primaryToken);
    const derivAccounts = accounts.map(acc => ({
      account_id: acc.account_id, currency: acc.currency || 'USD',
      is_virtual: acc.account_id.startsWith('VR') ? 1 : 0,
      token: (acc as any).token || sessionToken,
    }));
    sessionStorage.setItem('deriv_accounts', JSON.stringify(derivAccounts));

    // Iframe loads the bot SPA in an isolated context — no React conflict
    const container = iframeRef.current?.parentElement;
    setIsLoading(true);
    setError(null);

    // Block the iframe from redirecting the top-level page
    const preventTopNav = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (typeof e.data === 'string' && e.data.startsWith('redirect:')) {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('message', preventTopNav);

    return () => {
      window.removeEventListener('message', preventTopNav);
    };
  }, []);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load the Bot Builder. Please try again.');
  };

  // Allow the Bot tab button to pass through to the iframe
  // by letting the iframe handle its own OAuth redirects internally.
  // The iframe sandbox prevents top-level navigation.

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: '#151717' }}>
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 gap-4"
          style={{ background: '#151717' }}>
          <svg className="animate-spin h-10 w-10" viewBox="0 0 24 24" fill="none"
            style={{ color: '#ff444f' }}>
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm font-semibold" style={{ color: '#6b7280' }}>Loading Blockly strategy workspace...</p>
        </div>
      )}
      {!isLoading && error && (
        <div className="absolute inset-0 flex items-center justify-center p-8" style={{ background: '#151717' }}>
          <div className="max-w-lg text-center">
            <p className="text-lg font-bold mb-2" style={{ color: '#ff444f' }}>
              Bot Builder Unavailable
            </p>
            <p className="text-sm font-mono" style={{ color: '#9ca3af' }}>{error}</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/bot/index.html"
        className="w-full h-full border-0"
        title="Deriv Bot Builder"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        allow="clipboard-write"
        style={{ display: isLoading || error ? 'none' : 'block' }}
      />
    </div>
  );
}
