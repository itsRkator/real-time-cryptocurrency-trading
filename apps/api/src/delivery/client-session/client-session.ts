import {
  PROTOCOL_VERSION,
  SYMBOL,
  type Candle,
  type CandleInterval,
  type Channel,
  type DeliveryTier,
  type ServerMessage,
  type TierOverride,
  type Trade,
} from '@crypto/protocol';
import type { WebSocket } from 'ws';
import type { BookDeltaEvent } from '../../market/order-book/order-book-engine.js';
import {
  createInitialTierState,
  getEffectiveTier,
  getTierDeliveryIntervalMs,
  getTierTargetHz,
  handleMissingReports,
  handleNetworkReport,
  setOverride,
  type TierControllerState,
} from '../tier-controller/tier-controller.js';

export interface ClientSession {
  connectionId: string;
  socket: WebSocket;
  selectedInterval: CandleInterval;
  subscriptions: Set<Channel>;
  tierState: TierControllerState;
  lastCandleSentAt: number;
  pendingCandle: Candle | null;
  closed: boolean;
  deliveryTimer: NodeJS.Timeout | null;
}

export function createClientSession(
  connectionId: string,
  socket: WebSocket,
): ClientSession {
  return {
    connectionId,
    socket,
    selectedInterval: '1m',
    subscriptions: new Set(),
    tierState: createInitialTierState(),
    lastCandleSentAt: 0,
    pendingCandle: null,
    closed: false,
    deliveryTimer: null,
  };
}

export function sendJson(session: ClientSession, message: ServerMessage): void {
  if (session.closed || session.socket.readyState !== session.socket.OPEN) {
    return;
  }
  session.socket.send(JSON.stringify(message));
}

export function sendWelcome(session: ClientSession): void {
  sendJson(session, {
    type: 'welcome',
    protocolVersion: PROTOCOL_VERSION,
    connectionId: session.connectionId,
    symbol: SYMBOL,
    serverTimeMs: Date.now(),
  });
  sendTierStatus(session);
}

export function sendTierStatus(session: ClientSession): void {
  const tier = getEffectiveTier(session.tierState);
  sendJson(session, {
    type: 'tier_status',
    protocolVersion: PROTOCOL_VERSION,
    tier,
    overrideActive: session.tierState.overrideTier !== null,
    overrideTier: session.tierState.overrideTier,
    targetHz: getTierTargetHz(tier),
    minDeliveryIntervalMs: getTierDeliveryIntervalMs(tier),
  });
}

export function applyTierOverride(session: ClientSession, tier: TierOverride): void {
  const before = getEffectiveTier(session.tierState);
  session.tierState = setOverride(session.tierState, tier);
  const after = getEffectiveTier(session.tierState);
  sendTierStatus(session);
  if (before !== after) {
    flushCandleIfDue(session, Date.now(), true);
  }
}

export function applyNetworkReport(
  session: ClientSession,
  latencyMs: number,
  jitterMs: number,
  atMs: number,
): void {
  const before = getEffectiveTier(session.tierState);
  session.tierState = handleNetworkReport(session.tierState, {
    latencyMs,
    jitterMs,
    atMs,
  });
  const after = getEffectiveTier(session.tierState);
  if (before !== after) {
    sendTierStatus(session);
  }
}

export function checkMissingReports(session: ClientSession, nowMs: number): void {
  const before = getEffectiveTier(session.tierState);
  session.tierState = handleMissingReports(session.tierState, nowMs);
  const after = getEffectiveTier(session.tierState);
  if (before !== after) {
    sendTierStatus(session);
  }
}

export function subscribe(
  session: ClientSession,
  interval: CandleInterval,
  channels: Channel[],
): void {
  session.selectedInterval = interval;
  session.subscriptions = new Set(channels);
  sendJson(session, {
    type: 'subscription_ack',
    protocolVersion: PROTOCOL_VERSION,
    symbol: SYMBOL,
    interval,
    channels: [...session.subscriptions],
  });
}

export function publishTrade(session: ClientSession, trade: Trade): void {
  if (!session.subscriptions.has('trades')) {
    return;
  }
  sendJson(session, {
    type: 'trade',
    protocolVersion: PROTOCOL_VERSION,
    id: trade.id,
    symbol: SYMBOL,
    timestampMs: trade.timestampMs,
    price: trade.price,
    quantity: trade.quantity,
    side: trade.side,
  });
}

export function publishBookDelta(session: ClientSession, delta: BookDeltaEvent): void {
  if (!session.subscriptions.has('book')) {
    return;
  }
  sendJson(session, {
    type: 'book_delta',
    protocolVersion: PROTOCOL_VERSION,
    symbol: SYMBOL,
    seq: delta.seq.toString(),
    timestampMs: delta.timestampMs,
    changes: delta.changes,
  });
}

/**
 * Coalesce candle updates per client tier.
 * Authoritative candle is always stored; delivery cadence is throttled.
 */
export function noteCandleUpdate(
  session: ClientSession,
  interval: CandleInterval,
  candle: Candle,
  nowMs: number,
): void {
  if (!session.subscriptions.has('candle')) {
    return;
  }
  if (interval !== session.selectedInterval) {
    return;
  }
  session.pendingCandle = candle;
  flushCandleIfDue(session, nowMs, false);
}

function flushCandleIfDue(
  session: ClientSession,
  nowMs: number,
  force: boolean,
): void {
  if (!session.pendingCandle) {
    return;
  }
  const tier = getEffectiveTier(session.tierState);
  const minInterval = getTierDeliveryIntervalMs(tier);
  const elapsed = nowMs - session.lastCandleSentAt;

  if (!force && session.lastCandleSentAt > 0 && elapsed < minInterval) {
    scheduleDelivery(session, minInterval - elapsed);
    return;
  }

  deliverPendingCandle(session, nowMs);
}

function scheduleDelivery(session: ClientSession, delayMs: number): void {
  if (session.deliveryTimer) {
    return;
  }
  session.deliveryTimer = setTimeout(() => {
    session.deliveryTimer = null;
    flushCandleIfDue(session, Date.now(), false);
  }, delayMs);
}

function deliverPendingCandle(session: ClientSession, nowMs: number): void {
  if (!session.pendingCandle || !session.subscriptions.has('candle')) {
    return;
  }
  sendJson(session, {
    type: 'candle',
    protocolVersion: PROTOCOL_VERSION,
    symbol: SYMBOL,
    interval: session.selectedInterval,
    candle: session.pendingCandle,
  });
  session.lastCandleSentAt = nowMs;
  session.pendingCandle = null;
  if (session.deliveryTimer) {
    clearTimeout(session.deliveryTimer);
    session.deliveryTimer = null;
  }
}

export function closeSession(session: ClientSession): void {
  session.closed = true;
  if (session.deliveryTimer) {
    clearTimeout(session.deliveryTimer);
    session.deliveryTimer = null;
  }
}

export function effectiveTierOf(session: ClientSession): DeliveryTier {
  return getEffectiveTier(session.tierState);
}
