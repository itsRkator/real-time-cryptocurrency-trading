import { z } from 'zod';
import {
  DEFAULT_MARKET_SEED,
  PROTOCOL_VERSION,
} from '@crypto/protocol';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  MARKET_SEED: z.coerce.number().int().default(DEFAULT_MARKET_SEED),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export type AppConfig = z.infer<typeof envSchema> & {
  protocolVersion: typeof PROTOCOL_VERSION;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    ...parsed.data,
    protocolVersion: PROTOCOL_VERSION,
  };
}
