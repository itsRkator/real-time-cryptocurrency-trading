import type {
  Candle,
  CandleInterval,
  DeliveryTier,
  Trade,
} from '@crypto/protocol';
import { create } from 'zustand';
import type { ConnectionStatus } from '../lib/websocket/market-socket';
import type { BookSyncStatus } from '../lib/market/book-synchronizer';

export interface BookLevelView {
  price: string;
  quantity: string;
}

export interface InspectedCandle {
  openTimeMs: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface TradingState {
  connectionStatus: ConnectionStatus;
  dataStale: boolean;
  interval: CandleInterval;
  candles: Candle[];
  candlesLoading: boolean;
  candlesError: string | null;
  inspectedCandle: InspectedCandle | null;
  latestPrice: string | null;
  previousPrice: string | null;
  referencePrice: string | null;
  recentTrades: Trade[];
  bids: BookLevelView[];
  asks: BookLevelView[];
  bookStatus: BookSyncStatus;
  bookSequence: string | null;
  latencyMs: number | null;
  jitterMs: number | null;
  tier: DeliveryTier;
  overrideActive: boolean;
  targetHz: number;
  observedCandleHz: number | null;
  mode: 'auto' | 'forced';

  setConnectionStatus: (status: ConnectionStatus) => void;
  setDataStale: (stale: boolean) => void;
  setInterval: (interval: CandleInterval) => void;
  setCandles: (candles: Candle[]) => void;
  upsertCandle: (candle: Candle) => void;
  setCandlesLoading: (loading: boolean) => void;
  setCandlesError: (error: string | null) => void;
  setInspectedCandle: (candle: InspectedCandle | null) => void;
  setLatestPrice: (price: string) => void;
  setReferencePrice: (price: string | null) => void;
  pushTrade: (trade: Trade) => void;
  setBook: (bids: BookLevelView[], asks: BookLevelView[], sequence: string | null, status: BookSyncStatus) => void;
  setBookStatus: (status: BookSyncStatus) => void;
  setNetworkMetrics: (latencyMs: number | null, jitterMs: number | null) => void;
  setTierStatus: (input: {
    tier: DeliveryTier;
    overrideActive: boolean;
    targetHz: number;
  }) => void;
  noteCandleDelivery: () => void;
}

const candleDeliveryTimestamps: number[] = [];

export const useTradingStore = create<TradingState>((set, get) => ({
  connectionStatus: 'connecting',
  dataStale: true,
  interval: '1m',
  candles: [],
  candlesLoading: true,
  candlesError: null,
  inspectedCandle: null,
  latestPrice: null,
  previousPrice: null,
  referencePrice: null,
  recentTrades: [],
  bids: [],
  asks: [],
  bookStatus: 'idle',
  bookSequence: null,
  latencyMs: null,
  jitterMs: null,
  tier: 'degraded',
  overrideActive: false,
  targetHz: 4,
  observedCandleHz: null,
  mode: 'auto',

  setConnectionStatus: (status) =>
    set({
      connectionStatus: status,
      dataStale: status !== 'live',
    }),

  setDataStale: (stale) => set({ dataStale: stale }),

  setInterval: (interval) => set({ interval }),

  setCandles: (candles) => {
    const first = candles[0];
    set({
      candles,
      referencePrice: first?.open ?? get().referencePrice,
      candlesLoading: false,
      candlesError: null,
    });
  },

  upsertCandle: (candle) => {
    const existing = get().candles;
    const index = existing.findIndex((c) => c.openTimeMs === candle.openTimeMs);
    let next: Candle[];
    if (index >= 0) {
      next = existing.slice();
      next[index] = candle;
    } else {
      const last = existing[existing.length - 1];
      if (last && candle.openTimeMs < last.openTimeMs) {
        return;
      }
      next = [...existing, candle];
    }
    set({ candles: next });
  },

  setCandlesLoading: (loading) => set({ candlesLoading: loading }),
  setCandlesError: (error) => set({ candlesError: error, candlesLoading: false }),
  setInspectedCandle: (candle) => set({ inspectedCandle: candle }),

  setLatestPrice: (price) => {
    const previous = get().latestPrice;
    set({ latestPrice: price, previousPrice: previous });
  },

  setReferencePrice: (price) => set({ referencePrice: price }),

  pushTrade: (trade) => {
    const recentTrades = [trade, ...get().recentTrades].slice(0, 30);
    set({ recentTrades });
    get().setLatestPrice(trade.price);
  },

  setBook: (bids, asks, sequence, status) =>
    set({ bids, asks, bookSequence: sequence, bookStatus: status }),

  setBookStatus: (status) => set({ bookStatus: status }),

  setNetworkMetrics: (latencyMs, jitterMs) => set({ latencyMs, jitterMs }),

  setTierStatus: ({ tier, overrideActive, targetHz }) =>
    set({
      tier,
      overrideActive,
      targetHz,
      mode: overrideActive ? 'forced' : 'auto',
    }),

  noteCandleDelivery: () => {
    const now = Date.now();
    candleDeliveryTimestamps.push(now);
    while (
      candleDeliveryTimestamps.length > 0 &&
      now - (candleDeliveryTimestamps[0] ?? 0) > 5_000
    ) {
      candleDeliveryTimestamps.shift();
    }
    const observedCandleHz =
      candleDeliveryTimestamps.length > 1
        ? candleDeliveryTimestamps.length / 5
        : null;
    set({ observedCandleHz });
  },
}));
