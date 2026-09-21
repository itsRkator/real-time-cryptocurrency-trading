export const PROTOCOL_VERSION = 1 as const;

export const SYMBOL = 'BTC-USD-SIM' as const;
export const SYMBOL_DISPLAY_NAME = 'BTC / USD' as const;

export const PRICE_SCALE = 100;
export const QUANTITY_SCALE = 1_000_000;
export const PRICE_DECIMALS = 2;
export const QUANTITY_DECIMALS = 6;

/** Market event generation rate (not chart delivery rate). */
export const TRADES_PER_SECOND = 20;

export const DEFAULT_MARKET_SEED = 42;
export const INITIAL_MID_PRICE = 68_000;

export const BOOK_DEPTH_INTERNAL = 20;
export const BOOK_DEPTH_DISPLAY = 10;

export const RECENT_TRADES_INTERNAL = 100;
export const RECENT_TRADES_DISPLAY = 25;

export const CANDLE_HISTORY_LIMIT_DEFAULT = 300;
export const CANDLE_HISTORY_LIMIT_MAX = 1000;

export const PING_INTERVAL_MS = 2_000;
export const PING_TIMEOUT_MS = 10_000;

export const NETWORK_REPORT_ALPHA = 0.2;

export const MISSING_REPORT_DEGRADED_MS = 10_000;
export const MISSING_REPORT_MINIMAL_MS = 20_000;

export const BOOK_DELTA_BUFFER_MAX = 500;

export const CANDLE_INTERVALS = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
} as const;

export type CandleInterval = keyof typeof CANDLE_INTERVALS;

export const SUPPORTED_INTERVALS = ['1m', '5m', '15m'] as const;

export const TIER_DELIVERY_INTERVAL_MS = {
  full: 100,
  degraded: 250,
  minimal: 1_000,
} as const;

export const TIER_TARGET_HZ = {
  full: 10,
  degraded: 4,
  minimal: 1,
} as const;

export const HYSTERESIS = {
  fullToDegraded: {
    latencyMs: 180,
    jitterMs: 60,
    consecutive: 3,
  },
  degradedToFull: {
    latencyMs: 120,
    jitterMs: 30,
    consecutive: 5,
  },
  degradedToMinimal: {
    latencyMs: 350,
    jitterMs: 120,
    consecutive: 3,
  },
  minimalToDegraded: {
    latencyMs: 250,
    jitterMs: 80,
    consecutive: 5,
  },
} as const;

export const NETWORK_REPORT_MAX_LATENCY_MS = 60_000;
export const NETWORK_REPORT_MAX_JITTER_MS = 60_000;
export const NETWORK_REPORT_MAX_SAMPLE_COUNT = 10_000;
