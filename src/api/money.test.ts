// Money and availability under pressure: calls that arrive at the same moment, failed calls, and the audit trail.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { DEMO_ACCOUNTS } from '../core/seed';
import { addDays } from '../core/util';
import { schema } from '../db/client';
import { setupApi } from './testing';

const open: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) await s.close();
});
async function setup() {
  const s = await setupApi({ env: { SESSION_DAYS: '365' } });
  open.push(s);
  return s;
}

const CARD = { number: '4242 4242 4242 4242', name: 'Test Tourist', expiry: '12/30', cvc: '123' };
const trip = (today: string, extra: any = {}) => ({ title: 'Two days of Baghdad history', cities: ['baghdad'], startDate: addDays(today, 3), endDate: addDays(today, 4), groupSize: 2, languages: ['en'], interests: ['history'], budgetMin: 60, budgetMax: 120, ...extra });
const offerBody = (days: number, price = 100) => ({ price, plan: Array.from({ length: days }, (_, i) => ({ title: `Day ${i + 1} walk` })), message: 'Happy to show you around the old city.' });

// Two tourists, each with an offer from Ali for overlapping days.
async function twoOffersFromOneGuide(s: Awaited<ReturnType<typeof setup>>) {
  const t1 = await s.login('james@tripguide.demo');
  const t2 = await s.login('marco@tripguide.demo');
  const g = await s.login('ali@tripguide.demo');
  const r1 = await s.ok('POST', '/requests', trip(s.today()), t1);
  const r2 = await s.ok('POST', '/requests', trip(s.today(), { title: 'Same days, another tourist' }), t2);
  const o1 = await s.ok('POST', `/requests/${r1.id}/offers`, offerBody(2), g);
  const o2 = await s.ok('POST', `/requests/${r2.id}/offers`, offerBody(2, 110), g);
  return { t1, t2, g, r1, r2, o1, o2 };
}

