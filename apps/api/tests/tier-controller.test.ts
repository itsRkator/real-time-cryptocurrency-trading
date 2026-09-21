import { describe, expect, it } from 'vitest';
import {
  createInitialTierState,
  handleMissingReports,
  handleNetworkReport,
  setOverride,
} from '../src/delivery/tier-controller/tier-controller.js';

describe('tier controller hysteresis', () => {
  it('starts new connections in degraded', () => {
    const state = createInitialTierState(0);
    expect(state.automaticTier).toBe('degraded');
    expect(state.effectiveTier).toBe('degraded');
    expect(state.overrideTier).toBeNull();
  });

  it('does not demote on a single poor report', () => {
    let state = createInitialTierState(0);
    state = setOverride(state, 'full');
    state = setOverride(state, 'auto');
    // Force automatic to full via healthy reports first.
    state = { ...state, automaticTier: 'full', effectiveTier: 'full' };

    state = handleNetworkReport(state, { latencyMs: 200, jitterMs: 10, atMs: 1 });
    expect(state.automaticTier).toBe('full');
    expect(state.consecutivePoor).toBe(1);
  });

  it('demotes full → degraded after 3 consecutive poor reports', () => {
    let state = {
      ...createInitialTierState(0),
      automaticTier: 'full' as const,
      effectiveTier: 'full' as const,
    };

    for (let i = 0; i < 3; i += 1) {
      state = handleNetworkReport(state, {
        latencyMs: 200,
        jitterMs: 10,
        atMs: i + 1,
      });
    }
    expect(state.automaticTier).toBe('degraded');
    expect(state.effectiveTier).toBe('degraded');
  });

  it('promotes degraded → full after 5 consecutive healthy reports', () => {
    let state = createInitialTierState(0);
    for (let i = 0; i < 5; i += 1) {
      state = handleNetworkReport(state, {
        latencyMs: 50,
        jitterMs: 5,
        atMs: i + 1,
      });
    }
    expect(state.automaticTier).toBe('full');
  });

  it('moves degraded → minimal after 3 very-poor reports', () => {
    let state = createInitialTierState(0);
    for (let i = 0; i < 3; i += 1) {
      state = handleNetworkReport(state, {
        latencyMs: 400,
        jitterMs: 10,
        atMs: i + 1,
      });
    }
    expect(state.automaticTier).toBe('minimal');
  });

  it('requires 5 recovered reports to leave minimal', () => {
    let state = {
      ...createInitialTierState(0),
      automaticTier: 'minimal' as const,
      effectiveTier: 'minimal' as const,
    };

    for (let i = 0; i < 4; i += 1) {
      state = handleNetworkReport(state, {
        latencyMs: 100,
        jitterMs: 10,
        atMs: i + 1,
      });
    }
    expect(state.automaticTier).toBe('minimal');

    state = handleNetworkReport(state, {
      latencyMs: 100,
      jitterMs: 10,
      atMs: 5,
    });
    expect(state.automaticTier).toBe('degraded');
  });

  it('override suppresses automatic effective-tier changes', () => {
    let state = createInitialTierState(0);
    state = setOverride(state, 'full');
    expect(state.effectiveTier).toBe('full');

    for (let i = 0; i < 5; i += 1) {
      state = handleNetworkReport(state, {
        latencyMs: 500,
        jitterMs: 200,
        atMs: i + 1,
      });
    }
    expect(state.effectiveTier).toBe('full');
    expect(state.overrideTier).toBe('full');
  });

  it('returning to auto restores automatic behavior', () => {
    let state = createInitialTierState(0);
    state = setOverride(state, 'minimal');
    expect(state.effectiveTier).toBe('minimal');
    state = setOverride(state, 'auto');
    expect(state.overrideTier).toBeNull();
    expect(state.effectiveTier).toBe(state.automaticTier);
  });

  it('missing reports fall back to degraded then minimal', () => {
    let state = {
      ...createInitialTierState(0),
      automaticTier: 'full' as const,
      effectiveTier: 'full' as const,
      lastNetworkReportAt: 1_000,
    };

    state = handleMissingReports(state, 1_000 + 10_000);
    expect(state.automaticTier).toBe('degraded');

    state = handleMissingReports(state, 1_000 + 20_000);
    expect(state.automaticTier).toBe('minimal');
  });
});
