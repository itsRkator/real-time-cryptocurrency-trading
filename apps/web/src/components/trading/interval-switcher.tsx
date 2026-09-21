'use client';

import type { CandleInterval } from '@crypto/protocol';
import { useTradingStore } from '../../stores/trading-store';

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m'];

interface IntervalSwitcherProps {
  onChange: (interval: CandleInterval) => void;
}

export function IntervalSwitcher({ onChange }: IntervalSwitcherProps) {
  const interval = useTradingStore((s) => s.interval);

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Candle interval">
      {INTERVALS.map((value) => {
        const active = value === interval;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
              active
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
            aria-pressed={active}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}
