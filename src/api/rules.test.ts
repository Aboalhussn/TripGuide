// The rules tests of src/core/api.test.ts, run against the database-backed API: the same scenarios and the same
// assertions. Only the way a call is made differs (it is awaited), and people sign in with their phone number.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_PASSWORD, DEMO_ACCOUNTS, DEMO_EMAILS } from '../core/seed';
import { addDays } from '../core/util';
import { loadGuides } from './kernel';
import { schema } from '../db/client';
import { setupApi } from './testing';

const open: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) await s.close();
});

async function setup(start = new Date('2026-10-18T09:00:00Z')) {
  // The engine's sign-ins never expire; these scenarios jump weeks ahead, so sessions here are long.
  const s = await setupApi({ start, env: { SESSION_DAYS: '365' } });
  open.push(s);
  // What the engine tests read straight from memory, read from the database instead.
  const data = async () => {
    const users = await s.db.select().from(schema.users).orderBy(schema.users.id);
    const cards = await s.db.select().from(schema.savedCards);
    return {
      users: users.map((u) => ({ ...u, savedCard: cards.find((c) => c.userId === u.id) || null })),
      guides: await s.db.transaction((tx) => loadGuides(tx, users.filter((u) => u.role === 'guide').map((u) => u.id))),
      payments: await s.db.select().from(schema.payments),
    };
  };
  return { ...s, data };
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

test('seed: demo accounts log in and dashboards load', async () => {
  const s = await setup();
  for (const email of Object.values(DEMO_ACCOUNTS)) {
    const t = (await s.login(email));
    const d = (await s.ok('GET', '/dashboard', null, t));
    assert.ok(d.role);
  }
  const g = (await s.ok('GET', '/dashboard', null, (await s.login(DEMO_ACCOUNTS.guide))));
  assert.equal(g.awaiting.length, 1, 'Zainab has a hire to confirm');
  assert.ok(g.matching.some((r: any) => r.invitedMe), 'Zainab sees the invite');
  const t = (await s.ok('GET', '/dashboard', null, (await s.login(DEMO_ACCOUNTS.tourist))));
  assert.equal(t.releaseAsks.length, 0, 'one full payment: nothing to release day by day');
  assert.ok(t.offers.length >= 1 && t.events.length >= 1);
  assert.equal(t.toReview.length, 1);
  const zainab = (await s.ok('GET', '/guides', null, null, { q: 'Zainab' })).guides[0];
  assert.ok(zainab.stats.topGuide);
  assert.ok(zainab.stats.toursCompleted >= 14);
  const a = (await s.ok('GET', '/dashboard', null, (await s.login(DEMO_ACCOUNTS.admin))));
  assert.equal(a.openReports, 1);
  assert.equal(a.pendingVerifications, 1);
});

test('full flow: post, offer, hire, confirm, release day by day, review both ways', async () => {
  const s = await setup();
  const reg = (await s.ok('POST', '/auth/register', { role: 'tourist', name: 'Test Tourist', phone: '+34612345678', email: 'tt@example.com', password: 'Long#pass1', country: 'Spain', gender: 'f' }));
  const tt = reg.token;
  const req = (await s.ok('POST', '/requests', tripBody(s.today()), tt));
  assert.equal(req.days, 2);

  const ali = (await s.login('ali@tripguide.demo'));
  const feed = (await s.ok('GET', '/requests', null, ali, { matching: '1' }));
  assert.ok(feed.requests.some((r: any) => r.id === req.id), 'request reaches matching guides');

  // A guide outside the city cannot see it in the matching feed but can still offer from the full list.
  const offer = (await s.ok('POST', `/requests/${req.id}/offers`, { price: 90, plan: [{ title: 'Old city', details: '' }, { title: 'Museum', details: '' }], includes: ['tickets'], message: 'I would love to show you Baghdad.' }, ali));
  assert.equal((await s.call('POST', `/requests/${req.id}/offers`, { price: 90, plan: [{ title: 'a b' }, { title: 'c d' }], message: 'again and again' }, ali)).status, 409, 'one offer per guide');
  assert.equal((await s.call('POST', `/requests/${req.id}/offers`, { price: 90, plan: [{ title: 'only one day' }], message: 'wrong number of days' }, (await s.login('omar@tripguide.demo')))).body.error, 'plan_days');

  // The tourist sees the offer and a notification.
  const detail = (await s.ok('GET', `/requests/${req.id}`, null, tt));
  assert.equal(detail.offers.length, 1);
  assert.equal((await s.ok('GET', '/notifications', null, tt)).unread, 1);
  // Another tourist cannot see this request.
  assert.equal((await s.call('GET', `/requests/${req.id}`, null, (await s.login(DEMO_ACCOUNTS.tourist)))).status, 404);

  // Chat before hiring.
  const th = (await s.ok('POST', '/threads', { guideId: offer.guideId, requestId: req.id }, tt));
  (await s.ok('POST', `/threads/${th.id}/messages`, { body: 'Does this include lunch?' }, tt));
  (await s.ok('POST', `/threads/${th.id}/messages`, { body: 'Lunch is not included.' }, ali));
  assert.equal((await s.ok('GET', '/threads', null, tt)).threads[0].unread, 1);

  // Hire: payment is held.
  assert.equal((await s.call('POST', `/offers/${offer.id}/hire`, {}, tt)).body.error, 'payment_confirm_required');
  const booking = (await s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, tt));
  assert.equal(booking.paymentMethod, 'card');
  assert.equal(booking.cardLast4, '4242');
  assert.equal(booking.status, 'awaiting_guide');
  assert.equal(booking.money.held, 90);
  assert.equal(booking.milestones.length, 2);

  const confirmed = (await s.ok('POST', `/bookings/${booking.id}/confirm`, null, ali));
  assert.equal(confirmed.status, 'confirmed');
  assert.equal((await s.ok('GET', `/requests/${req.id}`, null, tt)).status, 'hired');

  // The whole payment is held by the platform: neither side can move it day by day.
  const [d1] = confirmed.milestones;
  assert.equal((await s.call('POST', `/milestones/${d1.id}/request-release`, null, ali)).body.error, 'admin_pays');
  assert.equal((await s.call('POST', `/milestones/${d1.id}/release`, null, tt)).body.error, 'admin_pays');
  assert.equal((await s.call('POST', `/milestones/${d1.id}/refund`, null, ali)).body.error, 'admin_pays');
  // Tourist cannot cancel once the tour has started.
  s.advance(24 * 3);
  assert.equal((await s.call('POST', `/bookings/${booking.id}/cancel`, {}, tt)).body.error, 'tour_started');
  // Only the admin transfers it, all at once.
  const admin0 = (await s.login(DEMO_ACCOUNTS.admin));
  assert.equal((await s.call('POST', `/admin/bookings/${booking.id}/payout`, null, tt)).status, 403);
  const due = (await s.ok('GET', '/admin/payouts', null, admin0)).waiting.find((x: any) => x.id === booking.id);
  assert.deepEqual([due.held, due.fee, due.toGuide], [90, 9, 81]);
  const b = (await s.ok('POST', `/admin/bookings/${booking.id}/payout`, null, admin0));
  assert.equal(b.status, 'completed');
  assert.equal(b.money.released, 90);
  assert.equal(b.money.fee, 9);
  assert.equal((await s.call('POST', `/admin/bookings/${booking.id}/payout`, null, admin0)).body.error, 'booking_state');

  const wallet = (await s.ok('GET', '/wallet', null, ali));
  assert.ok(wallet.released >= 81);

  // Reviews stay hidden until both are in.
  (await s.ok('POST', `/bookings/${booking.id}/review`, { ratings: { knowledge: 5, communication: 5, punctuality: 4, value: 5 }, hireAgain: true, comment: 'Wonderful two days.' }, tt));
  let view = (await s.ok('GET', `/bookings/${booking.id}`, null, ali));
  assert.equal(view.theirReview, null);
  assert.equal(view.theirReviewPending, true);
  (await s.ok('POST', `/bookings/${booking.id}/review`, { ratings: { communication: 5, punctuality: 5, respect: 5 }, hireAgain: true, comment: 'Great guests, very kind.' }, ali));
  view = (await s.ok('GET', `/bookings/${booking.id}`, null, ali));
  assert.equal(view.theirReview.overall, 4.8);
  assert.equal((await s.call('POST', `/bookings/${booking.id}/review`, { ratings: { communication: 5, punctuality: 5, respect: 5 }, comment: 'twice twice' }, ali)).status, 409);
});

