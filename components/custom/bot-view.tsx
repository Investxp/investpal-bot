'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Bot, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BotView() {
  const router = useRouter();

  const openBot = () => {
    window.location.href = '/bot/';
  };

  return (
    <div className="relative w-full h-full bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center justify-center max-w-md mx-auto text-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-red-600/20 flex items-center justify-center">
          <Bot className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-100">Deriv Bot</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Build, test, and run automated trading strategies with Deriv Bot&apos;s visual drag-and-drop interface.
          No coding required.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button
            onClick={openBot}
            className="bg-red-600 hover:bg-red-700 text-white h-12 text-base font-semibold gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open Deriv Bot
          </Button>
        </div>
      </div>
    </div>
  );
}
