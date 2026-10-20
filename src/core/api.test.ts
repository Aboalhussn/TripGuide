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

const CARD = { number: '4242 4242 4242 4242', name: 'Test Tourist', expiry: '12/30', cvc: '123' };

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
  const reg = s.ok('POST', '/auth/register', { role: 'tourist', name: 'Test Tourist', email: 'tt@example.com', password: 'Long#pass1', country: 'Spain', gender: 'f' });
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
  const booking = s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, tt);
  assert.equal(booking.paymentMethod, 'card');
  assert.equal(booking.cardLast4, '4242');
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
  const g = s.ok('POST', '/auth/register', { role: 'guide', name: 'New Guide', email: 'new@guide.iq', password: 'Guide#2026', country: 'Iraq', gender: 'm' }).token;
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

// ---------- payment methods ----------
function postAndOffer(s: ReturnType<typeof setup>, guideEmail = 'ali@tripguide.demo') {
  const tt = s.login(DEMO_ACCOUNTS.tourist);
  const req = s.ok('POST', '/requests', tripBody(s.today()), tt);
  const g = s.login(guideEmail);
  const offer = s.ok('POST', `/requests/${req.id}/offers`, { price: 90, plan: [{ title: 'Day one walk' }, { title: 'Day two walk' }], message: 'Happy to show you around.' }, g);
  return { tt, g, req, offer };
}

test('card payment: bad, expired and declined cards are refused; nothing is booked', () => {
  const s = setup();
  const { tt, offer } = postAndOffer(s);
  const hire = (card: any) => s.call('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'card', card }, tt);
  assert.equal(hire({ ...CARD, number: '4242 4242 4242 4241' }).body.error, 'card_invalid');
  assert.equal(hire({ ...CARD, expiry: '01/20' }).body.error, 'card_expired');
  assert.equal(hire({ ...CARD, cvc: '1' }).body.error, 'card_cvc_invalid');
  assert.equal(hire({ ...CARD, name: '' }).body.error, 'card_name_required');
  const declined = hire({ ...CARD, number: '4000 0000 0000 0002' });
  assert.equal(declined.status, 402);
  assert.equal(declined.body.error, 'card_declined');
  assert.equal(s.ok('GET', `/requests/${offer.requestId}`, null, tt).status, 'open');
  assert.equal(s.data.payments.filter((p) => p.purpose === 'booking').length, 0);
});

test('cash needs the guide to subscribe; then the guide confirms cash day by day', () => {
  const s = setup();
  const { tt, g, offer } = postAndOffer(s);
  // Ali has no subscription yet, so cash is not offered.
  s.ok('PUT', '/guide/profile', { acceptsCash: true }, g);
  assert.equal(s.call('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'cash' }, tt).body.error, 'cash_not_accepted');
  // The admin sets the price; Ali subscribes by card.
  const admin = s.login(DEMO_ACCOUNTS.admin);
  assert.equal(s.ok('PUT', '/admin/settings', { guideSubscriptionPrice: 7, subscriptionDays: 30 }, admin).guideSubscriptionPrice, 7);
  assert.equal(s.call('PUT', '/admin/settings', { guideSubscriptionPrice: 7 }, tt).status, 403);
  assert.equal(s.call('POST', '/guide/subscription', { card: { ...CARD, number: '1234' } }, g).body.error, 'card_invalid');
  const sub = s.ok('POST', '/guide/subscription', { card: CARD }, g);
  assert.equal(sub.active, true);
  assert.equal(s.ok('GET', '/guide/subscription', null, g).history[0].amount, 7);
  assert.equal(s.ok('GET', '/me', null, g).guide.cashOpen, true);
  // The tourist now sees "cash accepted" and hires paying cash.
  const view = s.ok('GET', `/requests/${offer.requestId}`, null, tt);
  assert.equal(view.offers.find((o: any) => o.id === offer.id).guide.acceptsCash, true);
  const booking = s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'cash' }, tt);
  assert.equal(booking.paymentMethod, 'cash');
  assert.equal(booking.feeRate, 0);
  assert.equal(booking.money.held, 0);
  assert.equal(booking.money.cashDue, 90);
  const confirmed = s.ok('POST', `/bookings/${booking.id}/confirm`, null, g);
  const [d1, d2] = confirmed.milestones;
  assert.equal(d1.status, 'cash_due');
  // Not before the day, and the tourist cannot mark it.
  assert.equal(s.call('POST', `/milestones/${d1.id}/cash-received`, null, g).body.error, 'day_not_reached');
  s.advance(24 * 3);
  assert.equal(s.call('POST', `/milestones/${d1.id}/cash-received`, null, tt).status, 403);
  assert.equal(s.call('POST', `/milestones/${d1.id}/release`, null, tt).body.error, 'milestone_state');
  let b = s.ok('POST', `/milestones/${d1.id}/cash-received`, null, g);
  assert.equal(b.money.cashPaid, 45);
  assert.equal(b.status, 'confirmed');
  s.advance(24);
  b = s.ok('POST', `/milestones/${d2.id}/cash-received`, null, g);
  assert.equal(b.status, 'completed');
  const wallet = s.ok('GET', '/wallet', null, g);
  assert.equal(wallet.cashPaid, 90);
  assert.ok(wallet.transactions.some((x: any) => x.kind === 'subscription' && x.amount === -7));
  assert.ok(wallet.transactions.some((x: any) => x.kind === 'cash' && x.amount === 45));
});

test('cancelling a cash booking voids the unpaid days', () => {
  const s = setup();
  const { tt, g, offer } = postAndOffer(s);
  s.ok('POST', '/guide/subscription', { card: CARD }, g);
  const booking = s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'cash' }, tt);
  const after = s.ok('POST', `/bookings/${booking.id}/cancel`, { reason: 'Plans changed' }, tt);
  assert.equal(after.status, 'cancelled');
  assert.ok(after.milestones.every((m: any) => m.status === 'void'));
  assert.equal(after.money.cashDue, 0);
});