test('direct hire from a profile goes only to that guide', async () => {
  const s = await setup();
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const sara = (await s.ok('GET', '/guides', null, null, { q: 'Sara' })).guides[0];
  const req = (await s.ok('POST', '/requests', tripBody(s.today(), { cities: ['erbil'], directGuideId: sara.id }), tt));
  const ali = (await s.login('ali@tripguide.demo'));
  assert.ok(!(await s.ok('GET', '/requests', null, ali)).requests.some((r: any) => r.id === req.id));
  assert.equal((await s.call('POST', `/requests/${req.id}/offers`, { price: 100, plan: [{ title: 'one one' }, { title: 'two two' }], message: 'let me in please' }, ali)).status, 404);
  const saraTok = (await s.login('sara@tripguide.demo'));
  assert.ok((await s.ok('GET', '/requests', null, saraTok)).requests.some((r: any) => r.id === req.id));
});

test('an unconfirmed hire lapses after 48 hours and the money returns', async () => {
  const s = await setup();
  const tt = (await s.login('marco@tripguide.demo'));
  const bookings = (await s.ok('GET', '/bookings', null, tt)).bookings;
  const pending = bookings.find((b: any) => b.status === 'awaiting_guide');
  assert.ok(pending);
  s.advance(49);
  const after = (await s.ok('GET', `/bookings/${pending.id}`, null, tt));
  assert.equal(after.status, 'expired');
  assert.equal(after.money.held, 0);
  assert.equal(after.money.refunded, 130);
  const req = (await s.ok('GET', `/requests/${after.requestId}`, null, tt));
  assert.equal(req.status, 'open');
});

test('guide declining reopens the request and refunds', async () => {
  const s = await setup();
  const z = (await s.login(DEMO_ACCOUNTS.guide));
  const pending = (await s.ok('GET', '/dashboard', null, z)).awaiting[0];
  const b = (await s.ok('POST', `/bookings/${pending.id}/decline`, null, z));
  assert.equal(b.status, 'declined');
  assert.equal(b.money.refunded, 130);
});

test('report and admin refund', async () => {
  const s = await setup();
  const admin = (await s.login(DEMO_ACCOUNTS.admin));
  const reports = (await s.ok('GET', '/admin/reports', null, admin)).reports;
  assert.equal(reports.length, 1);
  (await s.ok('POST', `/admin/reports/${reports[0].id}/resolve`, { action: 'refund', note: 'Guide did not show up.', suspend: true }, admin));
  const reza = (await s.login('reza@tripguide.demo'));
  const b = (await s.ok('GET', `/bookings/${reports[0].bookingId}`, null, reza));
  assert.equal(b.status, 'cancelled');
  assert.equal(b.money.refunded, 55);
  assert.equal((await s.call('POST', '/auth/login', { phone: s.phoneOf('hamid@tripguide.demo'), password: DEMO_PASSWORD })).status, 200);
  const hamidTok = (await s.login('hamid@tripguide.demo'));
  assert.equal((await s.call('POST', '/threads', { touristId: 1 }, hamidTok)).body.error, 'account_suspended');
});

