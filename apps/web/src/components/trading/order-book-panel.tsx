'use client';

import { useTradingStore } from '../../stores/trading-store';

export function OrderBookPanel() {
  const bids = useTradingStore((s) => s.bids);
  const asks = useTradingStore((s) => s.asks);
  const bookStatus = useTradingStore((s) => s.bookStatus);
  const dataStale = useTradingStore((s) => s.dataStale);
  const bookSequence = useTradingStore((s) => s.bookSequence);

  const bestBid = bids[0] ? Number(bids[0].price) : null;
  const bestAsk = asks[0] ? Number(asks[0].price) : null;
  const spread =
    bestBid !== null && bestAsk !== null ? (bestAsk - bestBid).toFixed(2) : null;

  const maxQty = Math.max(
    ...bids.map((l) => Number(l.quantity)),
    ...asks.map((l) => Number(l.quantity)),
    0.000001,
  );

  const statusNote =
    bookStatus === 'synchronized' && !dataStale
      ? 'Synced'
      : bookStatus === 'resyncing' || bookStatus === 'snapshot_loading'
        ? 'Syncing…'
        : dataStale
          ? 'STALE'
          : bookStatus;

  // Display asks with nearest ask at bottom (conventional).
  const askRows = [...asks].slice(0, 10).reverse();

  return (
    <section className="flex h-full min-h-[280px] flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Order Book</h2>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          {statusNote}
          {bookSequence ? ` · seq ${bookSequence}` : ''}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-2 px-1 text-[11px] uppercase tracking-wide text-slate-500">
        <span>Price</span>
        <span className="text-right">Size</span>
      </div>

      <div className="mt-1 flex-1 space-y-0.5 overflow-hidden">
        {askRows.map((level) => (
          <BookRow
            key={`ask-${level.price}`}
            price={level.price}
            quantity={level.quantity}
            side="ask"
            depth={Number(level.quantity) / maxQty}
          />
        ))}

        <div className="my-1 flex items-center justify-between rounded bg-slate-900 px-2 py-1.5 text-xs">
          <span className="text-slate-400">Spread</span>
          <span className="font-mono text-slate-200">
            {spread !== null ? `$${spread}` : '—'}
          </span>
        </div>

        {bids.slice(0, 10).map((level) => (
          <BookRow
            key={`bid-${level.price}`}
            price={level.price}
            quantity={level.quantity}
            side="bid"
            depth={Number(level.quantity) / maxQty}
          />
        ))}
      </div>
    </section>
  );
}

function BookRow({
  price,
  quantity,
  side,
  depth,
}: {
  price: string;
  quantity: string;
  side: 'bid' | 'ask';
  depth: number;
}) {
  const color = side === 'bid' ? 'text-emerald-400' : 'text-rose-400';
  const bar =
    side === 'bid' ? 'bg-emerald-500/15' : 'bg-rose-500/15';

  return (
    <div className="relative grid grid-cols-[1fr_1fr] gap-2 px-1 py-0.5 font-mono text-xs">
      <div
        className={`absolute inset-y-0 right-0 ${bar}`}
        style={{ width: `${Math.min(100, depth * 100)}%` }}
        aria-hidden
      />
      <span className={`relative ${color}`}>{price}</span>
      <span className="relative text-right text-slate-300">{quantity}</span>
    </div>
  );
}
