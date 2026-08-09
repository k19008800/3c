import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/threecloud_v3'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8).default('dev-secret-change-in-production'),
  PORT: z.coerce.number().default(3030),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CIRCUIT_BREAKER_WINDOW_MS: z.coerce.number().default(300000),
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().default(0.3),
  CIRCUIT_BREAKER_MIN_SAMPLES: z.coerce.number().default(10),
  CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().default(60000),
  RATE_LIMIT_DEFAULT_RPM: z.coerce.number().default(60),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().default(3600),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(overrides?: Record<string, string>): Env {
  const raw = { ...process.env, ...overrides };
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten());
    process.exit(1);
  }
  return result.data;
}