test('guide sign-up, profile, verification approved by admin', async () => {
  const s = await setup();
  const g = (await s.ok('POST', '/auth/register', { role: 'guide', name: 'New Guide', phone: '+9647801234567', email: 'new@guide.iq', password: 'Guide#2026', country: 'Iraq', gender: 'm' })).token;
  const profile = { headline: 'Basra boat tours', bio: 'I run boat trips on the Shatt al-Arab and in the marshes for small groups.', cities: ['basra'], pricePerDay: 45, languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'good' }], specialities: ['nature'] };
  // Identity first: the profile, price and bio are locked until the admin approves.
  assert.equal((await s.call('PUT', '/guide/profile', profile, g)).body.error, 'verify_first');
  const img = 'data:image/jpeg;base64,' + 'D'.repeat(300);
  assert.equal((await s.call('POST', '/guide/verification', { idFront: img, idBack: img }, g)).body.error, 'field_required');
  assert.equal((await s.call('POST', '/guide/verification', { idFront: img, idBack: img, residence: 'residence.pdf' }, g)).body.error, 'photo_invalid');
  const me = (await s.ok('POST', '/guide/verification', { idFront: img, idBack: img, residence: img }, g));
  assert.equal(me.guide.verification, 'pending');
  assert.equal(me.guide.verificationPhotos, undefined); // the photos never travel back
  assert.equal((await s.call('PUT', '/guide/profile', profile, g)).body.error, 'verify_first');
  const admin = (await s.login(DEMO_ACCOUNTS.admin));
  const queue = (await s.ok('GET', '/admin/verifications', null, admin)).guides;
  const mine = queue.find((x: any) => x.name === 'New Guide');
  assert.ok(mine);
  assert.ok(await s.sameImage(mine.photos.residence, img)); // only the admin sees them
  assert.equal((await s.ok('GET', `/guides/${mine.id}`)).verificationPhotos, undefined);
  (await s.ok('POST', `/admin/guides/${mine.id}/verify`, { approve: true }, admin));
  (await s.ok('PUT', '/guide/profile', profile, g));
  assert.equal((await s.ok('GET', `/guides/${mine.id}`)).verification, 'verified');
  assert.ok((await s.ok('GET', '/guides', null, null, { city: 'basra', verified: '1' })).guides.some((x: any) => x.id === mine.id));
});

test('validation: past dates, bad budget, login required', async () => {
  const s = await setup();
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  assert.equal((await s.call('POST', '/requests', tripBody(s.today(), { startDate: addDays(s.today(), -2) }), tt)).body.error, 'date_past');
  assert.equal((await s.call('POST', '/requests', tripBody(s.today(), { budgetMin: 300, budgetMax: 100 }), tt)).body.error, 'budget_order');
  assert.equal((await s.call('POST', '/requests', tripBody(s.today()))).status, 401);
  assert.equal((await s.call('POST', '/requests', tripBody(s.today()), (await s.login(DEMO_ACCOUNTS.guide)))).status, 403);
  assert.equal((await s.call('GET', '/nope')).status, 404);
});

test('search filters: availability on dates excludes booked guides', async () => {
  const s = await setup();
  const today = s.today();
  const free = (await s.ok('GET', '/guides', null, null, { city: 'baghdad', from: addDays(today, 10), to: addDays(today, 11) })).guides;
  assert.ok(!free.some((g: any) => g.name === 'Zainab Al-Rubaie'), 'Zainab is booked with James');
  const later = (await s.ok('GET', '/guides', null, null, { city: 'baghdad', from: addDays(today, 60), to: addDays(today, 61) })).guides;
  assert.ok(later.some((g: any) => g.name === 'Zainab Al-Rubaie'));
  const ar = (await s.ok('GET', '/guides', null, null, { lang: 'ur' })).guides;
  assert.deepEqual(ar.map((g: any) => g.name), ['Hussein Al-Musawi']);
});

// ---------- payment methods ----------
async function postAndOffer(s: Awaited<ReturnType<typeof setup>>, guideEmail = 'ali@tripguide.demo') {
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const req = (await s.ok('POST', '/requests', tripBody(s.today()), tt));
  const g = (await s.login(guideEmail));
  const offer = (await s.ok('POST', `/requests/${req.id}/offers`, { price: 90, plan: [{ title: 'Day one walk' }, { title: 'Day two walk' }], message: 'Happy to show you around.' }, g));
  return { tt, g, req, offer };
}

