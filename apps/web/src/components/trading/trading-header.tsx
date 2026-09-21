'use client';

import { SYMBOL_DISPLAY_NAME } from '@crypto/protocol';
import { useTradingStore } from '../../stores/trading-store';

function formatPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function TradingHeader() {
  const latestPrice = useTradingStore((s) => s.latestPrice);
  const referencePrice = useTradingStore((s) => s.referencePrice);
  const previousPrice = useTradingStore((s) => s.previousPrice);
  const connectionStatus = useTradingStore((s) => s.connectionStatus);
  const dataStale = useTradingStore((s) => s.dataStale);

  const moveFromReference =
    latestPrice && referencePrice
      ? ((Number(latestPrice) - Number(referencePrice)) / Number(referencePrice)) *
        100
      : null;

  const tickDirection =
    latestPrice && previousPrice
      ? Number(latestPrice) - Number(previousPrice)
      : 0;

  const statusLabel =
    connectionStatus === 'live' && !dataStale
      ? 'Live'
      : connectionStatus === 'reconnecting'
        ? 'Reconnecting — displayed market data is stale'
        : connectionStatus === 'connecting'
          ? 'Connecting'
          : connectionStatus === 'stale'
            ? 'Stale'
            : connectionStatus === 'offline'
              ? 'Offline'
              : 'Error';

  const statusColor =
    connectionStatus === 'live' && !dataStale
      ? 'bg-emerald-400'
      : connectionStatus === 'reconnecting' || dataStale
        ? 'bg-amber-400'
        : 'bg-rose-400';

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl tracking-tight text-slate-50 md:text-3xl">
            {SYMBOL_DISPLAY_NAME}
          </h1>
          <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
            Simulated
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-400">BTC-USD-SIM synthetic market</p>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Last</div>
          <div
            className={`font-mono text-3xl font-semibold tabular-nums ${
              tickDirection >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {latestPrice ? `$${latestPrice}` : '—'}
          </div>
          <div className="text-xs text-slate-400">
            Movement vs first loaded candle:{' '}
            <span
              className={
                moveFromReference !== null && moveFromReference >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }
            >
              {moveFromReference !== null ? formatPct(moveFromReference) : '—'}
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm text-slate-200"
          role="status"
          aria-live="polite"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} aria-hidden />
          {statusLabel}
        </div>
      </div>
    </header>
  );
}
