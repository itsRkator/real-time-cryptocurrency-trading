'use client';

import { useTradingStore } from '../../stores/trading-store';

function formatTime(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

export function RecentTradesPanel() {
  const trades = useTradingStore((s) => s.recentTrades);
  const dataStale = useTradingStore((s) => s.dataStale);

  return (
    <section className="flex h-full min-h-[240px] flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Recent Trades</h2>
        {dataStale ? (
          <span className="text-[11px] uppercase tracking-wide text-amber-300">
            STALE
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-[64px_1fr_1fr_48px] gap-2 px-1 text-[11px] uppercase tracking-wide text-slate-500">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Side</span>
      </div>

      <ul className="mt-1 flex-1 space-y-0.5 overflow-auto">
        {trades.length === 0 ? (
          <li className="px-1 py-6 text-center text-sm text-slate-500">
            Waiting for trades…
          </li>
        ) : (
          trades.map((trade) => (
            <li
              key={trade.id}
              className="grid grid-cols-[64px_1fr_1fr_48px] gap-2 px-1 py-0.5 font-mono text-xs text-slate-300"
            >
              <span className="text-slate-500">{formatTime(trade.timestampMs)}</span>
              <span
                className={`text-right ${
                  trade.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {trade.price}
              </span>
              <span className="text-right">{trade.quantity}</span>
              <span
                className={`text-right uppercase ${
                  trade.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {trade.side}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