test('card payment: bad, expired and declined cards are refused; nothing is booked', async () => {
  const s = await setup();
  const { tt, offer } = (await postAndOffer(s));
  const hire = async (card: any) => (await s.call('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'card', card }, tt));
  assert.equal((await hire({ ...CARD, number: '4242 4242 4242 4241' })).body.error, 'card_invalid');
  assert.equal((await hire({ ...CARD, expiry: '01/20' })).body.error, 'card_expired');
  assert.equal((await hire({ ...CARD, cvc: '1' })).body.error, 'card_cvc_invalid');
  assert.equal((await hire({ ...CARD, name: '' })).body.error, 'card_name_required');
  const declined = (await hire({ ...CARD, number: '4000 0000 0000 0002' }));
  assert.equal(declined.status, 402);
  assert.equal(declined.body.error, 'card_declined');
  assert.equal((await s.ok('GET', `/requests/${offer.requestId}`, null, tt)).status, 'open');
  assert.equal((await s.data()).payments.filter((p) => p.purpose === 'booking').length, 0);
});

test('cash needs the guide to subscribe; then the guide confirms cash day by day', async () => {
  const s = await setup();
  const { tt, g, offer } = (await postAndOffer(s));
  // Ali has no subscription yet, so cash is not offered.
  (await s.ok('PUT', '/guide/profile', { acceptsCash: true }, g));
  assert.equal((await s.call('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'cash' }, tt)).body.error, 'cash_not_accepted');
  // The admin sets the price; Ali subscribes by card.
  const admin = (await s.login(DEMO_ACCOUNTS.admin));
  assert.equal((await s.ok('PUT', '/admin/settings', { guideSubscriptionPrice: 7, subscriptionDays: 30 }, admin)).guideSubscriptionPrice, 7);
  assert.equal((await s.call('PUT', '/admin/settings', { guideSubscriptionPrice: 7 }, tt)).status, 403);
  assert.equal((await s.call('POST', '/guide/subscription', { card: { ...CARD, number: '1234' } }, g)).body.error, 'card_invalid');
  const sub = (await s.ok('POST', '/guide/subscription', { card: CARD }, g));
  assert.equal(sub.active, true);
  assert.equal((await s.ok('GET', '/guide/subscription', null, g)).history[0].amount, 7);
  assert.equal((await s.ok('GET', '/me', null, g)).guide.cashOpen, true);
  // The tourist now sees "cash accepted" and hires paying cash.
  const view = (await s.ok('GET', `/requests/${offer.requestId}`, null, tt));
  assert.equal(view.offers.find((o: any) => o.id === offer.id).guide.acceptsCash, true);
  const booking = (await s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'cash' }, tt));
  assert.equal(booking.paymentMethod, 'cash');
  assert.equal(booking.feeRate, 0);
  assert.equal(booking.money.held, 0);
  assert.equal(booking.money.cashDue, 90);
  const confirmed = (await s.ok('POST', `/bookings/${booking.id}/confirm`, null, g));
  const [d1, d2] = confirmed.milestones;
  assert.equal(d1.status, 'cash_due');
  // Not before the day, and the tourist cannot mark it.
  assert.equal((await s.call('POST', `/milestones/${d1.id}/cash-received`, null, g)).body.error, 'day_not_reached');
  s.advance(24 * 3);
  assert.equal((await s.call('POST', `/milestones/${d1.id}/cash-received`, null, tt)).status, 403);
  assert.equal((await s.call('POST', `/milestones/${d1.id}/release`, null, tt)).body.error, 'milestone_state');
  let b = (await s.ok('POST', `/milestones/${d1.id}/cash-received`, null, g));
  assert.equal(b.money.cashPaid, 45);
  assert.equal(b.status, 'confirmed');
  s.advance(24);
  b = (await s.ok('POST', `/milestones/${d2.id}/cash-received`, null, g));
  assert.equal(b.status, 'completed');
  const wallet = (await s.ok('GET', '/wallet', null, g));
  assert.equal(wallet.cashPaid, 90);
  assert.ok(wallet.transactions.some((x: any) => x.kind === 'subscription' && x.amount === -7));
  assert.ok(wallet.transactions.some((x: any) => x.kind === 'cash' && x.amount === 45));
});

test('cancelling a cash booking voids the unpaid days', async () => {
  const s = await setup();
  const { tt, g, offer } = (await postAndOffer(s));
  (await s.ok('POST', '/guide/subscription', { card: CARD }, g));
  const booking = (await s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'cash' }, tt));
  const after = (await s.ok('POST', `/bookings/${booking.id}/cancel`, { reason: 'Plans changed' }, tt));
  assert.equal(after.status, 'cancelled');
  assert.ok(after.milestones.every((m: any) => m.status === 'void'));
  assert.equal(after.money.cashDue, 0);
});

test('subscription expires and cash closes again', async () => {
  const s = await setup();
  const { g } = (await postAndOffer(s));
  (await s.ok('POST', '/guide/subscription', { card: CARD }, g));
  assert.equal((await s.ok('GET', '/me', null, g)).guide.cashOpen, true);
  s.advance(24 * 31);
  const me = (await s.ok('GET', '/me', null, g));
  assert.equal(me.guide.subscriptionActive, false);
  assert.equal(me.guide.cashOpen, false);
});

test('one trip a day: no offers on booked days, and confirming withdraws overlapping offers', async () => {
  const s = await setup();
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const other = (await s.login('marco@tripguide.demo'));
  const ali = (await s.login('ali@tripguide.demo'));
  const r1 = (await s.ok('POST', '/requests', tripBody(s.today()), tt));
  const r2 = (await s.ok('POST', '/requests', tripBody(s.today(), { title: 'Same days, other tourist' }), other));
  const r3 = (await s.ok('POST', '/requests', tripBody(s.today(), { title: 'Overlaps by one day', startDate: addDays(s.today(), 4), endDate: addDays(s.today(), 5) }), other));
  const offer = async (r: any) => (await s.ok('POST', `/requests/${r.id}/offers`, { price: 90, plan: Array.from({ length: r.days }, (_, i) => ({ title: 'Day ' + (i + 1) + ' walk' })), message: 'Happy to show you around.' }, ali));
  const o1 = (await offer(r1));
  const o2 = (await offer(r2));
  const o3 = (await offer(r3));
  const b = (await s.ok('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, tt));
  (await s.ok('POST', `/bookings/${b.id}/confirm`, null, ali));
  const mine = (await s.ok('GET', '/offers/mine', null, ali)).offers;
  assert.equal(mine.find((o: any) => o.id === o2.id).status, 'withdrawn');
  assert.equal(mine.find((o: any) => o.id === o3.id).status, 'withdrawn');
  // A new request on a booked day is marked busy and refuses an offer.
  const r4 = (await s.ok('POST', '/requests', tripBody(s.today(), { title: 'Day four only', startDate: addDays(s.today(), 4), endDate: addDays(s.today(), 4) }), other));
  assert.equal((await s.ok('GET', `/requests/${r4.id}`, null, ali)).busyForMe, true);
  assert.equal((await s.call('POST', `/requests/${r4.id}/offers`, { price: 50, plan: [{ title: 'One day walk' }], message: 'Happy to show you around.' }, ali)).body.error, 'busy_those_days');
  // The day after the trip is free.
  const r5 = (await s.ok('POST', '/requests', tripBody(s.today(), { title: 'Next free day', startDate: addDays(s.today(), 5), endDate: addDays(s.today(), 5) }), other));
  assert.equal((await s.ok('GET', `/requests/${r5.id}`, null, ali)).busyForMe, false);
});

test('a guide pays to be featured on the home screen; it lapses after the period', async () => {
  const s = await setup();
  const { g } = (await postAndOffer(s));
  const admin = (await s.login(DEMO_ACCOUNTS.admin));
  (await s.ok('PUT', '/admin/settings', { promotionPrice: 12, promotionDays: 7 }, admin));
  const meId = (await s.ok('GET', '/me', null, g)).id;
  const featured = async () => (await s.ok('GET', '/guides', null, null, { promoted: '1' })).guides.map((x: any) => x.id);
  assert.equal((await s.call('POST', '/guide/promotion', { card: { ...CARD, number: '1234' } }, g)).body.error, 'card_invalid');
  assert.equal((await s.ok('POST', '/guide/promotion', { card: CARD }, g)).active, true);
  assert.ok((await featured()).includes(meId));
  assert.ok((await s.ok('GET', '/wallet', null, g)).transactions.some((x: any) => x.kind === 'promotion' && x.amount === -12));
  s.advance(24 * 13); // past any seeded promotion plus the 7 days bought
  assert.ok(!(await featured()).includes(meId));
});

test('a trip sent straight to one guide carries the tourist plan and stays hidden from other guides', async () => {
  const s = await setup();
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const g = (await s.login(DEMO_ACCOUNTS.guide));
  const meId = (await s.ok('GET', '/me', null, g)).id;
  const other = (await s.data()).guides.find((x) => x.userId !== meId && x.headline)!;
  const otherUser = (await s.data()).users.find((u) => u.id === other.userId)!;
  const og = (await s.ok('POST', '/auth/login', { phone: otherUser.phone, password: DEMO_PASSWORD })).token as string;
  const plan = [{ title: 'Old Baghdad', details: 'Mutanabbi Street' }, { title: '', details: '' }];
  const r = (await s.ok('POST', '/requests', { ...tripBody(s.today()), directGuideId: meId, plan }, tt));
  assert.deepEqual((await s.ok('GET', `/requests/${r.id}`, null, tt)).plan, plan);
  assert.ok((await s.ok('GET', '/requests', null, g)).requests.some((x: any) => x.id === r.id));
  assert.ok(!(await s.ok('GET', '/requests', null, og)).requests.some((x: any) => x.id === r.id));
  assert.equal((await s.call('GET', `/requests/${r.id}`, null, og)).status, 404);
  // A plan longer than the trip is refused; an empty plan is stored as none.
  assert.equal((await s.call('POST', '/requests', { ...tripBody(s.today()), plan: [plan[0], plan[0], plan[0]] }, tt)).body.error, 'plan_days');
  assert.deepEqual((await s.ok('POST', '/requests', { ...tripBody(s.today()), plan: [{ title: '' }] }, tt)).plan, []);
});

test('admin city statistics', async () => {
  const s = await setup();
  const admin = (await s.login(DEMO_ACCOUNTS.admin));
  const st = (await s.ok('GET', '/admin/stats', null, admin));
  assert.equal(st.cities.length, 8);
  assert.ok(st.totals.visitors > 0);
  assert.equal(st.cities.reduce((a: number, c: any) => Math.max(a, c.visitors), 0), st.cities[0].visitors);
  assert.equal((await s.call('GET', '/admin/stats', null, (await s.login(DEMO_ACCOUNTS.tourist)))).status, 403);
});

test('new accounts need a strong password', async () => {
  const s = await setup();
  let n = 0;
  const reg = async (password: string) => (await s.call('POST', '/auth/register', { role: 'tourist', name: 'Pat Doe', phone: '+3461234567' + n++, email: password.length + 'p' + Math.random() + '@ex.com', password, country: 'Spain', gender: 'f' }));
  assert.equal((await reg('Ab1!')).body.error, 'password_short');
  for (const weak of ['alllower1!', 'ALLUPPER1!', 'NoDigits!!', 'NoSymbol12']) assert.equal((await reg(weak)).body.error, 'password_weak', weak);
  assert.equal((await reg('Strong#Pass9')).status, 200);
});

test('profile photo, cover photo, and a tour photo added from the + button', async () => {
  const s = await setup();
  const g = (await s.login(DEMO_ACCOUNTS.guide));
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(200);
  const me = (await s.ok('PUT', '/me', { avatar: img, cover: img }, g));
  assert.ok(await s.sameImage(me.avatar, img));
  assert.ok(await s.sameImage((await s.ok('GET', `/guides/${me.id}`)).avatar, img));
  assert.ok(await s.sameImage((await s.ok('GET', `/guides/${me.id}`)).cover, img));
  assert.equal((await s.call('PUT', '/me', { avatar: 'http://x/y.jpg' }, g)).body.error, 'photo_invalid');
  assert.equal((await s.ok('PUT', '/me', { avatar: null }, g)).avatar, null);
  const before = (await s.ok('GET', `/guides/${me.id}`)).photos.length;
  (await s.ok('POST', '/guide/photos', { img, caption: 'Sunrise at Babylon' }, g));
  const photos = (await s.ok('GET', `/guides/${me.id}`)).photos;
  assert.equal(photos.length, before + 1);
  assert.equal(photos.at(-1).caption, 'Sunrise at Babylon');
  assert.equal((await s.call('POST', '/guide/photos', { img }, (await s.login(DEMO_ACCOUNTS.tourist)))).status, 403);
});

test('hire flow: the guide page knows the pending offer and booking; cancelling before confirmation reopens the trip', async () => {
  const s = await setup();
  const { tt, g, offer, req: r } = (await postAndOffer(s));
  const gid = (await s.ok('GET', '/me', null, g)).id;
  let me = (await s.ok('GET', `/guides/${gid}`, null, tt)).forMe;
  assert.equal(me.offer.id, offer.id);
  assert.equal(me.booking, null);
  const b = (await s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, card: CARD }, tt));
  me = (await s.ok('GET', `/guides/${gid}`, null, tt)).forMe;
  assert.equal(me.booking.id, b.id);
  assert.notEqual(me.offer?.id, offer.id); // the hired offer is no longer offered
  const req = (await s.ok('GET', `/requests/${r.id}`, null, tt));
  assert.equal(req.status, 'awarded');
  assert.equal(req.booking.guideId, gid);
  assert.ok(req.booking.confirmBy);
  (await s.ok('POST', `/bookings/${b.id}/cancel`, {}, tt));
  assert.equal((await s.ok('GET', `/requests/${r.id}`, null, tt)).status, 'open');
  // A trip already posted can be sent to another guide instead of typing it again.
  const other = (await s.data()).guides.find((x) => x.userId !== gid && x.headline)!;
  const sendable = (await s.ok('GET', `/guides/${other.userId}`, null, tt)).forMe.openRequests;
  assert.ok(sendable.some((x: any) => x.id === r.id));
  (await s.ok('POST', `/requests/${r.id}/invite`, { guideId: other.userId }, tt));
  assert.ok((await s.ok('GET', `/guides/${other.userId}`, null, tt)).forMe.openRequests.find((x: any) => x.id === r.id).invited);
});

test('strict limits: trips up to 10 people, 3 languages, 4 cities; the admin sets the dinar rate', async () => {
  const s = await setup();
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const base = tripBody(s.today());
  assert.equal((await s.call('POST', '/requests', { ...base, groupSize: 11 }, tt)).body.error, 'field_range');
  assert.equal((await s.ok('POST', '/requests', { ...base, groupSize: 10 }, tt)).groupSize, 10);
  assert.equal((await s.call('POST', '/requests', { ...base, languages: ['en', 'ar', 'fr', 'de'] }, tt)).body.error, 'field_too_long');
  assert.equal((await s.call('POST', '/requests', { ...base, cities: ['baghdad', 'babylon', 'najaf', 'karbala', 'basra'] }, tt)).body.error, 'field_too_long');
  const admin = (await s.login(DEMO_ACCOUNTS.admin));
  (await s.ok('PUT', '/admin/settings', { iqdPerUsd: 1500 }, admin));
  assert.equal((await s.ok('GET', '/meta')).iqdPerUsd, 1500);
  assert.equal((await s.call('PUT', '/admin/settings', { iqdPerUsd: 5 }, admin)).status, 400);
});

test('a saved card: kept without the full number, used to pay, and removable', async () => {
  const s = await setup();
  const { tt, offer } = (await postAndOffer(s));
  assert.equal((await s.call('PUT', '/me/card', { ...CARD, number: '1234' }, tt)).body.error, 'card_invalid');
  const me = (await s.ok('PUT', '/me/card', CARD, tt));
  assert.deepEqual(me.savedCard, { brand: 'Visa', last4: '4242', name: 'Test Tourist', expiry: '12/30' });
  assert.ok(!JSON.stringify((await s.data()).users).includes('4242424242424242'));
  const b = (await s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, method: 'card', card: { saved: true } }, tt));
  assert.equal(b.cardLast4, '4242');
  assert.equal((await s.ok('DELETE', '/me/card', null, tt)).savedCard, null);
  const g = (await s.login(DEMO_ACCOUNTS.guide));
  assert.equal((await s.ok('PUT', '/me/card', CARD, g)).savedCard.last4, '4242');
});

