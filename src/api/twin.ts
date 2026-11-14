// Contract check: the demo engine and the database-backed API side by side, with the same demo data and the same
// clock. Every call is made on both and the two answers must be identical, apart from what is allowed to differ:
// sign-in tokens, one-time codes, and pictures (inline data in the engine, media links on the API).
import assert from 'node:assert/strict';
import { createApi, ROUTES } from '../core/api';
import { DEMO_PASSWORD, seed } from '../core/seed';
import type { Platform } from '../core/types';
import { createAssistantHandler } from '../server/assistant';
import { mockProvider } from '../server/mock-ai';
import { setupApi } from './testing';

const PICTURE = /^data:image\/|\/media\/[a-z]+\/[0-9a-f]{32}\./;
const SECRET_KEYS = new Set(['token', 'demoCode']);
export function comparable(v: any): any {
  if (typeof v === 'string') return PICTURE.test(v) ? '<picture>' : v;
  if (Array.isArray(v)) return v.map(comparable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEYS.has(k) ? '<secret>' : comparable(x)]));
  return v;
}

// Every endpoint of the app: the engine's routes plus the two assistant routes.
export const ALL_ENDPOINTS = [...ROUTES.map((r) => `${r.method} ${r.pattern}`), 'GET /assistant/status', 'POST /assistant/trip'];
const MATCHERS = ALL_ENDPOINTS.map((e) => {
  const [method, pattern] = e.split(' ');
  return { name: e, method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$') };
});
// Which endpoints have been compared so far in this test file (success or error answers).
export const compared = new Set<string>();

export async function twin(start = new Date('2026-10-18T09:00:00Z')) {
  const api = await setupApi({ start, env: { SESSION_DAYS: '365', RATE_LIMIT: 'off' } });
  let n = 0;
  const platform: Platform = { now: () => api.clock.now(), hashPassword: (p) => 'h:' + p, verifyPassword: (p, h) => h === 'h:' + p, randomToken: () => 'tok' + ++n };
  const data = seed(platform);
  const engine = createApi(data, platform);
  // The assistant on the old side: the same handler the demo server mounts, with the same pretend AI.
  const assistant = createAssistantHandler(engine, mockProvider());
  const tokens = new Map<string, { old: string; neu: string }>();
  let calls = 0;

  // One call on both sides. `who` names a signed-in account (a demo email, or a name given to useTokens).
  // `oldBody` is only for the rare call whose body must differ per side (a one-time code).
  async function both(method: string, path: string, body?: any, who?: string | null, query: Record<string, string> = {}, oldBody?: any): Promise<{ status: number; body: any; old: any }> {
    const t = who ? tokens.get(who) || (await signIn(who)) : null;
    const sent = body === undefined ? null : body;
    const sentOld = oldBody === undefined ? sent : oldBody;
    const req = { method, path, query, body: sentOld === null ? null : JSON.parse(JSON.stringify(sentOld)), token: t ? t.old : null };
    const old = path.startsWith('/assistant/') && path !== '/assistant/context' ? (await assistant(req)) || { status: 404, body: { error: 'not_found' } } : engine(req);
    const neu = await api.call(method, path, sent, t ? t.neu : null, query);
    calls++;
    const hit = MATCHERS.find((m) => m.method === method && m.re.test(path));
    if (hit) compared.add(hit.name);
    assert.deepEqual({ status: neu.status, body: comparable(neu.body) }, { status: old.status, body: comparable(old.body) }, `${method} ${path} as ${who || 'guest'}: the API and the engine answer differently`);
    return { status: neu.status, body: neu.body, old: old.body };
  }
  async function signIn(who: string, password = DEMO_PASSWORD): Promise<{ old: string; neu: string }> {
    const r = await both('POST', '/auth/login', { phone: api.phoneOf(who), password }, null);
    assert.equal(r.status, 200, `sign-in as ${who}`);
    return useTokens(who, r);
  }
  // Remembers the two tokens a sign-up, sign-in or reset answered with, under a name.
  function useTokens(who: string, r: { body: any; old: any }) {
    const t = { old: r.old.token as string, neu: r.body.token as string };
    tokens.set(who, t);
    return t;
  }
  const ok = async (method: string, path: string, body?: any, who?: string | null, query?: Record<string, string>) => {
    const r = await both(method, path, body, who, query);
    assert.equal(r.status, 200, `${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { api, both, ok, signIn, useTokens, forget: (who: string) => tokens.delete(who), advance: api.advance, today: api.today, close: api.close, stats: () => ({ calls }) };
}
