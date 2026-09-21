import {
  CANDLE_INTERVALS,
  INITIAL_MID_PRICE,
  SYMBOL,
  SYMBOL_DISPLAY_NAME,
  SUPPORTED_INTERVALS,
  TRADES_PER_SECOND,
  PRICE_DECIMALS,
  QUANTITY_DECIMALS,
  type Candle,
  type CandleInterval,
  type MarketMetadata,
  type OrderBookSnapshot,
  type Trade,
} from '@crypto/protocol';
import { CandleEngine } from '../candles/candle-engine.js';
import {
  priceToUnits,
  quantityToUnits,
  unitsToPriceString,
  unitsToQuantityString,
} from '../fixed-point.js';
import { OrderBookEngine, type BookDeltaEvent } from '../order-book/order-book-engine.js';
import { SeededRng } from './seeded-rng.js';
import type { InternalTrade } from '../candles/candle-engine.js';

export interface MarketEvents {
  onTrade: (trade: Trade, bookDelta: BookDeltaEvent, candles: Map<CandleInterval, Candle>) => void;
}

export class MarketEngine {
  private readonly rng: SeededRng;
  private readonly book: OrderBookEngine;
  private readonly candles: CandleEngine;
  private readonly recentTrades: Trade[] = [];
  private tradeId = 0n;
  private midPriceUnits: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private listeners: MarketEvents['onTrade'][] = [];
  private readonly maxRecentTrades: number;

  constructor(seed: number, maxRecentTrades = 100) {
    this.rng = new SeededRng(seed);
    this.book = new OrderBookEngine();
    this.candles = new CandleEngine();
    this.midPriceUnits = priceToUnits(INITIAL_MID_PRICE);
    this.maxRecentTrades = maxRecentTrades;
  }

  onTrade(listener: MarketEvents['onTrade']): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  getMetadata(): MarketMetadata {
    return {
      symbol: SYMBOL,
      displayName: SYMBOL_DISPLAY_NAME,
      simulated: true,
      supportedIntervals: [...SUPPORTED_INTERVALS],
      priceDecimals: PRICE_DECIMALS,
      quantityDecimals: QUANTITY_DECIMALS,
    };
  }

  getOrderBookSnapshot(): OrderBookSnapshot {
    return this.book.getSnapshot();
  }

  getCandles(interval: CandleInterval, limit: number): Candle[] {
    return this.candles.getHistory(interval, limit, true);
  }

  getRecentTrades(limit = 30): Trade[] {
    return this.recentTrades.slice(-limit);
  }

  getActiveCandle(interval: CandleInterval): Candle | null {
    return this.candles.getActiveCandle(interval);
  }

  /**
   * Bootstrap several hours of deterministic history, then start live generation.
   */
  start(nowMs = Date.now()): void {
    if (this.running) {
      return;
    }
    this.bootstrapHistory(nowMs);
    this.book.initializeAroundMid(this.midPriceUnits, this.rng, nowMs);
    this.running = true;
    const intervalMs = Math.max(1, Math.floor(1000 / TRADES_PER_SECOND));
    this.timer = setInterval(() => {
      this.tick(Date.now());
    }, intervalMs);
    // Unref so tests/shutdown are not held open unexpectedly when appropriate.
    this.timer.unref?.();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Deterministic single-step used by tests. */
  tick(timestampMs: number): { trade: Trade; bookDelta: BookDeltaEvent; candles: Map<CandleInterval, Candle> } {
    const drift = this.rng.nextInt(-8, 8);
    this.midPriceUnits = Math.max(1_000, this.midPriceUnits + drift);
    const side: 'buy' | 'sell' = this.rng.chance(0.5) ? 'buy' : 'sell';
    const priceUnits =
      side === 'buy'
        ? this.midPriceUnits + this.rng.nextInt(0, 3)
        : this.midPriceUnits - this.rng.nextInt(0, 3);
    const quantityUnits = quantityToUnits(this.rng.nextFloat(0.001, 0.35));

    this.tradeId += 1n;
    const internal: InternalTrade = {
      id: this.tradeId,
      timestampMs,
      priceUnits: Math.max(1, priceUnits),
      quantityUnits: Math.max(1, quantityUnits),
      side,
    };

    const candles = this.candles.applyTrade(internal);
    const bookDelta = this.book.mutateAfterTrade(
      internal.priceUnits,
      side,
      this.rng,
      timestampMs,
    );

    const trade: Trade = {
      id: internal.id.toString(),
      symbol: SYMBOL,
      timestampMs,
      price: unitsToPriceString(internal.priceUnits),
      quantity: unitsToQuantityString(internal.quantityUnits),
      side,
    };

    this.recentTrades.push(trade);
    if (this.recentTrades.length > this.maxRecentTrades) {
      this.recentTrades.splice(0, this.recentTrades.length - this.maxRecentTrades);
    }

    for (const listener of this.listeners) {
      listener(trade, bookDelta, candles);
    }

    return { trade, bookDelta, candles };
  }

  private bootstrapHistory(nowMs: number): void {
    // Generate ~6 hours of 1m-resolution synthetic history via accelerated ticks.
    const historyHours = 6;
    const startMs = nowMs - historyHours * 60 * 60 * 1000;
    const ticks = historyHours * 60 * 12; // ~12 trades per simulated minute
    const step = Math.floor((nowMs - startMs) / ticks);

    for (let i = 0; i < ticks; i += 1) {
      const ts = startMs + i * step;
      this.tickQuiet(ts);
    }
  }

  /** Apply trade/candle/book without notifying live listeners (bootstrap). */
  private tickQuiet(timestampMs: number): void {
    const drift = this.rng.nextInt(-8, 8);
    this.midPriceUnits = Math.max(1_000, this.midPriceUnits + drift);
    const side: 'buy' | 'sell' = this.rng.chance(0.5) ? 'buy' : 'sell';
    const priceUnits =
      side === 'buy'
        ? this.midPriceUnits + this.rng.nextInt(0, 3)
        : this.midPriceUnits - this.rng.nextInt(0, 3);
    const quantityUnits = quantityToUnits(this.rng.nextFloat(0.001, 0.35));

    this.tradeId += 1n;
    const internal: InternalTrade = {
      id: this.tradeId,
      timestampMs,
      priceUnits: Math.max(1, priceUnits),
      quantityUnits: Math.max(1, quantityUnits),
      side,
    };
    this.candles.applyTrade(internal);
    this.book.mutateAfterTrade(internal.priceUnits, side, this.rng, timestampMs);
  }
}

export function intervalMs(interval: CandleInterval): number {
  return CANDLE_INTERVALS[interval];
}
