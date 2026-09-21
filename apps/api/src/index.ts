import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createServer } from './server.js';

for (const candidate of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'apps/api/.env'),
  resolve(import.meta.dirname, '../.env'),
]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate });
    break;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const server = createServer(config, logger);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await server.start();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