test('changing name, country and email from the profile; a taken email is refused', async () => {
  const s = await setup();
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const me = (await s.ok('PUT', '/me', { name: 'Hannah Weber', country: 'Austria', email: 'Hannah.New@Example.com' }, tt));
  assert.equal(me.email, 'hannah.new@example.com');
  assert.equal(me.country, 'Austria');
  assert.equal((await s.call('PUT', '/me', { email: 'not-an-email' }, tt)).body.error, 'email_invalid');
  assert.equal((await s.call('PUT', '/me', { email: DEMO_EMAILS.guide }, tt)).body.error, 'email_taken');
});

test('trip cover: picked from the chosen governorates, checked by the server, with a default', async () => {
  const s = await setup();
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const base = { ...tripBody(s.today()), cities: ['babylon'] };
  assert.equal((await s.ok('POST', '/requests', { ...base, cover: 'ishtar.jpg' }, tt)).cover, 'ishtar.jpg');
  assert.equal((await s.ok('POST', '/requests', base, tt)).cover, 'babylon.jpg');
  assert.equal((await s.call('POST', '/requests', { ...base, cover: 'malwiya.jpg' }, tt)).body.error, 'field_invalid');
  // A governorate without its own photos yet offers the general heritage photos.
  assert.equal((await s.ok('POST', '/requests', { ...base, cities: ['basra'], cover: 'ziggurat.jpg' }, tt)).cover, 'ziggurat.jpg');
  // Older trips without a cover get their first city's picture.
  assert.ok((await s.ok('GET', '/requests/mine', null, tt)).requests.every((r: any) => typeof r.cover === 'string' && r.cover.length > 0));
});

