// Contract check: the demo engine and the database-backed API side by side, with the same demo data and the same
// clock. Every call is made on both and the two answers must be identical, apart from what is allowed to differ:
// sign-in tokens and pictures (inline data in the engine, media links on the API).
import assert from 'node:assert/strict';
import { createApi } from '../core/api';
import { DEMO_PASSWORD, seed } from '../core/seed';
import type { Platform } from '../core/types';
import { setupApi } from './testing';

const PICTURE = /^data:image\/|\/media\/[a-z]+\/[0-9a-f]{32}\./;
export function comparable(v: any): any {
  if (typeof v === 'string') return PICTURE.test(v) ? '<picture>' : v;
  if (Array.isArray(v)) return v.map(comparable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'token').map(([k, x]) => [k, comparable(x)]));
  return v;
}

export async function twin(start = new Date('2026-10-18T09:00:00Z')) {
  const api = await setupApi({ start, env: { SESSION_DAYS: '365', RATE_LIMIT: 'off' } });
  let n = 0;
  const platform: Platform = { now: () => api.clock.now(), hashPassword: (p) => 'h:' + p, verifyPassword: (p, h) => h === 'h:' + p, randomToken: () => 'tok' + ++n };
  const data = seed(platform);
  const engine = createApi(data, platform);
  const tokens = new Map<string, { old: string; neu: string }>();
  let calls = 0;
  const paths = new Set<string>();

  // One call on both sides. `who` is a demo account's email (or null for a guest).
  async function both(method: string, path: string, body?: any, who?: string | null, query: Record<string, string> = {}) {
    const t = who ? tokens.get(who) || (await signIn(who)) : null;
    const sent = body === undefined ? null : body;
    const old = engine({ method, path, query, body: sent === null ? null : JSON.parse(JSON.stringify(sent)), token: t ? t.old : null });
    const neu = await api.call(method, path, sent, t ? t.neu : null, query);
    calls++;
    paths.add(method + ' ' + path.replace(/\/\d+/g, '/:id'));
    assert.deepEqual({ status: neu.status, body: comparable(neu.body) }, { status: old.status, body: comparable(old.body) }, `${method} ${path} as ${who || 'guest'}: the API and the engine answer differently`);
    return neu;
  }
  async function signIn(who: string) {
    const phone = api.phoneOf(who);
    const old = engine({ method: 'POST', path: '/auth/login', query: {}, body: { phone, password: DEMO_PASSWORD }, token: null });
    const neu = await api.call('POST', '/auth/login', { phone, password: DEMO_PASSWORD });
    assert.deepEqual(comparable(neu.body), comparable(old.body), `sign-in as ${who}`);
    const t = { old: old.body.token as string, neu: neu.body.token as string };
    tokens.set(who, t);
    return t;
  }
  const ok = async (method: string, path: string, body?: any, who?: string | null, query?: Record<string, string>) => {
    const r = await both(method, path, body, who, query);
    assert.equal(r.status, 200, `${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { api, both, ok, advance: api.advance, today: api.today, close: api.close, stats: () => ({ calls, paths: [...paths].sort() }) };
}
