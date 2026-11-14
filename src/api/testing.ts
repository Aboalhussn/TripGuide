// Test helper: the real API on a fresh in-memory PostgreSQL with the demo data, a clock tests can move,
// and SMS kept in memory. The `call/ok/login` helpers mirror the ones in src/core/api.test.ts.
import assert from 'node:assert/strict';
import { DEMO_PASSWORD } from '../core/seed';
import { iraqDate } from '../core/util';
import { schema } from '../db/client';
import { buildApp } from './app';
import { loadConfig } from './config';
import { decodeDataUrl, logSms, testClock } from './services';

export async function setupApi(opts: { start?: Date; env?: Record<string, string>; demo?: boolean } = {}) {
  const clock = testClock(opts.start || new Date('2026-10-18T09:00:00Z'));
  const sms = logSms();
  const cfg = loadConfig({ APP_ENV: 'test', DATABASE_URL: 'memory', MEDIA_DRIVER: 'memory', PUBLIC_URL: 'http://api.test', SEED_DEMO: opts.demo === false ? '0' : '1', ...opts.env });
  const app = await buildApp({ cfg, clock, sms, logger: false, publicDir: 'none' });
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
  return { app, sameImage, db: app.deps.db, cfg, clock, sms, call, ok, login, phoneOf, smsCode, advance: clock.advance, today: () => iraqDate(clock.now()), close: () => app.close() };
}
