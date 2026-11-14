// Every setting of the API comes from environment variables (see .env.example). No secret has a default.
import { z } from 'zod';

const bool = z.enum(['0', '1', 'true', 'false', '']).optional().transform((v) => v === '1' || v === 'true');

const Env = z.object({
  // development: local work. test: automated tests. staging: demo data and demo helpers. production: real users.
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // postgres://user:pass@host:5432/db. Empty = an embedded database (dev and tests only).
  DATABASE_URL: z.string().default(''),
  REDIS_URL: z.string().default(''),
  // Where the website is served from, for CORS (comma separated). The Capacitor app origins are always allowed.
  WEB_ORIGIN: z.string().default(''),
  // The public address of this API, used to build media links (e.g. https://api.example.com).
  PUBLIC_URL: z.string().default(''),
  // Signs reset codes and private media links. Required outside development and tests.
  TOKEN_SECRET: z.string().default(''),
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  // The state (admin) account, created on first start. The password is stored hashed only.
  ADMIN_PHONE: z.string().default('+9647713111325'),
  ADMIN_PASSWORD: z.string().default(''),
  ADMIN_EMAIL: z.string().default(''),
  ADMIN_NAME: z.string().default('Trip guide team'),
  // Demo data on first start (staging). Production starts with only the state account and the governorates.
  SEED_DEMO: bool,
  // Media: "disk" (a folder, for development) or "s3" (any S3-compatible storage).
  MEDIA_DRIVER: z.enum(['disk', 's3', 'memory']).default('disk'),
  MEDIA_DIR: z.string().default('data/media'),
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default(''),
  S3_PRIVATE_BUCKET: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_PUBLIC_URL: z.string().default(''),
  S3_FORCE_PATH_STYLE: bool,
  // SMS: "log" writes the code to the server log (development, tests). A real provider is added when chosen.
  SMS_PROVIDER: z.enum(['log']).default('log'),
  // Payments: "simulated" behaves exactly like the demo.
  PAYMENT_PROVIDER: z.enum(['simulated', 'provider']).default('simulated'),
  // Rate limits can be switched off for load tests.
  RATE_LIMIT: z.enum(['on', 'off']).default('on'),
  TRUST_PROXY: bool,
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof Env> & { isProduction: boolean; demoHelpers: boolean; allowedOrigins: string[] };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const c = Env.parse(env);
  const isProduction = c.APP_ENV === 'production';
  if ((isProduction || c.APP_ENV === 'staging') && c.TOKEN_SECRET.length < 32) throw new Error('TOKEN_SECRET must be set to a random string of at least 32 characters.');
  if (isProduction && !/^postgres(ql)?:\/\//.test(c.DATABASE_URL)) throw new Error('DATABASE_URL must point at PostgreSQL in production.');
  if (isProduction && c.SEED_DEMO) throw new Error('SEED_DEMO cannot be used in production.');
  const allowedOrigins = [...c.WEB_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean), 'capacitor://localhost', 'https://localhost', 'http://localhost'];
  // Development without a database address: an embedded PostgreSQL kept in ./data/pg. Tests keep theirs in memory.
  if (!c.DATABASE_URL) c.DATABASE_URL = c.APP_ENV === 'development' ? 'data/pg' : 'memory';
  return { ...c, TOKEN_SECRET: c.TOKEN_SECRET || 'dev-only-secret-not-for-real-use', isProduction, demoHelpers: !isProduction, allowedOrigins };
}
