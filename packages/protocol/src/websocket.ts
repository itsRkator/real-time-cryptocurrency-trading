import type { CandleInterval, Channel, DeliveryTier, TierOverride, TradeSide, BookSide } from './market.js';
import type { Candle } from './market.js';
import { PROTOCOL_VERSION } from './constants.js';

export type { CandleInterval, Channel, DeliveryTier, TierOverride };

export interface SubscribeMessage {
  type: 'subscribe';
  protocolVersion: typeof PROTOCOL_VERSION;
  symbol: 'BTC-USD-SIM';
  interval: CandleInterval;
  channels: Channel[];
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  protocolVersion: typeof PROTOCOL_VERSION;
  channels?: Channel[];
}

export interface PingMessage {
  type: 'ping';
  protocolVersion: typeof PROTOCOL_VERSION;
  nonce: string;
}

export interface NetworkReportMessage {
  type: 'network_report';
  protocolVersion: typeof PROTOCOL_VERSION;
  latencyMs: number;
  jitterMs: number;
  sampleCount: number;
}

export interface TierOverrideMessage {
  type: 'tier_override';
  protocolVersion: typeof PROTOCOL_VERSION;
  tier: TierOverride;
}

export type ClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | PingMessage
  | NetworkReportMessage
  | TierOverrideMessage;

export interface WelcomeMessage {
  type: 'welcome';
  protocolVersion: typeof PROTOCOL_VERSION;
  connectionId: string;
  symbol: 'BTC-USD-SIM';
  serverTimeMs: number;
}

export interface PongMessage {
  type: 'pong';
  protocolVersion: typeof PROTOCOL_VERSION;
  nonce: string;
}

export interface TradeMessage {
  type: 'trade';
  protocolVersion: typeof PROTOCOL_VERSION;
  id: string;
  symbol: 'BTC-USD-SIM';
  timestampMs: number;
  price: string;
  quantity: string;
  side: TradeSide;
}

export interface BookDeltaMessage {
  type: 'book_delta';
  protocolVersion: typeof PROTOCOL_VERSION;
  symbol: 'BTC-USD-SIM';
  seq: string;
  timestampMs: number;
  changes: Array<{
    side: BookSide;
    price: string;
    quantity: string;
  }>;
}

export interface CandleMessage {
  type: 'candle';
  protocolVersion: typeof PROTOCOL_VERSION;
  symbol: 'BTC-USD-SIM';
  interval: CandleInterval;
  candle: Candle;
}

export interface TierStatusMessage {
  type: 'tier_status';
  protocolVersion: typeof PROTOCOL_VERSION;
  tier: DeliveryTier;
  overrideActive: boolean;
  overrideTier: DeliveryTier | null;
  targetHz: number;
  minDeliveryIntervalMs: number;
}

export interface SubscriptionAckMessage {
  type: 'subscription_ack';
  protocolVersion: typeof PROTOCOL_VERSION;
  symbol: 'BTC-USD-SIM';
  interval: CandleInterval;
  channels: Channel[];
}

export interface ErrorMessage {
  type: 'error';
  protocolVersion: typeof PROTOCOL_VERSION;
  code: string;
  message: string;
}

export type ServerMessage =
  | WelcomeMessage
  | PongMessage
  | TradeMessage
  | BookDeltaMessage
  | CandleMessage
  | TierStatusMessage
  | SubscriptionAckMessage
  | ErrorMessage;
