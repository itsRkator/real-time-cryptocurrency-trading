'use client';

import type { TierOverride } from '@crypto/protocol';
import { useTradingStore } from '../../stores/trading-store';

interface DebugControlsProps {
  onTierOverride: (tier: TierOverride) => void;
  onDisconnect: () => void;
}

const TIER_BUTTONS: Array<{ label: string; value: TierOverride }> = [
  { label: 'Auto', value: 'auto' },
  { label: 'Full', value: 'full' },
  { label: 'Degraded', value: 'degraded' },
  { label: 'Minimal', value: 'minimal' },
];

export function DebugControls({ onTierOverride, onDisconnect }: DebugControlsProps) {
  const latencyMs = useTradingStore((s) => s.latencyMs);
  const jitterMs = useTradingStore((s) => s.jitterMs);
  const tier = useTradingStore((s) => s.tier);
  const mode = useTradingStore((s) => s.mode);
  const targetHz = useTradingStore((s) => s.targetHz);
  const observedCandleHz = useTradingStore((s) => s.observedCandleHz);
  const connectionStatus = useTradingStore((s) => s.connectionStatus);
  const overrideActive = useTradingStore((s) => s.overrideActive);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3 lg:grid-cols-6">
          <Metric
            label="Connection"
            value={connectionStatus}
          />
          <Metric
            label="Latency"
            value={latencyMs !== null ? `${latencyMs.toFixed(1)} ms` : '—'}
          />
          <Metric
            label="Jitter"
            value={jitterMs !== null ? `${jitterMs.toFixed(1)} ms` : '—'}
          />
          <Metric label="Tier" value={tier} />
          <Metric
            label="Mode"
            value={mode === 'forced' || overrideActive ? 'Forced' : 'Automatic'}
          />
          <Metric
            label="Chart delivery"
            value={`up to ${targetHz} Hz`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Delivery
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Delivery tier override">
            {TIER_BUTTONS.map((button) => {
              const active =
                button.value === 'auto'
                  ? !overrideActive
                  : overrideActive && tier === button.value;
              return (
                <button
                  key={button.value}
                  type="button"
                  onClick={() => onTierOverride(button.value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                    active
                      ? 'bg-violet-500/25 text-violet-200'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                  aria-pressed={active}
                >
                  {button.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
        <div>
          Tier target: up to {targetHz} Hz
          {observedCandleHz !== null
            ? ` · Observed candle delivery: ${observedCandleHz.toFixed(1)} Hz`
            : null}
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-medium text-amber-200 hover:bg-amber-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          Disconnect socket (debug)
        </button>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="font-medium capitalize text-slate-200">{value}</div>
    </div>
  );
}
