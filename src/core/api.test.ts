import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from './api';
import { seed, DEMO_PASSWORD, DEMO_ACCOUNTS } from './seed';
import { addDays, iraqDate } from './util';
import type { Platform } from './types';

function setup(start = new Date('2026-10-18T09:00:00Z')) {
  let clock = start.getTime();
  let n = 0;
  const platform: Platform = {
    now: () => new Date(clock),
    hashPassword: (p) => 'h:' + p,
    verifyPassword: (p, h) => h === 'h:' + p,
    randomToken: () => 'tok' + ++n,
  };
  const data = seed(platform);
  const handle = createApi(data, platform);
  const call = (method: string, path: string, body?: any, token?: string | null, query: Record<string, string> = {}) => handle({ method, path, body, token: token ?? null, query });
  const ok = (method: string, path: string, body?: any, token?: string | null, query?: Record<string, string>) => {
    const r = call(method, path, body, token, query);
    assert.equal(r.status, 200, `${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const login = (email: string) => ok('POST', '/auth/login', { email, password: DEMO_PASSWORD }).token as string;
  const advance = (hours: number) => (clock += hours * 3600_000);
  const today = () => iraqDate(new Date(clock));
  return { data, call, ok, login, advance, today };
}

const tripBody = (today: string, extra: any = {}) => ({
  title: 'Two days of Baghdad history',
  cities: ['baghdad'],
  startDate: addDays(today, 3),
  endDate: addDays(today, 4),
  groupSize: 2,
  languages: ['en'],
  interests: ['history'],
  budgetMin: 60,
  budgetMax: 120,
  ...extra,
});

test('seed: demo accounts log in and dashboards load', () => {
  const s = setup();
  for (const email of Object.values(DEMO_ACCOUNTS)) {
    const t = s.login(email);
    const d = s.ok('GET', '/dashboard', null, t);
    assert.ok(d.role);
  }
  const g = s.ok('GET', '/dashboard', null, s.login(DEMO_ACCOUNTS.guide));
  assert.equal(g.awaiting.length, 1, 'Zainab has a hire to confirm');
  assert.ok(g.matching.some((r: any) => r.invitedMe), 'Zainab sees the invite');
  const t = s.ok('GET', '/dashboard', null, s.login(DEMO_ACCOUNTS.tourist));
  assert.equal(t.releaseAsks.length, 1);
  assert.equal(t.toReview.length, 1);
  const zainab = s.ok('GET', '/guides', null, null, { q: 'Zainab' }).guides[0];
  assert.ok(zainab.stats.topGuide);
  assert.ok(zainab.stats.toursCompleted >= 14);
  const a = s.ok('GET', '/dashboard', null, s.login(DEMO_ACCOUNTS.admin));
  assert.equal(a.openReports, 1);
  assert.equal(a.pendingVerifications, 1);
});

test('full flow: post, offer, hire, confirm, release day by day, review both ways', () => {
  const s = setup();
  const reg = s.ok('POST', '/auth/register', { role: 'tourist', name: 'Test Tourist', email: 'tt@example.com', password: 'longpassword', country: 'Spain', gender: 'f' });
  const tt = reg.token;
  const req = s.ok('POST', '/requests', tripBody(s.today()), tt);
  assert.equal(req.days, 2);

  const ali = s.login('ali@tripguide.demo');
  const feed = s.ok('GET', '/requests', null, ali, { matching: '1' });
  assert.ok(feed.requests.some((r: any) => r.id === req.id), 'request reaches matching guides');

  // A guide outside the city cannot see it in the matching feed but can still offer from the full list.
  const offer = s.ok('POST', `/requests/${req.id}/offers`, { price: 90, plan: [{ title: 'Old city', details: '' }, { title: 'Museum', details: '' }], includes: ['tickets'], message: 'I would love to show you Baghdad.' }, ali);
  assert.equal(s.call('POST', `/requests/${req.id}/offers`, { price: 90, plan: [{ title: 'a b' }, { title: 'c d' }], message: 'again and again' }, ali).status, 409, 'one offer per guide');
  assert.equal(s.call('POST', `/requests/${req.id}/offers`, { price: 90, plan: [{ title: 'only one day' }], message: 'wrong number of days' }, s.login('omar@tripguide.demo')).body.error, 'plan_days');

  // The tourist sees the offer and a notification.
  const detail = s.ok('GET', `/requests/${req.id}`, null, tt);
  assert.equal(detail.offers.length, 1);
  assert.equal(s.ok('GET', '/notifications', null, tt).unread, 1);
  // Another tourist cannot see this request.
  assert.equal(s.call('GET', `/requests/${req.id}`, null, s.login(DEMO_ACCOUNTS.tourist)).status, 404);

  // Chat before hiring.
  const th = s.ok('POST', '/threads', { guideId: offer.guideId, requestId: req.id }, tt);
  s.ok('POST', `/threads/${th.id}/messages`, { body: 'Does this include lunch?' }, tt);
  s.ok('POST', `/threads/${th.id}/messages`, { body: 'Lunch is not included.' }, ali);
  assert.equal(s.ok('GET', '/threads', null, tt).threads[0].unread, 1);

  // Hire: payment is held.
  assert.equal(s.call('POST', `/offers/${offer.id}/hire`, {}, tt).body.error, 'payment_confirm_required');
  const booking = s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true }, tt);
  assert.equal(booking.status, 'awaiting_guide');
  assert.equal(booking.money.held, 90);
  assert.equal(booking.milestones.length, 2);

  const confirmed = s.ok('POST', `/bookings/${booking.id}/confirm`, null, ali);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(s.ok('GET', `/requests/${req.id}`, null, tt).status, 'hired');

  // Guide cannot ask for release before the day.
  const [d1, d2] = confirmed.milestones;
  assert.equal(s.call('POST', `/milestones/${d1.id}/request-release`, null, ali).body.error, 'day_not_reached');
  // Tourist cannot cancel once the tour has started.
  s.advance(24 * 3);
  assert.equal(s.call('POST', `/bookings/${booking.id}/cancel`, {}, tt).body.error, 'tour_started');
  s.ok('POST', `/milestones/${d1.id}/request-release`, null, ali);
  let b = s.ok('POST', `/milestones/${d1.id}/release`, null, tt);
  assert.equal(b.money.released, 45);
  assert.equal(b.status, 'confirmed');
  b = s.ok('POST', `/milestones/${d2.id}/release`, null, tt);
  assert.equal(b.status, 'completed');
  assert.equal(b.money.fee, 9);

  const wallet = s.ok('GET', '/wallet', null, ali);
  assert.ok(wallet.released >= 81);

  // Reviews stay hidden until both are in.
  s.ok('POST', `/bookings/${booking.id}/review`, { ratings: { knowledge: 5, communication: 5, punctuality: 4, value: 5 }, hireAgain: true, comment: 'Wonderful two days.' }, tt);
  let view = s.ok('GET', `/bookings/${booking.id}`, null, ali);
  assert.equal(view.theirReview, null);
  assert.equal(view.theirReviewPending, true);
  s.ok('POST', `/bookings/${booking.id}/review`, { ratings: { communication: 5, punctuality: 5, respect: 5 }, hireAgain: true, comment: 'Great guests, very kind.' }, ali);
  view = s.ok('GET', `/bookings/${booking.id}`, null, ali);
  assert.equal(view.theirReview.overall, 4.8);
  assert.equal(s.call('POST', `/bookings/${booking.id}/review`, { ratings: { communication: 5, punctuality: 5, respect: 5 }, comment: 'twice twice' }, ali).status, 409);
});

test('direct hire from a profile goes only to that guide', () => {
  const s = setup();
  const tt = s.login(DEMO_ACCOUNTS.tourist);
  const sara = s.ok('GET', '/guides', null, null, { q: 'Sara' }).guides[0];
  const req = s.ok('POST', '/requests', tripBody(s.today(), { cities: ['erbil'], directGuideId: sara.id }), tt);
  const ali = s.login('ali@tripguide.demo');
  assert.ok(!s.ok('GET', '/requests', null, ali).requests.some((r: any) => r.id === req.id));
  assert.equal(s.call('POST', `/requests/${req.id}/offers`, { price: 100, plan: [{ title: 'one one' }, { title: 'two two' }], message: 'let me in please' }, ali).status, 404);
  const saraTok = s.login('sara@tripguide.demo');
  assert.ok(s.ok('GET', '/requests', null, saraTok).requests.some((r: any) => r.id === req.id));
});

test('an unconfirmed hire lapses after 48 hours and the money returns', () => {
  const s = setup();
  const tt = s.login('marco@tripguide.demo');
  const bookings = s.ok('GET', '/bookings', null, tt).bookings;
  const pending = bookings.find((b: any) => b.status === 'awaiting_guide');
  assert.ok(pending);
  s.advance(49);
  const after = s.ok('GET', `/bookings/${pending.id}`, null, tt);
  assert.equal(after.status, 'expired');
  assert.equal(after.money.held, 0);
  assert.equal(after.money.refunded, 130);
  const req = s.ok('GET', `/requests/${after.requestId}`, null, tt);
  assert.equal(req.status, 'open');
});

test('guide declining reopens the request and refunds', () => {
  const s = setup();
  const z = s.login(DEMO_ACCOUNTS.guide);
  const pending = s.ok('GET', '/dashboard', null, z).awaiting[0];
  const b = s.ok('POST', `/bookings/${pending.id}/decline`, null, z);
  assert.equal(b.status, 'declined');
  assert.equal(b.money.refunded, 130);
});

test('report and admin refund', () => {
  const s = setup();
  const admin = s.login(DEMO_ACCOUNTS.admin);
  const reports = s.ok('GET', '/admin/reports', null, admin).reports;
  assert.equal(reports.length, 1);
  s.ok('POST', `/admin/reports/${reports[0].id}/resolve`, { action: 'refund', note: 'Guide did not show up.', suspend: true }, admin);
  const reza = s.login('reza@tripguide.demo');
  const b = s.ok('GET', `/bookings/${reports[0].bookingId}`, null, reza);
  assert.equal(b.status, 'cancelled');
  assert.equal(b.money.refunded, 55);
  assert.equal(s.call('POST', '/auth/login', { email: 'hamid@tripguide.demo', password: DEMO_PASSWORD }).status, 200);
  const hamidTok = s.login('hamid@tripguide.demo');
  assert.equal(s.call('POST', '/threads', { touristId: 1 }, hamidTok).body.error, 'account_suspended');
});

test('guide sign-up, profile, verification approved by admin', () => {
  const s = setup();
  const g = s.ok('POST', '/auth/register', { role: 'guide', name: 'New Guide', email: 'new@guide.iq', password: 'password123', country: 'Iraq', gender: 'm' }).token;
  assert.equal(s.call('POST', '/guide/verification', { docs: ['id.jpg'] }, g).body.error, 'profile_incomplete');
  s.ok('PUT', '/guide/profile', { headline: 'Basra boat tours', bio: 'I run boat trips on the Shatt al-Arab and in the marshes for small groups.', cities: ['basra'], pricePerDay: 45, languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'good' }], specialities: ['nature'] }, g);
  s.ok('POST', '/guide/verification', { docs: ['id.jpg'] }, g);
  const admin = s.login(DEMO_ACCOUNTS.admin);
  const queue = s.ok('GET', '/admin/verifications', null, admin).guides;
  const mine = queue.find((x: any) => x.name === 'New Guide');
  assert.ok(mine);
  s.ok('POST', `/admin/guides/${mine.id}/verify`, { approve: true }, admin);
  assert.equal(s.ok('GET', `/guides/${mine.id}`).verification, 'verified');
  assert.ok(s.ok('GET', '/guides', null, null, { city: 'basra', verified: '1' }).guides.some((x: any) => x.id === mine.id));
});

test('validation: past dates, bad budget, login required', () => {
  const s = setup();
  const tt = s.login(DEMO_ACCOUNTS.tourist);
  assert.equal(s.call('POST', '/requests', tripBody(s.today(), { startDate: addDays(s.today(), -2) }), tt).body.error, 'date_past');
  assert.equal(s.call('POST', '/requests', tripBody(s.today(), { budgetMin: 300, budgetMax: 100 }), tt).body.error, 'budget_order');
  assert.equal(s.call('POST', '/requests', tripBody(s.today())).status, 401);
  assert.equal(s.call('POST', '/requests', tripBody(s.today()), s.login(DEMO_ACCOUNTS.guide)).status, 403);
  assert.equal(s.call('GET', '/nope').status, 404);
});

test('search filters: availability on dates excludes booked guides', () => {
  const s = setup();
  const today = s.today();
  const free = s.ok('GET', '/guides', null, null, { city: 'baghdad', from: addDays(today, 10), to: addDays(today, 11) }).guides;
  assert.ok(!free.some((g: any) => g.name === 'Zainab Al-Rubaie'), 'Zainab is booked with James');
  const later = s.ok('GET', '/guides', null, null, { city: 'baghdad', from: addDays(today, 60), to: addDays(today, 61) }).guides;
  assert.ok(later.some((g: any) => g.name === 'Zainab Al-Rubaie'));
  const ar = s.ok('GET', '/guides', null, null, { lang: 'ur' }).guides;
  assert.deepEqual(ar.map((g: any) => g.name), ['Hussein Al-Musawi']);
});