test('governorates: the admin adds one with places and photos; tourists can then pick it and its photos', async () => {
  const s = await setup();
  const ad = (await s.login(DEMO_ACCOUNTS.admin));
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const img = 'data:image/jpeg;base64,' + 'B'.repeat(300);
  const body = { name: 'Dhi Qar', nameAr: 'ذي قار', places: [{ name: 'Ziggurat of Ur', nameAr: 'زقورة أور', kind: 'archaeological' }], covers: [img, 'ziggurat.jpg'] };
  assert.equal((await s.call('POST', '/admin/cities', body, tt)).status, 403);
  assert.equal((await s.call('POST', '/admin/cities', { ...body, covers: [] }, ad)).body.error, 'field_required');
  assert.equal((await s.call('POST', '/admin/cities', { ...body, covers: ['http://x/y.jpg'] }, ad)).body.error, 'photo_invalid');
  const c = (await s.ok('POST', '/admin/cities', body, ad));
  assert.equal(c.slug, 'dhi-qar');
  assert.match(c.covers[0], /^m:\d+$/);
  assert.equal((await s.call('POST', '/admin/cities', { ...body, name: 'Other' }, ad)).body.error, 'city_exists');
  const meta = (await s.ok('GET', '/meta'));
  assert.ok(meta.cities.some((x: any) => x.slug === 'dhi-qar'));
  assert.ok(await s.sameImage(meta.media[c.covers[0]], img));
  const place = meta.places.find((p: any) => p.city === 'dhi-qar');
  assert.equal(place.nameAr, 'زقورة أور');
  // A tourist posts a trip there with the admin's photo as cover; other pictures are refused.
  const trip = (await s.ok('POST', '/requests', { ...tripBody(s.today()), cities: ['dhi-qar'], places: [place.id], cover: c.covers[0] }, tt));
  assert.equal(trip.cover, c.covers[0]);
  assert.equal((await s.call('POST', '/requests', { ...tripBody(s.today()), cities: ['dhi-qar'], cover: 'babylon.jpg' }, tt)).body.error, 'field_invalid');
  // Editing keeps known photos and place ids, adds new ones, and adds photos to built-in governorates too.
  const ed = (await s.ok('PUT', '/admin/cities/dhi-qar', { ...body, places: [{ ...place }, { name: 'Ahwar', nameAr: 'الأهوار', kind: 'nature' }], covers: [c.covers[1]] }, ad));
  assert.deepEqual(ed.covers, ['ziggurat.jpg']);
  assert.equal(ed.places.length, 2);
  assert.equal(ed.places[0].id, place.id);
  const bg = (await s.ok('GET', '/admin/cities/baghdad', null, ad));
  const bg2 = (await s.ok('PUT', '/admin/cities/baghdad', { name: bg.name, nameAr: bg.nameAr, places: bg.places, covers: [img] }, ad));
  assert.equal(bg2.covers.length, 1);
  assert.equal(bg2.places.length, bg.places.length);
  assert.ok((await s.ok('GET', '/meta')).cityCovers.baghdad[0].startsWith('m:'));
});

