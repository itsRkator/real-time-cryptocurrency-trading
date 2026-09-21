import {
  BOOK_DEPTH_DISPLAY,
  BOOK_DEPTH_INTERNAL,
  SYMBOL,
  type BookChange,
  type OrderBookSnapshot,
} from '@crypto/protocol';
import { unitsToPriceString, unitsToQuantityString } from '../fixed-point.js';
import type { SeededRng } from '../generator/seeded-rng.js';

export interface BookDeltaEvent {
  seq: bigint;
  timestampMs: number;
  changes: BookChange[];
}

/**
 * Maintains a plausible L2 book as absolute quantity-at-price.
 * Sequence increments on every logical mutation.
 */
export class OrderBookEngine {
  private readonly bids = new Map<number, number>(); // priceUnits -> qtyUnits
  private readonly asks = new Map<number, number>();
  private sequence = 0n;
  private lastTimestampMs = 0;

  getSequence(): bigint {
    return this.sequence;
  }

  initializeAroundMid(midPriceUnits: number, rng: SeededRng, timestampMs: number): BookDeltaEvent {
    this.bids.clear();
    this.asks.clear();
    const changes: BookChange[] = [];

    for (let i = 1; i <= BOOK_DEPTH_INTERNAL; i += 1) {
      const bidPrice = midPriceUnits - i;
      const askPrice = midPriceUnits + i;
      const bidQty = rng.nextInt(50_000, 2_500_000);
      const askQty = rng.nextInt(50_000, 2_500_000);
      this.bids.set(bidPrice, bidQty);
      this.asks.set(askPrice, askQty);
      changes.push({
        side: 'bid',
        price: unitsToPriceString(bidPrice),
        quantity: unitsToQuantityString(bidQty),
      });
      changes.push({
        side: 'ask',
        price: unitsToPriceString(askPrice),
        quantity: unitsToQuantityString(askQty),
      });
    }

    this.ensureInvariant(midPriceUnits);
    this.sequence += 1n;
    this.lastTimestampMs = timestampMs;

    return {
      seq: this.sequence,
      timestampMs,
      changes,
    };
  }

  /**
   * Nudge book after a trade: refresh near-touch levels, keep bestBid < bestAsk.
   */
  mutateAfterTrade(
    tradePriceUnits: number,
    side: 'buy' | 'sell',
    rng: SeededRng,
    timestampMs: number,
  ): BookDeltaEvent {
    const changes: BookChange[] = [];
    const mid = this.estimateMid(tradePriceUnits);

    // Occasionally remove/replace a random deeper level.
    if (rng.chance(0.35)) {
      const map = side === 'buy' ? this.asks : this.bids;
      const keys = [...map.keys()].sort((a, b) => (side === 'buy' ? a - b : b - a));
      const victim = keys[rng.nextInt(Math.min(3, keys.length - 1), keys.length - 1)];
      if (victim !== undefined) {
        map.delete(victim);
        changes.push({
          side: side === 'buy' ? 'ask' : 'bid',
          price: unitsToPriceString(victim),
          quantity: '0',
        });
      }
    }

    // Refresh top-of-book quantities around mid.
    for (let i = 1; i <= BOOK_DEPTH_INTERNAL; i += 1) {
      const bidPrice = mid - i;
      const askPrice = mid + i;
      if (bidPrice <= 0 || askPrice <= 0) {
        continue;
      }

      const bidQty = rng.nextInt(40_000, 2_800_000);
      const askQty = rng.nextInt(40_000, 2_800_000);
      this.bids.set(bidPrice, bidQty);
      this.asks.set(askPrice, askQty);
      changes.push({
        side: 'bid',
        price: unitsToPriceString(bidPrice),
        quantity: unitsToQuantityString(bidQty),
      });
      changes.push({
        side: 'ask',
        price: unitsToPriceString(askPrice),
        quantity: unitsToQuantityString(askQty),
      });
    }

    this.trimDepth();
    this.ensureInvariant(mid);
    this.sequence += 1n;
    this.lastTimestampMs = timestampMs;

    return {
      seq: this.sequence,
      timestampMs,
      changes,
    };
  }

  getSnapshot(): OrderBookSnapshot {
    const bids = this.sortedBids()
      .slice(0, BOOK_DEPTH_DISPLAY)
      .map(([price, qty]) => [unitsToPriceString(price), unitsToQuantityString(qty)] as [string, string]);
    const asks = this.sortedAsks()
      .slice(0, BOOK_DEPTH_DISPLAY)
      .map(([price, qty]) => [unitsToPriceString(price), unitsToQuantityString(qty)] as [string, string]);

    return {
      symbol: SYMBOL,
      sequence: this.sequence.toString(),
      timestampMs: this.lastTimestampMs,
      bids,
      asks,
    };
  }

  private sortedBids(): Array<[number, number]> {
    return [...this.bids.entries()].sort((a, b) => b[0] - a[0]);
  }

  private sortedAsks(): Array<[number, number]> {
    return [...this.asks.entries()].sort((a, b) => a[0] - b[0]);
  }

  private estimateMid(fallback: number): number {
    const bestBid = this.sortedBids()[0]?.[0];
    const bestAsk = this.sortedAsks()[0]?.[0];
    if (bestBid !== undefined && bestAsk !== undefined) {
      return Math.floor((bestBid + bestAsk) / 2);
    }
    return fallback;
  }

  private trimDepth(): void {
    const bids = this.sortedBids();
    const asks = this.sortedAsks();
    if (bids.length > BOOK_DEPTH_INTERNAL) {
      for (const [price] of bids.slice(BOOK_DEPTH_INTERNAL)) {
        this.bids.delete(price);
      }
    }
    if (asks.length > BOOK_DEPTH_INTERNAL) {
      for (const [price] of asks.slice(BOOK_DEPTH_INTERNAL)) {
        this.asks.delete(price);
      }
    }
  }

  /** Enforce bestBid < bestAsk by shifting crossed levels. */
  private ensureInvariant(mid: number): void {
    if (this.bids.size === 0 || this.asks.size === 0) {
      for (let i = 1; i <= BOOK_DEPTH_INTERNAL; i += 1) {
        if (!this.bids.has(mid - i)) {
          this.bids.set(mid - i, 100_000);
        }
        if (!this.asks.has(mid + i)) {
          this.asks.set(mid + i, 100_000);
        }
      }
    }

    let bestBid = this.sortedBids()[0]?.[0];
    let bestAsk = this.sortedAsks()[0]?.[0];
    let guard = 0;

    while (
      bestBid !== undefined &&
      bestAsk !== undefined &&
      bestBid >= bestAsk &&
      guard < 100
    ) {
      const askQty = this.asks.get(bestAsk) ?? 0;
      this.asks.delete(bestAsk);
      this.asks.set(bestAsk + 1, askQty);
      bestBid = this.sortedBids()[0]?.[0];
      bestAsk = this.sortedAsks()[0]?.[0];
      guard += 1;
    }
  }
}
