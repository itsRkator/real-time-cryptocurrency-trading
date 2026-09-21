'use client';

import type { CandleInterval, TierOverride } from '@crypto/protocol';
import { useEffect, useRef } from 'react';
import { MarketSession } from '../../lib/market/market-session';
import { useTradingStore } from '../../stores/trading-store';
import { CandleChart } from './candle-chart';
import { DebugControls } from './debug-controls';
import { IntervalSwitcher } from './interval-switcher';
import { OhlcReadout } from './ohlc-readout';
import { OrderBookPanel } from './order-book-panel';
import { RecentTradesPanel } from './recent-trades-panel';
import { TradingHeader } from './trading-header';

export function TradingScreen() {
  const sessionRef = useRef<MarketSession | null>(null);
  const candles = useTradingStore((s) => s.candles);
  const candlesLoading = useTradingStore((s) => s.candlesLoading);
  const candlesError = useTradingStore((s) => s.candlesError);
  const dataStale = useTradingStore((s) => s.dataStale);

  useEffect(() => {
    const session = new MarketSession();
    sessionRef.current = session;
    session.start();
    return () => {
      session.dispose();
      sessionRef.current = null;
    };
  }, []);

  const onIntervalChange = (interval: CandleInterval) => {
    sessionRef.current?.setInterval(interval);
  };

  const onTierOverride = (tier: TierOverride) => {
    sessionRef.current?.setTierOverride(tier);
  };

  const onDisconnect = () => {
    sessionRef.current?.debugDisconnect();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-4 p-4 md:p-6">
      <TradingHeader />

      <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-[420px] flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <IntervalSwitcher onChange={onIntervalChange} />
            <OhlcReadout />
          </div>

          <div className="relative min-h-[360px] flex-1">
            {candlesLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950/80 text-sm text-slate-400">
                Loading candle history…
              </div>
            ) : null}
            {candlesError ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-rose-900/50 bg-slate-950/90 text-sm text-rose-300">
                {candlesError}
              </div>
            ) : null}
            {!candlesLoading && !candlesError && candles.length === 0 ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-slate-800 bg-slate-950/80 text-sm text-slate-400">
                No candle history available
              </div>
            ) : null}
            <CandleChart candles={candles} stale={dataStale} />
          </div>
        </section>

        <aside className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <OrderBookPanel />
          <RecentTradesPanel />
        </aside>
      </div>

      <DebugControls onTierOverride={onTierOverride} onDisconnect={onDisconnect} />
    </div>
  );
}
