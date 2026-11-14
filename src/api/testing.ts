// Test helper: the real API on a fresh in-memory PostgreSQL with the demo data, a clock tests can move,
// and SMS kept in memory. The `call/ok/login` helpers mirror the ones in src/core/api.test.ts.
import assert from 'node:assert/strict';
import { DEMO_PASSWORD } from '../core/seed';
import { iraqDate } from '../core/util';
import { schema } from '../db/client';
import { mockProvider } from '../server/mock-ai';
import { buildApp } from './app';
import { loadConfig } from './config';
import { decodeDataUrl, logSms, testClock } from './services';

export async function setupApi(opts: { start?: Date; env?: Record<string, string>; demo?: boolean } = {}) {
  const clock = testClock(opts.start || new Date('2026-10-18T09:00:00Z'));
  const sms = logSms();
  // TEST_DATABASE_URL=postgres://user:pass@host:5432/postgres runs the tests on a real PostgreSQL: each test gets
  // its own fresh database, dropped when the test closes. Without it, an embedded PostgreSQL in memory is used.
  const real = process.env.TEST_DATABASE_URL || '';
  let dropDatabase = async () => {};
  let databaseUrl = 'memory';
  if (real) {
    const { default: pg } = await import('pg');
    const name = 'tg_test_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const admin = new pg.Client({ connectionString: real });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    await admin.end();
    const url = new URL(real);
    url.pathname = '/' + name;
    databaseUrl = url.toString();
    dropDatabase = async () => {
      const c = new pg.Client({ connectionString: real });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await c.end();
    };
  }
  const cfg = loadConfig({ APP_ENV: 'test', DATABASE_URL: databaseUrl, DATABASE_POOL: '5', MEDIA_DRIVER: 'memory', PUBLIC_URL: 'http://api.test', SEED_DEMO: opts.demo === false ? '0' : '1', ...opts.env });
  const app = await buildApp({ cfg, clock, sms, ai: mockProvider(), logger: false, publicDir: 'none' });
  const call = app.call;
  const ok = async (method: string, path: string, body?: any, token?: string | null, query?: Record<string, string>) => {
    const r = await call(method, path, body, token, query);
    assert.equal(r.status, 200, `${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const users = await app.deps.db.select({ email: schema.users.email, phone: schema.users.phone }).from(schema.users);
  // People sign in with their phone number. Tests may still name a demo account by its email.
  const phoneOf = (who: string) => (who.startsWith('+') ? who : users.find((u) => u.email === who)!.phone);
  const login = async (who: string, password = DEMO_PASSWORD) => (await ok('POST', '/auth/login', { phone: phoneOf(who), password })).token as string;
  // The last 6-digit code sent by SMS to a number.
  const smsCode = (to: string) => /\b(\d{6})\b/.exec([...sms.sent].reverse().find((m) => m.to === to)?.text || '')?.[1] || null;
  // Is the picture behind this media link the one that was uploaded (as a data URL)?
  const sameImage = async (url: unknown, dataUrl: string) => {
    const key = String(url).split('?')[0].split('/media/')[1];
    const file = key ? await app.deps.media.read!(key) : null;
    return !!file && file.bytes.equals(decodeDataUrl(dataUrl)!.bytes);
  };
  return { app, sameImage, db: app.deps.db, cfg, clock, sms, call, ok, login, phoneOf, smsCode, advance: clock.advance, today: () => iraqDate(clock.now()), close: async () => { await app.close(); await dropDatabase(); } };
}
