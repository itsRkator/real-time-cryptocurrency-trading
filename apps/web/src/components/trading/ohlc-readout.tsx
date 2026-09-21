'use client';

import { useTradingStore } from '../../stores/trading-store';

export function OhlcReadout() {
  const inspected = useTradingStore((s) => s.inspectedCandle);
  const candles = useTradingStore((s) => s.candles);
  const active = inspected ?? (candles[candles.length - 1]
    ? {
        openTimeMs: candles[candles.length - 1]!.openTimeMs,
        open: candles[candles.length - 1]!.open,
        high: candles[candles.length - 1]!.high,
        low: candles[candles.length - 1]!.low,
        close: candles[candles.length - 1]!.close,
        volume: candles[candles.length - 1]!.volume,
      }
    : null);

  if (!active) {
    return (
      <div className="text-sm text-slate-500">Hover a candle to inspect OHLC</div>
    );
  }

  const time = new Date(active.openTimeMs).toISOString().replace('T', ' ').slice(0, 19);

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-slate-300">
      <span className="text-slate-500">{time} UTC</span>
      <span>O {active.open}</span>
      <span>H {active.high}</span>
      <span>L {active.low}</span>
      <span>C {active.close}</span>
      <span>V {active.volume}</span>
    </div>
  );
}
