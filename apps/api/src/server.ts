import http from 'node:http';
import cors from 'cors';
import express from 'express';
import type { AppConfig } from './config/env.js';
import type { Logger } from './config/logger.js';
import { MarketEngine } from './market/generator/market-engine.js';
import { createApiRouter, createHealthHandler } from './http/routes/api.js';
import { WsHub } from './websocket/ws-hub.js';

export interface AppServer {
  httpServer: http.Server;
  market: MarketEngine;
  wsHub: WsHub;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createServer(config: AppConfig, logger: Logger): AppServer {
  const startedAt = Date.now();
  const market = new MarketEngine(config.MARKET_SEED);
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', createHealthHandler(market, startedAt));
  app.use('/api/v1', createApiRouter(market));

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error({ err }, 'Unhandled request error');
      const message =
        config.NODE_ENV === 'production'
          ? 'Internal server error'
          : err instanceof Error
            ? err.message
            : 'Internal server error';
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message },
      });
    },
  );

  const httpServer = http.createServer(app);
  const wsHub = new WsHub(httpServer, market, config, logger);

  return {
    httpServer,
    market,
    wsHub,
    async start() {
      market.start();
      logger.info({ seed: config.MARKET_SEED }, 'Market started');
      await new Promise<void>((resolve, reject) => {
        httpServer.listen(config.PORT, config.HOST, () => {
          logger.info(
            {
              host: config.HOST,
              port: config.PORT,
              cors: config.CORS_ORIGINS,
            },
            'API server listening',
          );
          resolve();
        });
        httpServer.once('error', reject);
      });
    },
    async stop() {
      logger.info('Shutting down API server');
      market.stop();
      wsHub.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      logger.info('API server stopped');
    },
  };
}
