import {
  PING_INTERVAL_MS,
  PING_TIMEOUT_MS,
  PROTOCOL_VERSION,
  SYMBOL,
  serverMessageSchema,
  type CandleInterval,
  type Channel,
  type ClientMessage,
  type ServerMessage,
  type TierOverride,
} from '@crypto/protocol';
import { getPublicEnv } from '../api/env';
import {
  createNetworkMetricsState,
  observeRtt,
  type NetworkMetricsState,
} from './network-metrics';

export type ConnectionStatus =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'stale'
  | 'offline'
  | 'error';

type MessageHandler = (message: ServerMessage) => void;
type StatusHandler = (status: ConnectionStatus) => void;
type MetricsHandler = (metrics: NetworkMetricsState) => void;

const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000, 10_000];

export interface MarketSocketOptions {
  onMessage: MessageHandler;
  onStatus: StatusHandler;
  onMetrics: MetricsHandler;
  onLog?: (message: string) => void;
}

export class MarketSocket {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'offline';
  private intentionallyClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingPings = new Map<string, number>();
  private metrics = createNetworkMetricsState();
  private subscription: {
    interval: CandleInterval;
    channels: Channel[];
  } | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor(private readonly options: MarketSocketOptions) {}

  getStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    this.intentionallyClosed = false;
    this.clearReconnectTimer();
    this.openSocket();
    this.bindBrowserNetworkEvents();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.clearReconnectTimer();
    this.stopPingLoop();
    this.unbindBrowserNetworkEvents();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('offline');
  }

  /** Debug helper: close socket and allow automatic reconnect. */
  debugDisconnect(): void {
    this.intentionallyClosed = false;
    this.setStatus('stale');
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.scheduleReconnect();
  }

  subscribe(interval: CandleInterval, channels: Channel[]): void {
    this.subscription = { interval, channels };
    this.send({
      type: 'subscribe',
      protocolVersion: PROTOCOL_VERSION,
      symbol: SYMBOL,
      interval,
      channels,
    });
  }

  setTierOverride(tier: TierOverride): void {
    this.send({
      type: 'tier_override',
      protocolVersion: PROTOCOL_VERSION,
      tier,
    });
  }

  private openSocket(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Socket may already be closing.
      }
      this.socket = null;
    }

    const { NEXT_PUBLIC_WS_URL } = getPublicEnv();
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    const socket = new WebSocket(NEXT_PUBLIC_WS_URL);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return;
      }
      this.reconnectAttempt = 0;
      this.pendingPings.clear();
      this.setStatus('live');
      this.startPingLoop();
      if (this.subscription) {
        this.subscribe(this.subscription.interval, this.subscription.channels);
      }
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.handleRawMessage(event.data);
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.stopPingLoop();
      if (this.intentionallyClosed) {
        this.setStatus('offline');
        return;
      }
      this.setStatus('stale');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      this.options.onLog?.('WebSocket error event');
      if (!this.intentionallyClosed) {
        this.setStatus('error');
      }
    });
  }

  private handleRawMessage(data: unknown): void {
    let text: string;
    if (typeof data === 'string') {
      text = data;
    } else {
      this.options.onLog?.('Ignoring non-text WebSocket frame');
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      this.options.onLog?.('Malformed WebSocket JSON ignored');
      return;
    }

    const parsed = serverMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.options.onLog?.('Malformed WebSocket message ignored');
      return;
    }

    const message = parsed.data;
    if (message.type === 'pong') {
      this.handlePong(message.nonce);
      return;
    }

    this.options.onMessage(message);
  }

  private handlePong(nonce: string): void {
    const sentAt = this.pendingPings.get(nonce);
    if (sentAt === undefined) {
      return;
    }
    this.pendingPings.delete(nonce);
    const rttMs = performance.now() - sentAt;
    this.metrics = observeRtt(this.metrics, rttMs);
    this.options.onMetrics(this.metrics);

    if (
      this.metrics.latencyEwmaMs !== null &&
      this.metrics.sampleCount > 0
    ) {
      this.send({
        type: 'network_report',
        protocolVersion: PROTOCOL_VERSION,
        latencyMs: this.metrics.latencyEwmaMs,
        jitterMs: this.metrics.jitterEwmaMs ?? 0,
        sampleCount: this.metrics.sampleCount,
      });
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, PING_INTERVAL_MS);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.pendingPings.clear();
  }

  private sendPing(): void {
    const now = performance.now();
    // Expire old pending pings.
    for (const [nonce, sentAt] of this.pendingPings) {
      if (now - sentAt > PING_TIMEOUT_MS) {
        this.pendingPings.delete(nonce);
      }
    }
    if (this.pendingPings.size > 20) {
      this.pendingPings.clear();
    }

    const nonce = `${now}-${Math.random().toString(36).slice(2, 10)}`;
    this.pendingPings.set(nonce, now);
    this.send({
      type: 'ping',
      protocolVersion: PROTOCOL_VERSION,
      nonce,
    });
  }

  private send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || this.reconnectTimer) {
      return;
    }
    const delay =
      BACKOFF_MS[Math.min(this.reconnectAttempt, BACKOFF_MS.length - 1)] ??
      10_000;
    const jitter = Math.floor(Math.random() * 200);
    this.reconnectAttempt += 1;
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay + jitter);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.options.onStatus(status);
  }

  private bindBrowserNetworkEvents(): void {
    if (typeof window === 'undefined') {
      return;
    }
    this.unbindBrowserNetworkEvents();
    this.onlineHandler = () => {
      if (!this.socket && !this.intentionallyClosed) {
        this.reconnectAttempt = 0;
        this.openSocket();
      }
    };
    this.offlineHandler = () => {
      this.setStatus('offline');
    };
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  private unbindBrowserNetworkEvents(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
    if (this.offlineHandler) {
      window.removeEventListener('offline', this.offlineHandler);
      this.offlineHandler = null;
    }
  }
}
