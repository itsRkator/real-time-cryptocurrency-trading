import type {
  CandleInterval,
  ServerMessage,
  TierOverride,
} from '@crypto/protocol';
import { fetchCandles, fetchOrderBookSnapshot } from '../api/rest';
import {
  createBookSynchronizerState,
  reduceBookSynchronizer,
  topLevels,
  type BookSynchronizerState,
} from '../market/book-synchronizer';
import { MarketSocket } from '../websocket/market-socket';
import { useTradingStore } from '../../stores/trading-store';

/**
 * Orchestrates REST + WebSocket + book sync outside React render paths.
 */
export class MarketSession {
  private socket: MarketSocket | null = null;
  private bookState: BookSynchronizerState = createBookSynchronizerState();
  private syncInFlight = false;
  private syncGeneration = 0;
  private candleAbort: AbortController | null = null;
  private candleRequestGeneration = 0;
  private visibilityHandler: (() => void) | null = null;
  private disposed = false;

  start(): void {
    if (this.socket) {
      return;
    }
    this.socket = new MarketSocket({
      onMessage: (message) => this.handleServerMessage(message),
      onStatus: (status) => {
        useTradingStore.getState().setConnectionStatus(status);
        if (status === 'live') {
          void this.resyncOrderBook();
        } else {
          useTradingStore.getState().setDataStale(true);
        }
      },
      onMetrics: (metrics) => {
        useTradingStore
          .getState()
          .setNetworkMetrics(metrics.latencyEwmaMs, metrics.jitterEwmaMs);
      },
      onLog: (message) => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[MarketSocket]', message);
        }
      },
    });

    const interval = useTradingStore.getState().interval;
    this.socket.connect();
    this.socket.subscribe(interval, ['trades', 'book', 'candle']);
    void this.loadCandles(interval);
    void this.resyncOrderBook();
    this.bindVisibility();
  }

  dispose(): void {
    this.disposed = true;
    this.unbindVisibility();
    this.candleAbort?.abort();
    this.candleAbort = null;
    this.socket?.disconnect();
    this.socket = null;
  }

  setInterval(interval: CandleInterval): void {
    useTradingStore.getState().setInterval(interval);
    useTradingStore.getState().setCandlesLoading(true);
    this.socket?.subscribe(interval, ['trades', 'book', 'candle']);
    void this.loadCandles(interval);
  }

  setTierOverride(tier: TierOverride): void {
    this.socket?.setTierOverride(tier);
  }

  debugDisconnect(): void {
    useTradingStore.getState().setDataStale(true);
    this.socket?.debugDisconnect();
  }

  private async loadCandles(interval: CandleInterval): Promise<void> {
    this.candleRequestGeneration += 1;
    const generation = this.candleRequestGeneration;
    this.candleAbort?.abort();
    const abort = new AbortController();
    this.candleAbort = abort;

    try {
      const candles = await fetchCandles(interval, 300, abort.signal);
      if (this.disposed || generation !== this.candleRequestGeneration) {
        return;
      }
      if (useTradingStore.getState().interval !== interval) {
        return;
      }
      useTradingStore.getState().setCandles(candles);
      const last = candles[candles.length - 1];
      if (last) {
        useTradingStore.getState().setLatestPrice(last.close);
      }
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      if (generation !== this.candleRequestGeneration) {
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to load candles';
      useTradingStore.getState().setCandlesError(message);
    }
  }

  private async resyncOrderBook(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.syncInFlight) {
      // Generation token still advances so stale responses are ignored.
    }

    this.bookState = reduceBookSynchronizer(this.bookState, { type: 'BEGIN_SYNC' });
    this.syncGeneration = this.bookState.generation;
    this.syncInFlight = true;
    this.publishBook();

    const generation = this.syncGeneration;
    this.bookState = reduceBookSynchronizer(this.bookState, {
      type: 'SNAPSHOT_STARTED',
      generation,
    });

    try {
      const snapshot = await fetchOrderBookSnapshot();
      if (this.disposed || generation !== this.syncGeneration) {
        return;
      }
      this.bookState = reduceBookSynchronizer(this.bookState, {
        type: 'SNAPSHOT_RECEIVED',
        generation,
        snapshot,
      });
      this.publishBook();

      if (this.bookState.status === 'resyncing') {
        this.syncInFlight = false;
        void this.resyncOrderBook();
        return;
      }

      if (
        this.bookState.status === 'synchronized' &&
        useTradingStore.getState().connectionStatus === 'live'
      ) {
        useTradingStore.getState().setDataStale(false);
      }
    } catch (error) {
      if (generation !== this.syncGeneration) {
        return;
      }
      this.bookState = reduceBookSynchronizer(this.bookState, {
        type: 'SNAPSHOT_FAILED',
        generation,
        error: error instanceof Error ? error.message : 'Snapshot failed',
      });
      this.publishBook();
      // Retry shortly.
      setTimeout(() => {
        if (!this.disposed) {
          void this.resyncOrderBook();
        }
      }, 1_000);
    } finally {
      if (generation === this.syncGeneration) {
        this.syncInFlight = false;
      }
    }
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'trade':
        useTradingStore.getState().pushTrade({
          id: message.id,
          symbol: message.symbol,
          timestampMs: message.timestampMs,
          price: message.price,
          quantity: message.quantity,
          side: message.side,
        });
        break;
      case 'book_delta': {
        this.bookState = reduceBookSynchronizer(this.bookState, {
          type: 'DELTA',
          delta: {
            seq: message.seq,
            changes: message.changes,
            timestampMs: message.timestampMs,
          },
        });
        this.publishBook();
        if (
          this.bookState.status === 'resyncing' ||
          this.bookState.lastError?.includes('overflow')
        ) {
          void this.resyncOrderBook();
        }
        break;
      }
      case 'candle': {
        if (message.interval !== useTradingStore.getState().interval) {
          return;
        }
        useTradingStore.getState().upsertCandle(message.candle);
        useTradingStore.getState().setLatestPrice(message.candle.close);
        useTradingStore.getState().noteCandleDelivery();
        break;
      }
      case 'tier_status':
        useTradingStore.getState().setTierStatus({
          tier: message.tier,
          overrideActive: message.overrideActive,
          targetHz: message.targetHz,
        });
        break;
      case 'welcome':
      case 'subscription_ack':
      case 'error':
      case 'pong':
        break;
      default: {
        const _exhaustive: never = message;
        void _exhaustive;
      }
    }
  }

  private publishBook(): void {
    const bids = topLevels(this.bookState.book, 'bid', 10);
    const asks = topLevels(this.bookState.book, 'ask', 10);
    useTradingStore.getState().setBook(
      bids,
      asks,
      this.bookState.book.sequence,
      this.bookState.status,
    );
  }

  private bindVisibility(): void {
    if (typeof document === 'undefined') {
      return;
    }
    this.unbindVisibility();
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        const interval = useTradingStore.getState().interval;
        void this.loadCandles(interval);
        void this.resyncOrderBook();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private unbindVisibility(): void {
    if (typeof document === 'undefined' || !this.visibilityHandler) {
      return;
    }
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.visibilityHandler = null;
  }
}
