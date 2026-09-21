import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import {
  clientMessageSchema,
  PROTOCOL_VERSION,
  type Candle,
  type CandleInterval,
  type ClientMessage,
  type Trade,
} from '@crypto/protocol';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type { MarketEngine } from '../market/generator/market-engine.js';
import type { BookDeltaEvent } from '../market/order-book/order-book-engine.js';
import {
  applyNetworkReport,
  applyTierOverride,
  checkMissingReports,
  closeSession,
  createClientSession,
  noteCandleUpdate,
  publishBookDelta,
  publishTrade,
  sendJson,
  sendWelcome,
  subscribe,
  type ClientSession,
} from '../delivery/client-session/client-session.js';

const MAX_PAYLOAD_BYTES = 64 * 1024;

export class WsHub {
  private readonly wss: WebSocketServer;
  private readonly sessions = new Map<string, ClientSession>();
  private readonly unsubscribeMarket: () => void;
  private missingReportTimer: NodeJS.Timeout | null = null;

  constructor(
    httpServer: HttpServer,
    private readonly market: MarketEngine,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      maxPayload: MAX_PAYLOAD_BYTES,
      verifyClient: (info, done) => {
        const origin = info.origin;
        if (!origin) {
          // Some non-browser clients omit Origin; allow in development.
          if (this.config.NODE_ENV === 'production') {
            done(false, 403, 'Origin required');
            return;
          }
          done(true);
          return;
        }
        if (this.config.CORS_ORIGINS.includes(origin)) {
          done(true);
          return;
        }
        this.logger.warn({ origin }, 'Rejected WebSocket origin');
        done(false, 403, 'Origin not allowed');
      },
    });

    this.wss.on('connection', (socket, req) => {
      this.handleConnection(socket, req.socket.remoteAddress);
    });

    this.unsubscribeMarket = this.market.onTrade((trade, bookDelta, candles) => {
      this.broadcastMarket(trade, bookDelta, candles);
    });

    this.missingReportTimer = setInterval(() => {
      const now = Date.now();
      for (const session of this.sessions.values()) {
        checkMissingReports(session, now);
      }
    }, 1_000);
    this.missingReportTimer.unref?.();
  }

  clientCount(): number {
    return this.sessions.size;
  }

  close(): void {
    this.unsubscribeMarket();
    if (this.missingReportTimer) {
      clearInterval(this.missingReportTimer);
      this.missingReportTimer = null;
    }
    for (const session of this.sessions.values()) {
      closeSession(session);
      try {
        session.socket.close();
      } catch (error) {
        this.logger.warn({ err: error }, 'Error closing client socket');
      }
    }
    this.sessions.clear();
    this.wss.close();
  }

  private handleConnection(socket: WebSocket, remoteAddress?: string): void {
    const connectionId = randomUUID();
    const session = createClientSession(connectionId, socket);
    this.sessions.set(connectionId, session);
    this.logger.info({ connectionId, remoteAddress }, 'WebSocket connected');
    sendWelcome(session);

    socket.on('message', (raw) => {
      this.handleMessage(session, raw);
    });

    socket.on('close', () => {
      closeSession(session);
      this.sessions.delete(connectionId);
      this.logger.info({ connectionId }, 'WebSocket disconnected');
    });

    socket.on('error', (error) => {
      this.logger.warn({ connectionId, err: error }, 'WebSocket error');
    });
  }

  private handleMessage(session: ClientSession, raw: RawData): void {
    let text: string;
    try {
      text = typeof raw === 'string' ? raw : raw.toString('utf8');
    } catch {
      sendJson(session, {
        type: 'error',
        protocolVersion: PROTOCOL_VERSION,
        code: 'INVALID_PAYLOAD',
        message: 'Unable to decode message',
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      sendJson(session, {
        type: 'error',
        protocolVersion: PROTOCOL_VERSION,
        code: 'INVALID_JSON',
        message: 'Message is not valid JSON',
      });
      return;
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.debug(
        { connectionId: session.connectionId, issues: result.error.issues },
        'Malformed client message',
      );
      sendJson(session, {
        type: 'error',
        protocolVersion: PROTOCOL_VERSION,
        code: 'INVALID_MESSAGE',
        message: 'Message failed validation',
      });
      return;
    }

    this.dispatch(session, result.data);
  }

  private dispatch(session: ClientSession, message: ClientMessage): void {
    switch (message.type) {
      case 'ping':
        sendJson(session, {
          type: 'pong',
          protocolVersion: PROTOCOL_VERSION,
          nonce: message.nonce,
        });
        break;
      case 'subscribe':
        subscribe(session, message.interval, message.channels);
        break;
      case 'unsubscribe':
        if (message.channels) {
          for (const channel of message.channels) {
            session.subscriptions.delete(channel);
          }
        } else {
          session.subscriptions.clear();
        }
        break;
      case 'network_report':
        applyNetworkReport(
          session,
          message.latencyMs,
          message.jitterMs,
          Date.now(),
        );
        break;
      case 'tier_override':
        this.logger.info(
          { connectionId: session.connectionId, tier: message.tier },
          'Tier override change',
        );
        applyTierOverride(session, message.tier);
        break;
      default: {
        const _exhaustive: never = message;
        void _exhaustive;
      }
    }
  }

  private broadcastMarket(
    trade: Trade,
    bookDelta: BookDeltaEvent,
    candles: Map<CandleInterval, Candle>,
  ): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      publishTrade(session, trade);
      publishBookDelta(session, bookDelta);
      const candle = candles.get(session.selectedInterval);
      if (candle) {
        noteCandleUpdate(session, session.selectedInterval, candle, now);
      }
    }
  }
}