test('trip cover: each governorate brings its photos, one without photos brings the general ones; no pick = first photo', async () => {
  const s = await setup();
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const base = { ...tripBody(s.today()), cities: ['babylon', 'baghdad'] };
  assert.equal((await s.ok('POST', '/requests', { ...base, cover: 'ziggurat.jpg' }, tt)).cover, 'ziggurat.jpg'); // Baghdad has no own photos yet
  assert.equal((await s.ok('POST', '/requests', { ...base, cover: 'gate.jpg' }, tt)).cover, 'gate.jpg');
  assert.equal((await s.ok('POST', '/requests', { ...base, cover: '' }, tt)).cover, 'babylon.jpg');
});

test('travel passport: tourists add photo memories; anyone who opens their profile sees them', async () => {
  const s = await setup();
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const g = (await s.login(DEMO_ACCOUNTS.guide));
  const me = (await s.ok('GET', '/me', null, tt));
  const before = me.passport.pages.length;
  assert.match(me.passport.number, /^TG-\d{6}$/);
  const img = 'data:image/jpeg;base64,' + 'C'.repeat(300);
  const page = { img, place: 'Ishtar Gate', city: 'babylon', date: s.today(), note: 'Blue tiles!' };
  assert.equal((await s.call('POST', '/me/passport', page, g)).status, 403);
  assert.equal((await s.call('POST', '/me/passport', { ...page, img: 'http://x/y.jpg' }, tt)).body.error, 'photo_invalid');
  assert.equal((await s.call('POST', '/me/passport', { ...page, city: 'atlantis' }, tt)).body.error, 'field_invalid');
  assert.equal((await s.call('POST', '/me/passport', { ...page, date: '2999-01-01' }, tt)).body.error, 'date_future');
  const pp = (await s.ok('POST', '/me/passport', page, tt));
  assert.equal(pp.pages.length, before + 1);
  assert.equal(pp.pages.at(-1).place, 'Ishtar Gate'); // oldest first, so today's is last
  const seen = (await s.ok('GET', `/users/${me.id}`, null, g)).passport;
  assert.equal(seen.pages.length, before + 1);
  const id = pp.pages.at(-1).id;
  assert.equal((await s.ok('DELETE', `/me/passport/${id}`, null, tt)).pages.length, before);
  assert.equal((await s.call('DELETE', `/me/passport/${id}`, null, tt)).status, 404);
});

test('wallet: a guide withdraws released earnings to a saved card; a tourist keeps refunds in the wallet until withdrawing', async () => {
  const s = await setup();
  const { tt, g, offer } = (await postAndOffer(s));
  const b = (await s.ok('POST', `/offers/${offer.id}/hire`, { confirmPayment: true, card: CARD }, tt));
  (await s.ok('POST', `/bookings/${b.id}/confirm`, null, g));
  (await s.ok('POST', `/admin/bookings/${b.id}/payout`, null, (await s.login(DEMO_ACCOUNTS.admin)))); // the admin transfers the full payment
  // A second trip the guide declines: the tourist's full payment comes back to their wallet.
  const second = (await postAndOffer(s, 'omar@tripguide.demo'));
  const b2 = (await s.ok('POST', `/offers/${second.offer.id}/hire`, { confirmPayment: true, card: CARD }, tt));
  (await s.ok('POST', `/bookings/${b2.id}/decline`, null, second.g));
  const m2 = { amount: 90 };
  // Guide: earnings after the fee are ready to withdraw, but only to a saved card.
  let gw = (await s.ok('GET', '/wallet', null, g));
  assert.ok(gw.available > 0);
  assert.equal((await s.call('POST', '/wallet/withdraw', {}, g)).body.error, 'card_required');
  (await s.ok('PUT', '/me/card', { number: '4242424242424242', name: 'Guide Card', expiry: '12/30', cvc: '123' }, g));
  assert.equal((await s.call('POST', '/wallet/withdraw', { amount: gw.available + 50 }, g)).body.error, 'withdraw_too_much');
  const out = (await s.ok('POST', '/wallet/withdraw', {}, g));
  assert.equal(out.available, 0);
  assert.equal(out.withdrawal.amount, gw.available);
  gw = (await s.ok('GET', '/wallet', null, g));
  assert.ok(gw.transactions.some((x: any) => x.kind === 'withdrawn' && x.amount === -out.withdrawal.amount));
  assert.equal((await s.call('POST', '/wallet/withdraw', {}, g)).body.error, 'nothing_to_withdraw');
  // Tourist: the refund stays in the wallet; withdrawing part of it leaves the rest.
  const tw = (await s.ok('GET', '/wallet', null, tt));
  assert.equal(tw.available, m2.amount);
  (await s.ok('PUT', '/me/card', { number: '4242424242424242', name: 'Tourist Card', expiry: '12/30', cvc: '123' }, tt));
  assert.equal((await s.ok('POST', '/wallet/withdraw', { amount: 10 }, tt)).available, Math.round((m2.amount - 10) * 100) / 100);
});

