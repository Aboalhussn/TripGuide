// Tests for the trip assistant's draft rules (src/core/draft.ts) and GET /assistant/context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, checkDraft, draftDays, emptyDraft, normalizeDraft, toRequestBody, type DraftContext } from './draft';
import { CITIES, INTERESTS, LANGUAGES, PLACES } from './catalog';
import { createApi } from './api';
import { seed, DEMO_ACCOUNTS, DEMO_PASSWORD } from './seed';
import { addDays } from './util';
import type { Platform } from './types';

const today = '2026-10-21';
const ctx: DraftContext = { today, cities: CITIES, places: PLACES, languages: LANGUAGES, interests: INTERESTS };

const full = () =>
  applyPatch(
    emptyDraft(),
    { title: 'Three days in Babylon', cities: ['babylon'], startDate: '2026-12-01', endDate: '2026-12-03', groupSize: 2, languages: ['en'], budgetMin: 60, budgetMax: 90 },
    ctx,
  );

test('draft: an empty draft is missing every required part, in asking order', () => {
  assert.deepEqual(checkDraft(emptyDraft(), ctx).missing, ['cities', 'dates', 'groupSize', 'languages', 'budget', 'title']);
});

test('draft: a full draft is ready', () => {
  const d = full();
  assert.deepEqual(checkDraft(d, ctx), { missing: [], problems: [] });
  assert.equal(draftDays(d), 3);
});

test('draft: wrong dates and budgets are problems, not just missing', () => {
  const past = applyPatch(full(), { startDate: '2026-10-01', endDate: '2026-10-02' }, ctx);
  assert.deepEqual(checkDraft(past, ctx).problems.map((p) => p.code), ['date_past']);
  const order = applyPatch(full(), { startDate: '2026-12-05', endDate: '2026-12-01' }, ctx);
  assert.deepEqual(checkDraft(order, ctx).problems.map((p) => p.code), ['dates_order']);
  const long = applyPatch(full(), { startDate: '2026-12-01', endDate: '2027-01-15' }, ctx);
  assert.deepEqual(checkDraft(long, ctx).problems.map((p) => p.code), ['trip_too_long']);
  const cheap = applyPatch(full(), { budgetMin: 2, budgetMax: 5 }, ctx);
  assert.deepEqual(checkDraft(cheap, ctx).missing, ['budget']);
  assert.equal(checkDraft(cheap, ctx).problems[0].code, 'budget_low');
});

test('draft: unknown values from the AI are dropped', () => {
  const d = applyPatch(
    emptyDraft(),
    { cities: ['babylon', 'atlantis', 'Najaf', 'كربلاء'], languages: ['en', 'klingon'], interests: ['history', 'skydiving'], groupSize: 40, startDate: 'next friday', places: [14, 999, 6, 'x'] },
    ctx,
  );
  assert.deepEqual(d.cities, ['babylon', 'najaf', 'karbala'], 'names in English and Arabic are understood');
  assert.deepEqual(d.languages, ['en']);
  assert.deepEqual(d.interests, ['history']);
  assert.equal(d.groupSize, null, 'more than 10 people is ignored');
  assert.equal(d.startDate, '', 'text that is not a date is ignored');
  assert.deepEqual(d.places, [14, 6], 'only real places from the chosen governorates');
});

test('draft: places follow the governorates', () => {
  const d = applyPatch(full(), { places: [13, 14, 6] }, ctx);
  assert.deepEqual(d.places, [13, 14], 'Imam Ali Shrine is in Najaf, not Babylon');
  const moved = applyPatch(d, { cities: ['najaf'] }, ctx);
  assert.deepEqual(moved.places, [], 'changing the governorates drops places from the old ones');
});

test('draft: a start date and a number of days make the end date', () => {
  const d = applyPatch(emptyDraft(), { startDate: '2026-12-01', days: 3 }, ctx);
  assert.equal(d.endDate, '2026-12-03');
});

test('draft: one budget number becomes a range', () => {
  const d = applyPatch(emptyDraft(), { budgetMax: 100 }, ctx);
  assert.equal(d.budgetMax, 100);
  assert.equal(d.budgetMin, 70);
  const lower = applyPatch(d, { budgetMax: 50 }, ctx);
  assert.equal(lower.budgetMin, 35, 'a lower top moves the bottom down too');
});

test('draft: the plan is cut to the trip length', () => {
  const d = applyPatch(full(), { plan: [{ title: 'Day 1' }, { title: 'Day 2' }, { title: 'Day 3' }, { title: 'Day 4' }] }, ctx);
  assert.equal(d.plan.length, 3);
  assert.deepEqual(d.plan[0], { title: 'Day 1', details: '' });
});

test('draft: garbage input never throws', () => {
  for (const junk of [null, undefined, 'text', 42, [], { cities: 'babylon' }, { plan: 'x' }, { groupSize: 'many' }]) {
    assert.doesNotThrow(() => applyPatch(emptyDraft(), junk, ctx));
  }
  assert.deepEqual(normalizeDraft(null, ctx), emptyDraft());
});

test('draft: becomes a POST /requests body that the server accepts', () => {
  let n = 0;
  const platform: Platform = { now: () => new Date('2026-10-21T09:00:00Z'), hashPassword: (p) => 'h:' + p, verifyPassword: (p, h) => h === 'h:' + p, randomToken: () => 'tok' + ++n };
  const api = createApi(seed(platform), platform);
  const token = api({ method: 'POST', path: '/auth/login', body: { email: DEMO_ACCOUNTS.tourist, password: DEMO_PASSWORD }, token: null, query: {} }).body.token;

  const context = api({ method: 'GET', path: '/assistant/context', body: null, token, query: {} });
  assert.equal(context.status, 200);
  assert.equal(context.body.today, today);
  assert.ok(context.body.guidePrices.baghdad.guides > 0, 'guide prices per governorate');
  assert.ok(context.body.guidePrices.baghdad.typical > 0);
  const guideToken = api({ method: 'POST', path: '/auth/login', body: { email: DEMO_ACCOUNTS.guide, password: DEMO_PASSWORD }, token: null, query: {} }).body.token;
  assert.equal(api({ method: 'GET', path: '/assistant/context', body: null, token: guideToken, query: {} }).status, 403, 'tourists only');

  const d = applyPatch(full(), { startDate: addDays(today, 10), endDate: addDays(today, 12), places: [13, 14], interests: ['history'], plan: [{ title: 'Old city' }] }, ctx);
  const body = toRequestBody(d);
  assert.equal(body.budgetMin, 180, 'per-day budget × 3 days');
  assert.equal(body.budgetMax, 270);
  const r = api({ method: 'POST', path: '/requests', body, token, query: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.places, [13, 14]);
  assert.equal(r.body.plan.length, 1);
});
