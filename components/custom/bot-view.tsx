'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BotView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(timer);
  }, []);

  const handleLoad = () => {
    setLoading(false);
    setError(false);
  };

  const handleReload = () => {
    setLoading(true);
    setError(false);
    const iframe = document.getElementById('bot-iframe') as HTMLIFrameElement;
    if (iframe) iframe.src = iframe.src;
  };

  return (
    <div className="relative w-full h-full bg-zinc-950 flex flex-col items-center justify-center">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-50 gap-3">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          <span className="text-sm text-zinc-400 font-medium">Loading Deriv Bot...</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 z-50 p-6 text-center max-w-md gap-4 mx-auto">
          <AlertTriangle className="w-12 h-12 text-amber-500" />
          <h3 className="text-lg font-bold text-zinc-200">Unable to Connect</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">The Deriv Bot is not responding.</p>
          <Button onClick={handleReload} className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 mt-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      )}
      <iframe
        id="bot-iframe"
        src="/bot/"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="InvestPal Deriv Bot"
        onLoad={handleLoad}
        onError={() => setError(true)}
      />
    </div>
  );
}
