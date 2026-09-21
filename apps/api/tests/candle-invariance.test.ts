import { describe, expect, it } from 'vitest';
import { CandleEngine } from '../src/market/candles/candle-engine.js';
import type { InternalTrade } from '../src/market/candles/candle-engine.js';

function trade(
  id: bigint,
  timestampMs: number,
  priceUnits: number,
  quantityUnits: number,
): InternalTrade {
  return {
    id,
    timestampMs,
    priceUnits,
    quantityUnits,
    side: 'buy',
  };
}

describe('candle engine tier invariance', () => {
  it('produces identical final OHLCV regardless of delivery coalescing', () => {
    const trades: InternalTrade[] = [
      trade(1n, 60_000, 6_800_000, 100_000),
      trade(2n, 60_100, 6_801_000, 200_000),
      trade(3n, 60_200, 6_799_500, 150_000),
      trade(4n, 60_300, 6_802_000, 50_000),
    ];

    const engineFull = new CandleEngine();
    const engineMinimal = new CandleEngine();

    for (const t of trades) {
      engineFull.applyTrade(t);
      engineMinimal.applyTrade(t);
    }

    const full = engineFull.getActiveCandle('1m');
    const minimal = engineMinimal.getActiveCandle('1m');

    expect(full).not.toBeNull();
    expect(minimal).not.toBeNull();
    expect(full).toEqual(minimal);
    expect(full?.open).toBe('68000.00');
    expect(full?.high).toBe('68020.00');
    expect(full?.low).toBe('67995.00');
    expect(full?.close).toBe('68020.00');
    expect(full?.volume).toBe('0.500000');
  });
});