test('subscription expires and cash closes again', () => {
  const s = setup();
  const { g } = postAndOffer(s);
  s.ok('POST', '/guide/subscription', { card: CARD }, g);
  assert.equal(s.ok('GET', '/me', null, g).guide.cashOpen, true);
  s.advance(24 * 31);
  const me = s.ok('GET', '/me', null, g);
  assert.equal(me.guide.subscriptionActive, false);
  assert.equal(me.guide.cashOpen, false);
});

test('one trip a day: no offers on booked days, and confirming withdraws overlapping offers', () => {
  const s = setup();
  const tt = s.login(DEMO_ACCOUNTS.tourist);
  const other = s.login('marco@tripguide.demo');
  const ali = s.login('ali@tripguide.demo');
  const r1 = s.ok('POST', '/requests', tripBody(s.today()), tt);
  const r2 = s.ok('POST', '/requests', tripBody(s.today(), { title: 'Same days, other tourist' }), other);
  const r3 = s.ok('POST', '/requests', tripBody(s.today(), { title: 'Overlaps by one day', startDate: addDays(s.today(), 4), endDate: addDays(s.today(), 5) }), other);
  const offer = (r: any) => s.ok('POST', `/requests/${r.id}/offers`, { price: 90, plan: Array.from({ length: r.days }, (_, i) => ({ title: 'Day ' + (i + 1) + ' walk' })), message: 'Happy to show you around.' }, ali);
  const o1 = offer(r1);
  const o2 = offer(r2);
  const o3 = offer(r3);
  const b = s.ok('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, tt);
  s.ok('POST', `/bookings/${b.id}/confirm`, null, ali);
  const mine = s.ok('GET', '/offers/mine', null, ali).offers;
  assert.equal(mine.find((o: any) => o.id === o2.id).status, 'withdrawn');
  assert.equal(mine.find((o: any) => o.id === o3.id).status, 'withdrawn');
  // A new request on a booked day is marked busy and refuses an offer.
  const r4 = s.ok('POST', '/requests', tripBody(s.today(), { title: 'Day four only', startDate: addDays(s.today(), 4), endDate: addDays(s.today(), 4) }), other);
  assert.equal(s.ok('GET', `/requests/${r4.id}`, null, ali).busyForMe, true);
  assert.equal(s.call('POST', `/requests/${r4.id}/offers`, { price: 50, plan: [{ title: 'One day walk' }], message: 'Happy to show you around.' }, ali).body.error, 'busy_those_days');
  // The day after the trip is free.
  const r5 = s.ok('POST', '/requests', tripBody(s.today(), { title: 'Next free day', startDate: addDays(s.today(), 5), endDate: addDays(s.today(), 5) }), other);
  assert.equal(s.ok('GET', `/requests/${r5.id}`, null, ali).busyForMe, false);
});

test('a guide pays to be featured on the home screen; it lapses after the period', () => {
  const s = setup();
  const { g } = postAndOffer(s);
  const admin = s.login(DEMO_ACCOUNTS.admin);
  s.ok('PUT', '/admin/settings', { promotionPrice: 12, promotionDays: 7 }, admin);
  const meId = s.ok('GET', '/me', null, g).id;
  const featured = () => s.ok('GET', '/guides', null, null, { promoted: '1' }).guides.map((x: any) => x.id);
  assert.equal(s.call('POST', '/guide/promotion', { card: { ...CARD, number: '1234' } }, g).body.error, 'card_invalid');
  assert.equal(s.ok('POST', '/guide/promotion', { card: CARD }, g).active, true);
  assert.ok(featured().includes(meId));
  assert.ok(s.ok('GET', '/wallet', null, g).transactions.some((x: any) => x.kind === 'promotion' && x.amount === -12));
  s.advance(24 * 13); // past any seeded promotion plus the 7 days bought
  assert.ok(!featured().includes(meId));
});

test('a trip sent straight to one guide carries the tourist plan and stays hidden from other guides', () => {
  const s = setup();
  const tt = s.login(DEMO_ACCOUNTS.tourist);
  const g = s.login(DEMO_ACCOUNTS.guide);
  const meId = s.ok('GET', '/me', null, g).id;
  const other = s.data.guides.find((x) => x.userId !== meId && x.headline)!;
  const otherUser = s.data.users.find((u) => u.id === other.userId)!;
  const og = s.ok('POST', '/auth/login', { email: otherUser.email, password: DEMO_PASSWORD }).token as string;
  const plan = [{ title: 'Old Baghdad', details: 'Mutanabbi Street' }, { title: '', details: '' }];
  const r = s.ok('POST', '/requests', { ...tripBody(s.today()), directGuideId: meId, plan }, tt);
  assert.deepEqual(s.ok('GET', `/requests/${r.id}`, null, tt).plan, plan);
  assert.ok(s.ok('GET', '/requests', null, g).requests.some((x: any) => x.id === r.id));
  assert.ok(!s.ok('GET', '/requests', null, og).requests.some((x: any) => x.id === r.id));
  assert.equal(s.call('GET', `/requests/${r.id}`, null, og).status, 404);
  // A plan longer than the trip is refused; an empty plan is stored as none.
  assert.equal(s.call('POST', '/requests', { ...tripBody(s.today()), plan: [plan[0], plan[0], plan[0]] }, tt).body.error, 'plan_days');
  assert.deepEqual(s.ok('POST', '/requests', { ...tripBody(s.today()), plan: [{ title: '' }] }, tt).plan, []);
});

test('admin city statistics', () => {
  const s = setup();
  const admin = s.login(DEMO_ACCOUNTS.admin);
  const st = s.ok('GET', '/admin/stats', null, admin);
  assert.equal(st.cities.length, 8);
  assert.ok(st.totals.visitors > 0);
  assert.equal(st.cities.reduce((a: number, c: any) => Math.max(a, c.visitors), 0), st.cities[0].visitors);
  assert.equal(s.call('GET', '/admin/stats', null, s.login(DEMO_ACCOUNTS.tourist)).status, 403);
});

test('new accounts need a strong password', () => {
  const s = setup();
  const reg = (password: string) => s.call('POST', '/auth/register', { role: 'tourist', name: 'Pat Doe', email: password.length + 'p' + Math.random() + '@ex.com', password, country: 'Spain', gender: 'f' });
  assert.equal(reg('Ab1!').body.error, 'password_short');
  for (const weak of ['alllower1!', 'ALLUPPER1!', 'NoDigits!!', 'NoSymbol12']) assert.equal(reg(weak).body.error, 'password_weak', weak);
  assert.equal(reg('Strong#Pass9').status, 200);
});
