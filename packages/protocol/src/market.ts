import type { CandleInterval } from './constants.js';

export type TradeSide = 'buy' | 'sell';
export type BookSide = 'bid' | 'ask';
export type DeliveryTier = 'full' | 'degraded' | 'minimal';
export type TierOverride = DeliveryTier | 'auto';
export type Channel = 'trades' | 'book' | 'candle';

export interface Trade {
  id: string;
  symbol: 'BTC-USD-SIM';
  timestampMs: number;
  price: string;
  quantity: string;
  side: TradeSide;
}

export interface Candle {
  openTimeMs: number;
  closeTimeMs: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  complete: boolean;
}

export interface BookLevel {
  price: string;
  quantity: string;
}

export interface OrderBookSnapshot {
  symbol: 'BTC-USD-SIM';
  sequence: string;
  timestampMs: number;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

export interface BookChange {
  side: BookSide;
  price: string;
  quantity: string;
}

export interface MarketMetadata {
  symbol: 'BTC-USD-SIM';
  displayName: string;
  simulated: true;
  supportedIntervals: CandleInterval[];
  priceDecimals: number;
  quantityDecimals: number;
}

export type { CandleInterval };
