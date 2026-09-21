import { NETWORK_REPORT_ALPHA } from '@crypto/protocol';

export interface NetworkMetricsState {
  latencyEwmaMs: number | null;
  jitterEwmaMs: number | null;
  previousRttMs: number | null;
  sampleCount: number;
}

export function createNetworkMetricsState(): NetworkMetricsState {
  return {
    latencyEwmaMs: null,
    jitterEwmaMs: null,
    previousRttMs: null,
    sampleCount: 0,
  };
}

/**
 * latencyEWMA = alpha * RTT + (1 - alpha) * previous
 * First sample initializes latencyEWMA = RTT.
 *
 * jitterEWMA = alpha * |RTT_n - RTT_n-1| + (1 - alpha) * previous
 * First variation initializes jitterEWMA.
 */
export function observeRtt(
  state: NetworkMetricsState,
  rttMs: number,
  alpha = NETWORK_REPORT_ALPHA,
): NetworkMetricsState {
  const latencyEwmaMs =
    state.latencyEwmaMs === null
      ? rttMs
      : alpha * rttMs + (1 - alpha) * state.latencyEwmaMs;

  let jitterEwmaMs = state.jitterEwmaMs;
  if (state.previousRttMs !== null) {
    const variation = Math.abs(rttMs - state.previousRttMs);
    jitterEwmaMs =
      jitterEwmaMs === null
        ? variation
        : alpha * variation + (1 - alpha) * jitterEwmaMs;
  }

  return {
    latencyEwmaMs,
    jitterEwmaMs,
    previousRttMs: rttMs,
    sampleCount: state.sampleCount + 1,
  };
}
