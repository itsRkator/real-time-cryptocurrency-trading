import {
  CANDLE_INTERVALS,
  type Candle,
  type CandleInterval,
} from '@crypto/protocol';
import {
  maxInt,
  minInt,
  unitsToPriceString,
  unitsToQuantityString,
} from '../fixed-point.js';

export interface InternalTrade {
  id: bigint;
  timestampMs: number;
  priceUnits: number;
  quantityUnits: number;
  side: 'buy' | 'sell';
}

interface CandleState {
  openTimeMs: number;
  openUnits: number;
  highUnits: number;
  lowUnits: number;
  closeUnits: number;
  volumeUnits: number;
  tradeCount: number;
}

export class CandleEngine {
  private readonly states = new Map<CandleInterval, CandleState>();
  private readonly history = new Map<CandleInterval, Candle[]>();
  private readonly maxHistory: number;

  constructor(maxHistory = 2000) {
    this.maxHistory = maxHistory;
    for (const interval of Object.keys(CANDLE_INTERVALS) as CandleInterval[]) {
      this.history.set(interval, []);
    }
  }

  applyTrade(trade: InternalTrade): Map<CandleInterval, Candle> {
    const updated = new Map<CandleInterval, Candle>();

    for (const [interval, intervalMs] of Object.entries(CANDLE_INTERVALS) as Array<
      [CandleInterval, number]
    >) {
      const openTimeMs = Math.floor(trade.timestampMs / intervalMs) * intervalMs;
      let state = this.states.get(interval);

      if (!state || state.openTimeMs !== openTimeMs) {
        if (state) {
          this.pushHistory(interval, this.toCandle(state, intervalMs, true));
        }
        state = {
          openTimeMs,
          openUnits: trade.priceUnits,
          highUnits: trade.priceUnits,
          lowUnits: trade.priceUnits,
          closeUnits: trade.priceUnits,
          volumeUnits: trade.quantityUnits,
          tradeCount: 1,
        };
        this.states.set(interval, state);
      } else {
        state.highUnits = maxInt(state.highUnits, trade.priceUnits);
        state.lowUnits = minInt(state.lowUnits, trade.priceUnits);
        state.closeUnits = trade.priceUnits;
        state.volumeUnits += trade.quantityUnits;
        state.tradeCount += 1;
      }

      updated.set(interval, this.toCandle(state, intervalMs, false));
    }

    return updated;
  }

  getActiveCandle(interval: CandleInterval): Candle | null {
    const state = this.states.get(interval);
    if (!state) {
      return null;
    }
    return this.toCandle(state, CANDLE_INTERVALS[interval], false);
  }

  getHistory(interval: CandleInterval, limit: number, includeActive = true): Candle[] {
    const completed = this.history.get(interval) ?? [];
    const slice = completed.slice(-limit);
    if (!includeActive) {
      return slice;
    }
    const active = this.getActiveCandle(interval);
    if (!active) {
      return slice;
    }
    if (slice.length > 0 && slice[slice.length - 1]?.openTimeMs === active.openTimeMs) {
      return [...slice.slice(0, -1), active];
    }
    return [...slice, active].slice(-limit);
  }

  /** Seed completed historical candles (deterministic bootstrap). */
  seedHistory(interval: CandleInterval, candles: Candle[]): void {
    const capped = candles.slice(-this.maxHistory);
    this.history.set(interval, capped);
    const last = capped[capped.length - 1];
    if (last && !last.complete) {
      // Active candle should live in states; strip from history.
      this.history.set(
        interval,
        capped.filter((c) => c.complete),
      );
    }
  }

  setActiveFromCandle(interval: CandleInterval, candle: Candle): void {
    this.states.set(interval, {
      openTimeMs: candle.openTimeMs,
      openUnits: Math.round(Number(candle.open) * 100),
      highUnits: Math.round(Number(candle.high) * 100),
      lowUnits: Math.round(Number(candle.low) * 100),
      closeUnits: Math.round(Number(candle.close) * 100),
      volumeUnits: Math.round(Number(candle.volume) * 1_000_000),
      tradeCount: 1,
    });
  }

  private pushHistory(interval: CandleInterval, candle: Candle): void {
    const list = this.history.get(interval) ?? [];
    list.push(candle);
    if (list.length > this.maxHistory) {
      list.splice(0, list.length - this.maxHistory);
    }
    this.history.set(interval, list);
  }

  private toCandle(state: CandleState, intervalMs: number, complete: boolean): Candle {
    return {
      openTimeMs: state.openTimeMs,
      closeTimeMs: state.openTimeMs + intervalMs - 1,
      open: unitsToPriceString(state.openUnits),
      high: unitsToPriceString(state.highUnits),
      low: unitsToPriceString(state.lowUnits),
      close: unitsToPriceString(state.closeUnits),
      volume: unitsToQuantityString(state.volumeUnits),
      complete,
    };
  }
}
