// The HTTP server: /api (the same contract the app already uses), /media, health checks, and the built web app.
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { openDb, migrate, type OpenDb } from '../db/client';
import { prepareData } from '../db/seed';
import { loadConfig, type Config } from './config';
import { handle, routeCount, type Deps, type Req, type Res } from './kernel';
import { paymentProviderFor, type PaymentProvider } from './payments';
import { logSms, mediaStoreFor, memoryLimiter, redisLimiter, systemClock, type Clock, type MediaStore, type RateLimiter, type SmsSender } from './services';
import { providerFromEnv, type AiProvider } from '../server/ai';
import { createAssistantHandler, RateLimiter as AssistantLimiter } from '../server/assistant';
import { mockProvider } from '../server/mock-ai';
import './routes/account';
import './routes/marketplace';

const MAX_BODY = 3 * 1024 * 1024; // the same limit as the demo server
const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

export interface AppOptions { cfg?: Config; clock?: Clock; sms?: SmsSender; media?: MediaStore; limiter?: RateLimiter; payments?: PaymentProvider; ai?: AiProvider | null; database?: OpenDb; publicDir?: string; logger?: boolean }
export interface App { server: FastifyInstance; deps: Deps; cfg: Config; close(): Promise<void>; call(method: string, path: string, body?: any, token?: string | null, query?: Record<string, string>): Promise<{ status: number; body: any }> }

