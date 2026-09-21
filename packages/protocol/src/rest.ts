import type { Candle, MarketMetadata, OrderBookSnapshot } from './market.js';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  status: 'ok';
  uptimeMs: number;
  protocolVersion: number;
  marketRunning: boolean;
}

export interface CandlesResponse {
  symbol: 'BTC-USD-SIM';
  interval: string;
  candles: Candle[];
}

export type OrderBookResponse = OrderBookSnapshot;
export type MarketResponse = MarketMetadata;
