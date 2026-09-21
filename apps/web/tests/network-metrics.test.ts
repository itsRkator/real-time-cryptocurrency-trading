import { describe, expect, it } from 'vitest';
import {
  createNetworkMetricsState,
  observeRtt,
} from '../src/lib/websocket/network-metrics';

describe('network metrics', () => {
  it('initializes latency EWMA from the first RTT and jitter from first variation', () => {
    let state = createNetworkMetricsState();
    state = observeRtt(state, 100);
    expect(state.latencyEwmaMs).toBe(100);
    expect(state.jitterEwmaMs).toBeNull();

    state = observeRtt(state, 120);
    expect(state.latencyEwmaMs).toBeCloseTo(0.2 * 120 + 0.8 * 100);
    expect(state.jitterEwmaMs).toBe(20);
  });
});
