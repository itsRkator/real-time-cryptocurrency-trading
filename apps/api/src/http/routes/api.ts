import {
  candlesQuerySchema,
  orderBookQuerySchema,
  PROTOCOL_VERSION,
  type ApiErrorBody,
} from '@crypto/protocol';
import { Router, type Request, type Response } from 'express';
import type { MarketEngine } from '../../market/generator/market-engine.js';

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  const body: ApiErrorBody = { error: { code, message } };
  res.status(status).json(body);
}

export function createApiRouter(market: MarketEngine): Router {
  const router = Router();

  router.get('/market', (_req, res) => {
    res.json(market.getMetadata());
  });

  router.get('/orderbook', (req: Request, res: Response) => {
    const parsed = orderBookQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, 400, 'INVALID_SYMBOL', 'Unsupported or missing symbol');
      return;
    }
    res.json(market.getOrderBookSnapshot());
  });

  router.get('/candles', (req: Request, res: Response) => {
    const parsed = candlesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path[0];
      if (path === 'interval') {
        sendError(res, 400, 'INVALID_INTERVAL', 'Unsupported candle interval');
        return;
      }
      if (path === 'symbol') {
        sendError(res, 400, 'INVALID_SYMBOL', 'Unsupported or missing symbol');
        return;
      }
      if (path === 'limit') {
        sendError(res, 400, 'INVALID_LIMIT', 'Invalid candle limit');
        return;
      }
      sendError(res, 400, 'INVALID_QUERY', 'Invalid candles query');
      return;
    }

    const { interval, limit } = parsed.data;
    const candles = market.getCandles(interval, limit);
    res.json({
      symbol: 'BTC-USD-SIM' as const,
      interval,
      candles,
    });
  });

  return router;
}

export function createHealthHandler(market: MarketEngine, startedAt: number) {
  return (_req: Request, res: Response) => {
    res.json({
      status: 'ok' as const,
      uptimeMs: Date.now() - startedAt,
      protocolVersion: PROTOCOL_VERSION,
      marketRunning: market.isRunning(),
    });
  };
}
