'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DigitStats } from '../lib/types';

interface DigitStatsBarProps {
  digitStats: DigitStats;
  selectedDigit: number;
  onDigitSelect: (digit: number) => void;
}

function getTempColor(pct: number): string {
  if (pct <= 0) return 'bg-zinc-800';
  if (pct >= 16) return 'bg-green-500';
  if (pct >= 13) return 'bg-green-600';
  if (pct >= 11) return 'bg-green-700';
  if (pct >= 9) return 'bg-zinc-600';
  if (pct >= 7) return 'bg-red-700';
  if (pct >= 5) return 'bg-red-600';
  return 'bg-red-500';
}

export function DigitStatsBar({
  digitStats,
  selectedDigit,
  onDigitSelect,
}: DigitStatsBarProps) {
  const maxPct = Math.max(...digitStats.percentages);
  const minPct = Math.min(...digitStats.percentages);

  return (
    <div className="h-full flex flex-col min-h-0">
      <span className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
        Last digit prediction
      </span>
      <div className="flex-1 flex items-center min-h-0">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-3 place-items-center w-full">
        {digitStats.percentages.map((pct, digit) => {
          const isSelected = digit === selectedDigit;
          const isHighest = digitStats.totalTicks > 0 && pct === maxPct;
          const isLowest = digitStats.totalTicks > 0 && pct === minPct;
          const bitmap = digitStats.bitmap[digit] ?? [];

          return (
            <div key={digit} className="flex flex-col items-center gap-1 sm:gap-1.5">
              <Button
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => onDigitSelect(digit)}
                className={cn(
                  'w-11 h-11 sm:w-14 sm:h-14 text-base sm:text-xl font-semibold rounded-lg p-0',
                  !isSelected && 'bg-muted/50 border-muted-foreground/20'
                )}
              >
                {digit}
              </Button>
              <span
                className={cn(
                  'text-xs font-mono',
                  isHighest && 'text-green-500 font-semibold',
                  isLowest && 'text-red-500 font-semibold',
                  !isHighest && !isLowest && 'text-muted-foreground'
                )}
              >
                {pct.toFixed(1)}%
              </span>
              {bitmap.length > 0 && (
                <div className="flex gap-px">
                  {bitmap.map((hit, i) => (
                    <div
                      key={i}
                      className={cn(
                        'w-1 h-2.5 sm:w-1.5 sm:h-3 rounded-sm',
                        hit ? getTempColor(pct) : 'bg-zinc-800'
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
