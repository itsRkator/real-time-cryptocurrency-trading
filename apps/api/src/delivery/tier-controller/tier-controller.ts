import {
  HYSTERESIS,
  MISSING_REPORT_DEGRADED_MS,
  MISSING_REPORT_MINIMAL_MS,
  TIER_DELIVERY_INTERVAL_MS,
  TIER_TARGET_HZ,
  type DeliveryTier,
  type TierOverride,
} from '@crypto/protocol';

export interface TierControllerState {
  automaticTier: DeliveryTier;
  overrideTier: DeliveryTier | null;
  effectiveTier: DeliveryTier;
  consecutivePoor: number;
  consecutiveHealthy: number;
  consecutiveVeryPoor: number;
  consecutiveRecovered: number;
  lastNetworkReportAt: number | null;
  reportCount: number;
}

export interface NetworkSample {
  latencyMs: number;
  jitterMs: number;
  atMs: number;
}

function isPoor(latencyMs: number, jitterMs: number): boolean {
  return (
    latencyMs >= HYSTERESIS.fullToDegraded.latencyMs ||
    jitterMs >= HYSTERESIS.fullToDegraded.jitterMs
  );
}

function isHealthy(latencyMs: number, jitterMs: number): boolean {
  return (
    latencyMs <= HYSTERESIS.degradedToFull.latencyMs &&
    jitterMs <= HYSTERESIS.degradedToFull.jitterMs
  );
}

function isVeryPoor(latencyMs: number, jitterMs: number): boolean {
  return (
    latencyMs >= HYSTERESIS.degradedToMinimal.latencyMs ||
    jitterMs >= HYSTERESIS.degradedToMinimal.jitterMs
  );
}

function isRecovered(latencyMs: number, jitterMs: number): boolean {
  return (
    latencyMs <= HYSTERESIS.minimalToDegraded.latencyMs &&
    jitterMs <= HYSTERESIS.minimalToDegraded.jitterMs
  );
}

/** New connections start in degraded — conservative until enough samples arrive. */
export function createInitialTierState(nowMs = Date.now()): TierControllerState {
  return {
    automaticTier: 'degraded',
    overrideTier: null,
    effectiveTier: 'degraded',
    consecutivePoor: 0,
    consecutiveHealthy: 0,
    consecutiveVeryPoor: 0,
    consecutiveRecovered: 0,
    lastNetworkReportAt: null,
    reportCount: 0,
  };
}

export function getEffectiveTier(state: TierControllerState): DeliveryTier {
  return state.overrideTier ?? state.automaticTier;
}

export function getTierDeliveryIntervalMs(tier: DeliveryTier): number {
  return TIER_DELIVERY_INTERVAL_MS[tier];
}

export function getTierTargetHz(tier: DeliveryTier): number {
  return TIER_TARGET_HZ[tier];
}

export function setOverride(
  state: TierControllerState,
  tier: TierOverride,
): TierControllerState {
  if (tier === 'auto') {
    const next = { ...state, overrideTier: null };
    return { ...next, effectiveTier: getEffectiveTier(next) };
  }
  const next = { ...state, overrideTier: tier };
  return { ...next, effectiveTier: getEffectiveTier(next) };
}

export function handleNetworkReport(
  state: TierControllerState,
  sample: NetworkSample,
): TierControllerState {
  let next: TierControllerState = {
    ...state,
    lastNetworkReportAt: sample.atMs,
    reportCount: state.reportCount + 1,
  };

  // Automatic transitions only when override is off.
  if (next.overrideTier !== null) {
    next.effectiveTier = getEffectiveTier(next);
    return next;
  }

  const { latencyMs, jitterMs } = sample;
  let automaticTier = next.automaticTier;
  let consecutivePoor = next.consecutivePoor;
  let consecutiveHealthy = next.consecutiveHealthy;
  let consecutiveVeryPoor = next.consecutiveVeryPoor;
  let consecutiveRecovered = next.consecutiveRecovered;

  if (automaticTier === 'full') {
    if (isPoor(latencyMs, jitterMs)) {
      consecutivePoor += 1;
      consecutiveHealthy = 0;
      if (consecutivePoor >= HYSTERESIS.fullToDegraded.consecutive) {
        automaticTier = 'degraded';
        consecutivePoor = 0;
        consecutiveVeryPoor = 0;
        consecutiveRecovered = 0;
      }
    } else {
      consecutivePoor = 0;
    }
  } else if (automaticTier === 'degraded') {
    if (isVeryPoor(latencyMs, jitterMs)) {
      consecutiveVeryPoor += 1;
      consecutiveHealthy = 0;
      consecutiveRecovered = 0;
      if (consecutiveVeryPoor >= HYSTERESIS.degradedToMinimal.consecutive) {
        automaticTier = 'minimal';
        consecutiveVeryPoor = 0;
        consecutivePoor = 0;
      }
    } else if (isHealthy(latencyMs, jitterMs)) {
      consecutiveHealthy += 1;
      consecutiveVeryPoor = 0;
      consecutivePoor = 0;
      if (consecutiveHealthy >= HYSTERESIS.degradedToFull.consecutive) {
        automaticTier = 'full';
        consecutiveHealthy = 0;
      }
    } else {
      consecutiveHealthy = 0;
      consecutiveVeryPoor = 0;
    }
  } else {
    // minimal
    if (isRecovered(latencyMs, jitterMs)) {
      consecutiveRecovered += 1;
      if (consecutiveRecovered >= HYSTERESIS.minimalToDegraded.consecutive) {
        automaticTier = 'degraded';
        consecutiveRecovered = 0;
        consecutiveHealthy = 0;
        consecutiveVeryPoor = 0;
        consecutivePoor = 0;
      }
    } else {
      consecutiveRecovered = 0;
    }
  }

  next = {
    ...next,
    automaticTier,
    consecutivePoor,
    consecutiveHealthy,
    consecutiveVeryPoor,
    consecutiveRecovered,
  };
  next.effectiveTier = getEffectiveTier(next);
  return next;
}

/**
 * Missing-report fallback:
 * ~10s → no better than degraded
 * ~20s → minimal
 */
export function handleMissingReports(
  state: TierControllerState,
  nowMs: number,
): TierControllerState {
  if (state.overrideTier !== null) {
    return { ...state, effectiveTier: getEffectiveTier(state) };
  }

  if (state.lastNetworkReportAt === null) {
    // Still waiting for first report — stay at initial degraded.
    return state;
  }

  const elapsed = nowMs - state.lastNetworkReportAt;
  let automaticTier = state.automaticTier;

  if (elapsed >= MISSING_REPORT_MINIMAL_MS) {
    automaticTier = 'minimal';
  } else if (elapsed >= MISSING_REPORT_DEGRADED_MS) {
    if (automaticTier === 'full') {
      automaticTier = 'degraded';
    }
  } else {
    return state;
  }

  const next = { ...state, automaticTier };
  next.effectiveTier = getEffectiveTier(next);
  return next;
}