test('passwords: forgot sends a code (shown in the demo), reset signs in with the new one; change needs the current one', async () => {
  const s = await setup();
  assert.deepEqual((await s.ok('POST', '/auth/forgot', { phone: '+9647809999999' })), { sent: true }); // same answer for unknown numbers
  const f = (await s.ok('POST', '/auth/forgot', { phone: DEMO_ACCOUNTS.tourist }));
  assert.match(f.demoCode, /^\d{6}$/);
  const wrong = f.demoCode === '000000' ? '111111' : '000000';
  assert.equal((await s.call('POST', '/auth/reset', { phone: DEMO_ACCOUNTS.tourist, code: wrong, password: 'New#Pass123' })).body.error, 'reset_code_invalid');
  assert.equal((await s.call('POST', '/auth/reset', { phone: DEMO_ACCOUNTS.tourist, code: f.demoCode, password: 'weak' })).body.error, 'password_short');
  const r = (await s.ok('POST', '/auth/reset', { phone: DEMO_ACCOUNTS.tourist, code: f.demoCode, password: 'New#Pass123' }));
  assert.ok(r.token);
  assert.equal((await s.call('POST', '/auth/reset', { phone: DEMO_ACCOUNTS.tourist, code: f.demoCode, password: 'Other#Pass1' })).body.error, 'reset_code_invalid'); // used once
  assert.equal((await s.call('POST', '/auth/login', { phone: DEMO_ACCOUNTS.tourist, password: 'Demo@1234' })).status, 401);
  const tk = (await s.ok('POST', '/auth/login', { phone: DEMO_ACCOUNTS.tourist, password: 'New#Pass123' })).token;
  assert.equal((await s.call('POST', '/me/password', { current: 'nope', password: 'Third#Pass1' }, tk)).body.error, 'password_wrong');
  assert.equal((await s.call('POST', '/me/password', { current: 'New#Pass123', password: 'New#Pass123' }, tk)).body.error, 'password_same');
  (await s.ok('POST', '/me/password', { current: 'New#Pass123', password: 'Third#Pass1' }, tk));
  assert.equal((await s.call('POST', '/auth/login', { phone: DEMO_ACCOUNTS.tourist, password: 'Third#Pass1' })).status, 200);
});

test('special events: the admin adds them, tourists see upcoming ones on their home with their offers', async () => {
  const s = await setup();
  const ad = (await s.login(DEMO_ACCOUNTS.admin));
  const tt = (await s.login(DEMO_ACCOUNTS.tourist));
  const today = s.today();
  const body = { title: 'Date Harvest Festival', titleAr: 'مهرجان التمور', city: 'basra', venue: 'Corniche', venueAr: 'الكورنيش', startDate: addDays(today, 5), endDate: addDays(today, 7), description: 'Dates, music and boats.', descriptionAr: 'تمور وموسيقى وقوارب.', img: 'data:image/jpeg;base64,' + 'E'.repeat(300) };
  assert.equal((await s.call('POST', '/admin/events', body, tt)).status, 403);
  assert.equal((await s.call('POST', '/admin/events', { ...body, endDate: addDays(today, 2) }, ad)).body.error, 'field_invalid');
  assert.equal((await s.call('POST', '/admin/events', { ...body, city: 'atlantis' }, ad)).body.error, 'field_invalid');
  const e = (await s.ok('POST', '/admin/events', body, ad));
  assert.match(e.img, /^m:\d+$/);
  const dash = (await s.ok('GET', '/dashboard', null, tt));
  assert.ok(dash.events.some((x: any) => x.id === e.id));
  assert.ok(dash.events.length >= 3); // the demo events too
  assert.ok(Array.isArray(dash.offers) && dash.offers.length > 0 && dash.offers[0].guide.name);
  assert.equal((await s.ok('GET', `/events/${e.id}`)).titleAr, 'مهرجان التمور');
  const ed = (await s.ok('PUT', `/admin/events/${e.id}`, { ...body, img: e.img, title: 'Basra Date Festival' }, ad));
  assert.equal(ed.title, 'Basra Date Festival');
  // Once it is over, tourists no longer see it; the admin still does.
  s.advance(24 * 9);
  assert.ok(!(await s.ok('GET', '/events')).some((x: any) => x.id === e.id));
  assert.ok((await s.ok('GET', '/events', null, ad, { all: '1' })).some((x: any) => x.id === e.id));
  (await s.ok('DELETE', `/admin/events/${e.id}`, null, ad));
  assert.equal((await s.call('GET', `/events/${e.id}`)).status, 404);
});

test('phone sign-up and sign-in: E.164 only, unique, and editable from the profile with the same rules', async () => {
  const s = await setup();
  const body = (extra: any) => ({ role: 'tourist', name: 'Pat Doe', email: 'pat' + Math.random() + '@ex.com', password: 'Long#pass1', country: 'Spain', gender: 'f', ...extra });
  assert.equal((await s.call('POST', '/auth/register', body({}))).body.params.field, 'phone', 'a phone number is required');
  assert.equal((await s.call('POST', '/auth/register', body({ phone: '07713111325' }))).body.error, 'country_code_required');
  assert.equal((await s.call('POST', '/auth/register', body({ phone: '+964123' }))).body.error, 'phone_invalid');
  assert.equal((await s.call('POST', '/auth/register', body({ phone: DEMO_ACCOUNTS.guide }))).body.error, 'phone_taken');
  const reg = (await s.ok('POST', '/auth/register', body({ phone: '+44 7400 123456' })));
  assert.equal(reg.user.phone, '+447400123456', 'stored in E.164');
  assert.equal((await s.call('POST', '/auth/register', body({ phone: '+447400123456' }))).status, 409, 'compared in E.164');
  // Sign in with the phone; spaces and Arabic-Indic digits are the same number.
  assert.equal((await s.call('POST', '/auth/login', { phone: '+44 7400 123456', password: 'Long#pass1' })).status, 200);
  assert.equal((await s.call('POST', '/auth/login', { phone: '+٤٤٧٤٠٠١٢٣٤٥٦', password: 'Long#pass1' })).status, 200);
  assert.equal((await s.call('POST', '/auth/login', { phone: '+447400123456', password: 'wrong' })).body.error, 'login_failed');
  assert.equal((await s.call('POST', '/auth/login', { email: reg.user.email, password: 'Long#pass1' })).body.error, 'login_failed', 'email no longer signs in');
  // Your info: same rules.
  assert.equal((await s.call('PUT', '/me', { phone: DEMO_ACCOUNTS.guide }, reg.token)).body.error, 'phone_taken');
  assert.equal((await s.call('PUT', '/me', { phone: '0771' }, reg.token)).body.error, 'country_code_required');
  assert.equal((await s.ok('PUT', '/me', { phone: '+9647712345678' }, reg.token)).phone, '+9647712345678');
  assert.equal((await s.call('POST', '/auth/forgot', { phone: 'abc' })).body.error, 'country_code_required');
});
