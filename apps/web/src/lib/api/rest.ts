import {
  orderBookSnapshotSchema,
  SYMBOL,
  type Candle,
  type CandleInterval,
  type OrderBookSnapshot,
} from '@crypto/protocol';
import { z } from 'zod';
import { getPublicEnv } from './env';

const candlesResponseSchema = z.object({
  symbol: z.literal(SYMBOL),
  interval: z.string(),
  candles: z.array(
    z.object({
      openTimeMs: z.number(),
      closeTimeMs: z.number(),
      open: z.string(),
      high: z.string(),
      low: z.string(),
      close: z.string(),
      volume: z.string(),
      complete: z.boolean(),
    }),
  ),
});

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiError('INVALID_JSON', 'Response was not JSON', response.status);
  }
}

export async function fetchOrderBookSnapshot(
  signal?: AbortSignal,
): Promise<OrderBookSnapshot> {
  const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
  const url = new URL('/api/v1/orderbook', NEXT_PUBLIC_API_BASE_URL);
  url.searchParams.set('symbol', SYMBOL);
  const response = await fetch(url, { signal, cache: 'no-store' });
  const body = await parseJson(response);
  if (!response.ok) {
    const err = body as { error?: { code?: string; message?: string } };
    throw new ApiError(
      err.error?.code ?? 'HTTP_ERROR',
      err.error?.message ?? `Order book request failed (${response.status})`,
      response.status,
    );
  }
  return orderBookSnapshotSchema.parse(body);
}

export async function fetchCandles(
  interval: CandleInterval,
  limit = 300,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
  const url = new URL('/api/v1/candles', NEXT_PUBLIC_API_BASE_URL);
  url.searchParams.set('symbol', SYMBOL);
  url.searchParams.set('interval', interval);
  url.searchParams.set('limit', String(limit));
  const response = await fetch(url, { signal, cache: 'no-store' });
  const body = await parseJson(response);
  if (!response.ok) {
    const err = body as { error?: { code?: string; message?: string } };
    throw new ApiError(
      err.error?.code ?? 'HTTP_ERROR',
      err.error?.message ?? `Candles request failed (${response.status})`,
      response.status,
    );
  }
  const parsed = candlesResponseSchema.parse(body);
  return parsed.candles;
}
