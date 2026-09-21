import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_WS_URL: z.string().default('ws://localhost:4000/ws'),
});

export type PublicEnv = z.infer<typeof envSchema>;

let cached: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (cached) {
    return cached;
  }
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid public environment: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  cached = parsed.data;
  return cached;
}