export async function buildApp(opts: AppOptions = {}): Promise<App> {
  const cfg = opts.cfg || loadConfig();
  const clock = opts.clock || systemClock;
  const server = Fastify({
    logger: opts.logger === false || cfg.APP_ENV === 'test' ? false : { level: cfg.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] }, // structured JSON logs; tokens never logged
    bodyLimit: MAX_BODY,
    trustProxy: cfg.TRUST_PROXY,
  });
  const log = server.log as unknown as Deps['log'];
  const database = opts.database || (await openDb(cfg.DATABASE_URL));
  const applied = await migrate(database.db);
  if (applied.length) log.info({ applied }, 'database migrations applied');
  const media = opts.media || (await mediaStoreFor(cfg));
  const redis = !opts.limiter && cfg.REDIS_URL ? await redisLimiter(cfg.REDIS_URL) : null;
  const limiter = opts.limiter || redis || memoryLimiter(clock);
  const sms = opts.sms || logSms((msg) => log.info({ sms: true }, msg));
  const deps: Deps = { cfg, db: database.db, clock, sms, media, limiter, payments: opts.payments || paymentProviderFor(cfg), log };

  const prepared = await prepareData(database.db, cfg, clock, media);
  log.info({ ...prepared, database: database.kind, routes: routeCount(), env: cfg.APP_ENV }, 'data ready');

  // The trip assistant (docs/AI_ASSISTANT.md): the same handler, prompt and limits as the demo server.
  // It asks the marketplace for its context (which checks the token and the role), then talks to the AI.
  const ai = opts.ai !== undefined ? opts.ai : providerFromEnv(process.env, mockProvider);
  const assistantLimiter = new AssistantLimiter(undefined, undefined, () => clock.now().getTime()); // one for the whole process, as before
  const turn = (context: Res) => createAssistantHandler(() => context, ai, assistantLimiter);
  const answer = async (req: Req): Promise<Res> => {
    if (!req.path.startsWith('/assistant/') || req.path === '/assistant/context') return handle(deps, req);
    const context = req.path === '/assistant/trip' && req.method === 'POST' ? await handle(deps, { ...req, method: 'GET', path: '/assistant/context', body: null, query: {} }) : { status: 500, body: { error: 'server_error' } };
    try {
      return (await turn(context)(req)) || { status: 404, body: { error: 'not_found' } };
    } catch (e) {
      log.error({ err: String(e) }, 'trip assistant failed');
      return { status: 500, body: { error: 'server_error' } };
    }
  };
  log.info({ assistant: ai ? `${ai.name} ${ai.model}` : 'off' }, 'trip assistant');

  await server.register(cors, {
    origin: (origin, cb) => cb(null, !origin || cfg.allowedOrigins.includes(origin)),
    allowedHeaders: ['content-type', 'authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  });

  // The app always sends JSON; an empty body is fine (POST with nothing to say).
  server.removeAllContentTypeParsers();
  server.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
    const text = String(body || '');
    if (!text.trim()) return done(null, null);
    try {
      done(null, JSON.parse(text));
    } catch {
      const err: any = new Error('bad_json');
      err.statusCode = 400;
      err.apiCode = 'bad_json';
      done(err);
    }
  });
  server.setErrorHandler((err: any, _req, reply) => {
    if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || err.statusCode === 413) return reply.code(413).send({ error: 'too_large' });
    if (err.apiCode) return reply.code(400).send({ error: err.apiCode });
    log.error({ err: String(err?.stack || err) }, 'unhandled error');
    return reply.code(500).send({ error: 'server_error' });
  });

  // HTTPS only: behind the proxy, plain-HTTP API calls are refused in production.
  server.addHook('onRequest', async (req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    if (cfg.isProduction) {
      reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
      if (cfg.TRUST_PROXY && req.protocol !== 'https' && req.url.startsWith('/api/')) return reply.code(400).send({ error: 'https_required' });
    }
  });

  server.get('/healthz', async () => ({ ok: true }));
  server.get('/readyz', async (_req, reply) => {
    try {
      await database.ping();
      if (redis) await redis.ping();
      return { ok: true, database: database.kind, redis: !!redis };
    } catch (e) {
      log.error({ err: String(e) }, 'not ready');
      return reply.code(503).send({ ok: false });
    }
  });

  server.route({
    method: ['GET', 'POST', 'PUT', 'DELETE'],
    url: '/api/*',
    handler: async (req, reply) => {
      const url = new URL(req.url, 'http://local');
      const auth = req.headers.authorization || '';
      const res = await answer({ method: req.method, path: url.pathname.slice(4), query: Object.fromEntries(url.searchParams), body: req.body ?? null, token: auth.startsWith('Bearer ') ? auth.slice(7) : null, ip: req.ip });
      return reply.code(res.status).header('cache-control', 'no-store').send(res.body);
    },
  });

  // Media kept on this server's disk (development). Private files need a signed, short-lived link.
  if (media.read) {
    server.get('/media/*', async (req, reply) => {
      const url = new URL(req.url, 'http://local');
      const key = decodeURIComponent(url.pathname.slice('/media/'.length));
      const isPrivate = key.startsWith('id/');
      if (isPrivate && !media.checkSignature!(key, url.searchParams.get('exp') || '', url.searchParams.get('sig') || '', clock.now())) return reply.code(403).send({ error: 'forbidden' });
      const file = /^[a-z]+\/[0-9a-f]{32}\.[a-z]+$/.test(key) ? await media.read!(key) : null;
      if (!file) return reply.code(404).send({ error: 'not_found' });
      return reply.header('content-type', file.contentType).header('cache-control', isPrivate ? 'private, no-store' : 'public, max-age=31536000, immutable').header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'").send(file.bytes);
    });
  }

  // The built web app, when it is there (one process can serve both, like the demo server).
  const publicDir = opts.publicDir ?? path.join(process.cwd(), 'dist', 'public');
  server.setNotFoundHandler((req, reply) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname.startsWith('/api/') || req.method !== 'GET') return reply.code(404).send({ error: 'not_found', params: {} });
    const safe = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
    let file = path.join(publicDir, safe);
    if (!file.startsWith(publicDir)) return reply.code(400).send({ error: 'bad_path' });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(publicDir, 'index.html');
    if (!fs.existsSync(file)) return reply.code(404).send({ error: 'not_found', params: {} });
    const long = /\.(woff2|jpg|png)$/.test(file) || /assets[/\\]/.test(file);
    return reply.header('content-type', STATIC_TYPES[path.extname(file)] || 'application/octet-stream').header('cache-control', long ? 'public, max-age=604800' : 'no-cache').send(fs.readFileSync(file));
  });

  return {
    server,
    deps,
    cfg,
    // For tests: one API call without HTTP, in the same shape the demo engine's handler has.
    call: (method, p, body, token, query = {}) => answer({ method, path: p, query, body: body === undefined ? null : JSON.parse(JSON.stringify(body)), token: token ?? null, ip: '127.0.0.1' }),
    async close() {
      await server.close();
      if (redis) await redis.close();
      if (!opts.database) await database.close();
    },
  };
}