test('money: two tourists hiring the same guide for the same days at the same moment: only one gets the booking, one payment is taken', async () => {
  const s = await setup();
  const { t1, t2, o1, o2 } = await twoOffersFromOneGuide(s);
  const before = (await s.db.select().from(schema.payments)).length;
  const hire = { confirmPayment: true, method: 'card', card: CARD };
  const [a, b] = await Promise.all([s.call('POST', `/offers/${o1.id}/hire`, hire, t1), s.call('POST', `/offers/${o2.id}/hire`, hire, t2)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal([a, b].find((x) => x.status === 409)!.body.error, 'guide_busy');
  assert.equal((await s.db.select().from(schema.payments)).length, before + 1, 'the refused tourist was not charged');
  const ids = (await s.db.select({ id: schema.bookings.id }).from(schema.bookings)).map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'booking ids are never handed out twice');
  await s.close();
  open.length = 0;
});

test('money: the database itself refuses a second booking of a guide on the same days', async () => {
  const s = await setup();
  const { t1, o1 } = await twoOffersFromOneGuide(s);
  const b = await s.ok('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, t1);
  const [row] = await s.db.select().from(schema.bookings).where(eq(schema.bookings.id, b.id));
  // A copy of the booking, one day later: the days still overlap, so PostgreSQL's exclusion constraint says no.
  const copy = { ...row, id: 99999, startDate: addDays(row.startDate, 1), endDate: addDays(row.endDate, 1) };
  await assert.rejects(s.db.insert(schema.bookings).values(copy), (e: any) => /bookings_guide_no_overlap/.test(String(e?.cause?.message || e?.message) + String(e?.cause?.constraint || '')));
  // A cancelled booking does not block the days.
  await s.db.insert(schema.bookings).values({ ...copy, status: 'cancelled' });
});

test('money: a payout asked twice at the same moment pays once; the guide withdraws it once', async () => {
  const s = await setup();
  const { t1, g, o1 } = await twoOffersFromOneGuide(s);
  const admin = await s.login(DEMO_ACCOUNTS.admin);
  const b = await s.ok('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, t1);
  await s.ok('POST', `/bookings/${b.id}/confirm`, null, g);
  const [p1, p2] = await Promise.all([s.call('POST', `/admin/bookings/${b.id}/payout`, null, admin), s.call('POST', `/admin/bookings/${b.id}/payout`, null, admin)]);
  assert.deepEqual([p1.status, p2.status].sort(), [200, 409]);
  assert.ok(['nothing_to_pay', 'booking_state'].includes([p1, p2].find((x) => x.status === 409)!.body.error));
  // The payment provider was asked for one charge of 100 and one payout of 90 (after the 10% fee).
  const moves = (s.app.deps.payments as any).log as { type: string; amount: number }[];
  assert.deepEqual(moves.map((m) => [m.type, m.amount]), [['charge', 100], ['payout', 90]]);
  const done = await s.ok('GET', `/bookings/${b.id}`, null, g);
  assert.deepEqual([done.status, done.money.released, done.money.held, done.money.fee], ['completed', 100, 0, 10]);
  assert.equal((await s.db.select().from(schema.notifications).where(eq(schema.notifications.type, 'payout_sent'))).length, 1, 'the guide is told once');
  // The guide's wallet: 90 after the 10% fee. Two withdrawals at once cannot take it twice.
  await s.ok('PUT', '/me/card', CARD, g);
  const wallet = await s.ok('GET', '/wallet', null, g);
  const [w1, w2] = await Promise.all([s.call('POST', '/wallet/withdraw', {}, g), s.call('POST', '/wallet/withdraw', {}, g)]);
  assert.deepEqual([w1.status, w2.status].sort(), [200, 409]);
  assert.equal([w1, w2].find((x) => x.status === 409)!.body.error, 'nothing_to_withdraw');
  const after = await s.ok('GET', '/wallet', null, g);
  assert.equal(after.available, 0);
  assert.equal(after.withdrawn, wallet.withdrawn + wallet.available);
  // The payout is in the audit log, once, without any card data.
  const log = await s.db.select().from(schema.auditLog);
  assert.deepEqual(log.filter((x) => x.action === 'payout').map((x) => [x.targetType, x.targetId]), [['bookings', String(b.id)]]);
});

test('money: a refused card books nothing and changes nothing; card numbers and CVCs are never stored', async () => {
  const s = await setup();
  const { t1, o1, r1 } = await twoOffersFromOneGuide(s);
  const count = async () => Object.fromEntries(await Promise.all((['bookings', 'milestones', 'payments', 'notifications'] as const).map(async (t) => [t, Number(((await s.db.execute(sql.raw(`select count(*)::int as n from "${t}"`))) as any).rows[0].n)])));
  const before = await count();
  const declined = await s.call('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: { ...CARD, number: '4000 0000 0000 0002' } }, t1);
  assert.deepEqual([declined.status, declined.body.error], [402, 'card_declined']);
  assert.deepEqual(await count(), before);
  assert.equal((await s.ok('GET', `/requests/${r1.id}`, null, t1)).status, 'open');
  // A good card, then look through every table for the number or the CVC.
  await s.ok('PUT', '/me/card', { ...CARD, cvc: '987' }, t1);
  await s.ok('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: { saved: true } }, t1);
  const dump = JSON.stringify([await s.db.select().from(schema.savedCards), await s.db.select().from(schema.payments), await s.db.select().from(schema.users), await s.db.select().from(schema.bookings), await s.db.select().from(schema.auditLog)]);
  assert.ok(!dump.includes('4242424242424242') && !dump.includes('4242 4242 4242 4242'), 'no full card number anywhere');
  assert.ok(!dump.includes('"987"'), 'no CVC anywhere');
  const [card] = await s.db.select().from(schema.savedCards);
  assert.deepEqual(Object.keys(card).sort(), ['brand', 'expiry', 'last4', 'name', 'userId']);
});

test('money: a hire that lapses is settled once, even when the first call after the 48 hours fails', async () => {
  const s = await setup();
  const { t1, g, o1, r1 } = await twoOffersFromOneGuide(s);
  const b = await s.ok('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, t1);
  s.advance(49);
  // The first call after the window is one that fails: the lapse is still saved.
  assert.equal((await s.call('POST', `/bookings/${b.id}/confirm`, null, g)).body.error, 'booking_state');
  const [row] = await s.db.select().from(schema.bookings).where(eq(schema.bookings.id, b.id));
  assert.equal(row.status, 'expired');
  await s.ok('GET', '/meta'); // more calls do not settle it again
  await s.ok('GET', '/dashboard', null, t1);
  assert.equal((await s.db.select().from(schema.notifications).where(eq(schema.notifications.type, 'hire_expired'))).filter((n) => n.link === `/requests/${r1.id}`).length, 1);
  const again = await s.ok('GET', `/bookings/${b.id}`, null, t1);
  assert.deepEqual([again.money.held, again.money.refunded], [0, 100]);
  assert.ok(((s.app.deps.payments as any).log as { type: string; amount: number }[]).some((m) => m.type === 'refund' && m.amount === 100), 'the provider was asked to refund');
  assert.equal((await s.ok('GET', `/requests/${r1.id}`, null, t1)).status, 'open', 'the trip is open again');
  // The refund sits in the tourist's wallet.
  assert.equal((await s.ok('GET', '/wallet', null, t1)).available, 100);
});

test('state actions are written to the audit log with who, what and when; identity photos get short-lived private links', async () => {
  const s = await setup();
  const admin = await s.login(DEMO_ACCOUNTS.admin);
  const queue = (await s.ok('GET', '/admin/verifications', null, admin)).guides;
  assert.equal(queue.length, 1);
  const link = queue[0].photos.idFront as string;
  assert.match(link, /^http:\/\/api\.test\/media\/id\/[0-9a-f]{32}\.svg\?exp=\d+&sig=/, 'a signed link, not the picture itself');
  // The link works for five minutes, only with its signature; nobody else is ever given one.
  const key = link.split('/media/')[1].split('?')[0];
  const q = new URL(link).searchParams;
  assert.equal(s.app.deps.media.checkSignature!(key, q.get('exp')!, q.get('sig')!, s.clock.now()), true);
  assert.equal(s.app.deps.media.checkSignature!(key, q.get('exp')!, 'x'.repeat(43), s.clock.now()), false);
  s.advance(0.1);
  assert.equal(s.app.deps.media.checkSignature!(key, q.get('exp')!, q.get('sig')!, s.clock.now()), false, 'expired');
  const asGuide = await s.login(DEMO_ACCOUNTS.guide);
  assert.equal((await s.call('GET', '/admin/verifications', null, asGuide)).status, 403);
  assert.ok(!JSON.stringify(await s.ok('GET', `/guides/${queue[0].id}`)).includes('/media/id/'), 'never in a public answer');
  await s.ok('POST', `/admin/guides/${queue[0].id}/verify`, { approve: true }, admin);
  await s.ok('PUT', '/admin/settings', { iqdPerUsd: 1400 }, admin);
  await s.ok('POST', `/admin/users/${queue[0].id}/status`, { status: 'suspended' }, admin);
  const log = await s.db.select().from(schema.auditLog).orderBy(schema.auditLog.id);
  assert.deepEqual(log.map((x) => x.action), ['identity_photos_viewed', 'guide_verify', 'price_change', 'user_suspend']);
  assert.ok(log.every((x) => x.adminId === 1 && x.ip === '127.0.0.1'));
  assert.equal(log[3].at.toISOString(), s.clock.now().toISOString());
  assert.deepEqual(log[2].details, { iqdPerUsd: 1400 });
  // Suspending signs the account out everywhere.
  assert.equal((await s.db.select().from(schema.sessions).where(eq(schema.sessions.userId, queue[0].id))).length, 0);
});

test('trip assistant: same endpoints and answers on the database API (mock AI)', async () => {
  const s = await setup();
  assert.deepEqual(await s.ok('GET', '/assistant/status'), { enabled: true });
  const tourist = await s.login(DEMO_ACCOUNTS.tourist);
  const guide = await s.login(DEMO_ACCOUNTS.guide);
  const ask = (token: string | null, messages: any[]) => s.call('POST', '/assistant/trip', { messages, draft: {}, lang: 'en' }, token);
  assert.equal((await ask(null, [{ role: 'user', content: 'hi' }])).status, 401);
  assert.equal((await ask(guide, [{ role: 'user', content: 'hi' }])).status, 403);
  assert.deepEqual((await ask(tourist, [])).body, { error: 'field_required', params: { field: 'messages' } });
  const r = await ask(tourist, [{ role: 'user', content: 'Two days in Babylon next week for 2 people, in English, about 80 dollars a day' }]);
  assert.equal(r.status, 200);
  assert.ok(typeof r.body.reply === 'string' && r.body.draft.cities.includes('babylon'));
  assert.equal(r.body.draft.groupSize, 2);
  const ctx = await s.ok('GET', '/assistant/context', null, tourist);
  assert.ok(ctx.guidePrices.babylon.guides >= 1 && ctx.limits.people === 10);
});
