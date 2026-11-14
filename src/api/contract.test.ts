// Contract tests: every endpoint of the app, compared between the demo engine and the database API.
// Each step is called on the demo engine and on the database API; the answers must be the same (see twin.ts).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../core/util';
import { ALL_ENDPOINTS, compared, twin } from './twin';

const H = 'tourist@tripguide.demo'; // Hannah
const Z = 'guide@tripguide.demo'; // Zainab
const A = 'admin@tripguide.demo';
const JAMES = 'james@tripguide.demo';
const ALI = 'ali@tripguide.demo';
const img = (c: string) => 'data:image/jpeg;base64,' + c.repeat(200);
const CARD = { number: '4242 4242 4242 4242', name: 'Test Tourist', expiry: '12/30', cvc: '123' };

const open: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const s of open.splice(0)) await s.close();
});
async function setup() {
  const s = await twin();
  open.push(s);
  return s;
}

test('contract: chats and notifications', async () => {
  const s = await setup();
  for (const who of [H, Z, A, JAMES, ALI]) {
    const list = (await s.ok('GET', '/threads', null, who)).threads;
    await s.ok('GET', '/notifications', null, who);
    await s.ok('GET', '/me', null, who);
    for (const t of list.slice(0, 3)) await s.ok('GET', `/threads/${t.id}`, null, who); // opening marks it read
    await s.ok('GET', '/threads', null, who);
    await s.ok('GET', '/me', null, who);
  }
  // Hannah writes to Zainab; Zainab sees it unread, opens it, answers.
  const mine = (await s.ok('GET', '/threads', null, H)).threads;
  const withZ = mine[0];
  await s.ok('POST', `/threads/${withZ.id}/messages`, { body: 'Is the Ishtar Gate open on Fridays?' }, H);
  await s.both('POST', `/threads/${withZ.id}/messages`, { body: '' }, H);
  await s.both('POST', `/threads/${withZ.id}/messages`, { body: 'x'.repeat(2001) }, H);
  await s.both('POST', `/threads/${withZ.id}/messages`, { body: 'hello' }, A);
  await s.both('GET', `/threads/${withZ.id}`, null, JAMES);
  await s.both('GET', '/threads/999', null, H);
  await s.both('GET', '/threads', null, null);
  s.advance(0.5);
  for (const who of [H, Z]) {
    await s.ok('GET', '/threads', null, who);
    await s.ok('GET', '/me', null, who);
  }
  const other = (await s.ok('GET', '/threads', null, Z)).threads.find((t: any) => t.unread > 0);
  if (other) {
    await s.ok('GET', `/threads/${other.id}`, null, Z);
    await s.ok('POST', `/threads/${other.id}/messages`, { body: 'Yes, from nine in the morning. مرحباً بك' }, Z);
    await s.ok('GET', `/threads/${other.id}`, null, H);
  }
  // Opening chats: a tourist with any guide, a guide only about a request or booking they share.
  const guides = (await s.ok('GET', '/guides', null, H)).guides;
  await s.ok('POST', '/threads', { guideId: guides[3].id }, JAMES);
  await s.ok('POST', '/threads', { guideId: guides[3].id }, JAMES); // the same chat again
  await s.both('POST', '/threads', { guideId: 99999 }, JAMES);
  await s.both('POST', '/threads', { touristId: 20 }, ALI);
  await s.both('POST', '/threads', { guideId: guides[0].id }, A);
  await s.both('POST', '/threads', { guideId: guides[0].id, requestId: 1 }, JAMES);
  // Notifications: read one, read all.
  const notes = (await s.ok('GET', '/notifications', null, H)).notifications;
  if (notes.length) await s.ok('POST', `/notifications/${notes[0].id}/read`, null, H);
  await s.both('POST', `/notifications/${notes.length ? notes[0].id : 1}/read`, null, Z);
  await s.both('POST', '/notifications/abc/read', null, H);
  await s.ok('GET', '/notifications', null, H);
  await s.ok('POST', '/notifications/read-all', null, H);
  await s.ok('GET', '/notifications', null, H);
  await s.ok('GET', '/me', null, H);
  await s.both('GET', '/notifications', null, null);
});

test('contract: travel passport and special events', async () => {
  const s = await setup();
  const me = await s.ok('GET', '/me', null, H);
  await s.ok('GET', `/users/${me.id}`, null, Z);
  await s.both('GET', `/users/${me.id}`, null, null);
  await s.both('GET', '/users/1', null, Z); // the admin has no public profile
  await s.ok('GET', '/users/2', null, H); // a guide: redirect
  const page = { img: img('P'), place: 'Malwiya Minaret', city: 'samarra', date: addDays(s.today(), -2), note: 'Climbed to the top' };
  const p1 = await s.ok('POST', '/me/passport', page, H);
  await s.ok('POST', '/me/passport', { ...page, place: 'Erbil Citadel', city: 'erbil', date: addDays(s.today(), -40), note: '' }, H);
  await s.both('POST', '/me/passport', { ...page, date: addDays(s.today(), 1) }, H);
  await s.both('POST', '/me/passport', { ...page, city: 'atlantis' }, H);
  await s.both('POST', '/me/passport', { ...page, img: 'http://x/y.jpg' }, H);
  await s.both('POST', '/me/passport', { ...page, place: '' }, H);
  await s.both('POST', '/me/passport', page, Z);
  await s.ok('GET', '/me', null, H);
  await s.ok('GET', `/users/${me.id}`, null, Z);
  const newest = Math.max(...p1.pages.map((x: any) => x.id));
  await s.ok('DELETE', `/me/passport/${newest}`, null, H);
  await s.both('DELETE', `/me/passport/${newest}`, null, H);
  await s.ok('POST', '/me/passport', { ...page, place: 'Shatt al-Arab', city: 'basra' }, H); // page numbers after a removal
  await s.ok('GET', `/users/${me.id}`, null, ALI);

  // Events: tourists see what is on or coming; the state adds, edits and removes.
  await s.ok('GET', '/events');
  await s.ok('GET', '/events', null, A, { all: '1' });
  await s.ok('GET', '/events', null, H, { all: '1' });
  const ev = { title: 'Date palm festival', titleAr: 'مهرجان النخيل', city: 'basra', startDate: addDays(s.today(), 10), endDate: addDays(s.today(), 12), img: img('E'), venue: 'Corniche', venueAr: 'الكورنيش', description: 'Three days of dates and music.', descriptionAr: 'ثلاثة أيام من التمور والموسيقى.' };
  await s.both('POST', '/admin/events', ev, H);
  await s.both('POST', '/admin/events', { ...ev, title: '' }, A);
  await s.both('POST', '/admin/events', { ...ev, endDate: addDays(s.today(), 5) }, A);
  await s.both('POST', '/admin/events', { ...ev, startDate: addDays(s.today(), -9), endDate: addDays(s.today(), -3) }, A);
  await s.both('POST', '/admin/events', { ...ev, city: 'nowhere' }, A);
  const made = await s.ok('POST', '/admin/events', ev, A);
  const second = await s.ok('POST', '/admin/events', { ...ev, title: 'Baghdad book fair', titleAr: 'معرض بغداد للكتاب', city: 'baghdad', img: 'ishtar.jpg' }, A);
  await s.ok('GET', `/events/${made.id}`);
  await s.both('GET', '/events/9999');
  await s.ok('PUT', `/admin/events/${made.id}`, { ...ev, img: made.img, title: 'Date palm festival 2026', endDate: addDays(s.today(), 13) }, A);
  await s.both('PUT', '/admin/events/9999', ev, A);
  await s.ok('GET', '/meta');
  await s.ok('GET', '/dashboard', null, H);
  await s.ok('DELETE', `/admin/events/${second.id}`, null, A);
  await s.both('DELETE', `/admin/events/${second.id}`, null, A);
  await s.ok('POST', '/admin/events', { ...ev, title: 'After a removal', img: 'babylon.jpg' }, A); // event numbers after a removal
  await s.ok('GET', '/events', null, A, { all: '1' });
  s.advance(24 * 14);
  await s.ok('GET', '/events'); // over: gone for tourists
  await s.ok('GET', '/events', null, A, { all: '1' });
});

test('contract: reports and reviews, from a new trip to both reviews', async () => {
  const s = await setup();
  for (const who of [H, Z, A, JAMES, ALI]) {
    await s.ok('GET', '/dashboard', null, who);
    await s.ok('GET', '/bookings', null, who);
  }
  // A review that is waiting in the demo data.
  const waiting = (await s.ok('GET', '/dashboard', null, H)).toReview[0];
  const good = { ratings: { knowledge: 5, communication: 4, punctuality: 5, value: 4 }, comment: 'Knew every brick of the Processional Way.', hireAgain: true };
  await s.both('POST', `/bookings/${waiting.id}/review`, { ...good, ratings: { knowledge: 6 } }, H);
  await s.both('POST', `/bookings/${waiting.id}/review`, { ...good, comment: 'short' }, H);
  await s.both('POST', `/bookings/${waiting.id}/review`, good, JAMES);
  await s.both('POST', `/bookings/${waiting.id}/review`, good, A);
  const reviewed = await s.ok('POST', `/bookings/${waiting.id}/review`, good, H);
  await s.both('POST', `/bookings/${waiting.id}/review`, good, H);
  await s.ok('GET', `/guides/${reviewed.guide.id}`);
  await s.ok('GET', `/guides/${reviewed.guide.id}`, null, H);
  await s.ok('GET', `/bookings/${waiting.id}`, null, H);
  s.advance(24 * 15); // one-sided reviews show after 14 days
  await s.ok('GET', `/guides/${reviewed.guide.id}`);
  await s.ok('GET', '/guides', null, null, { sort: 'rating' });

  // A fresh trip: post, offer, hire, confirm.
  const trip = { title: 'Two days of Baghdad history', cities: ['baghdad'], startDate: addDays(s.today(), 3), endDate: addDays(s.today(), 4), groupSize: 2, languages: ['en'], interests: ['history'], budgetMin: 60, budgetMax: 120 };
  const r = await s.ok('POST', '/requests', trip, JAMES);
  const o = await s.ok('POST', `/requests/${r.id}/offers`, { price: 100, plan: [{ title: 'Old city walk' }, { title: 'Museum day' }], includes: ['water'], message: 'Happy to show you around the old city.' }, ALI);
  const b = await s.ok('POST', `/offers/${o.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, JAMES);
  await s.ok('POST', `/bookings/${b.id}/confirm`, null, ALI);
  // James reports a problem: the money stays held until the state decides.
  await s.both('POST', `/bookings/${b.id}/report`, { reason: 'weather', details: 'It rained the whole day.' }, JAMES);
  await s.both('POST', `/bookings/${b.id}/report`, { reason: 'no_show', details: 'short' }, JAMES);
  await s.both('POST', `/bookings/${b.id}/report`, { reason: 'no_show', details: 'The guide did not come to the hotel.' }, H);
  await s.ok('POST', `/bookings/${b.id}/report`, { reason: 'no_show', details: 'The guide did not come to the hotel.' }, JAMES);
  await s.both('POST', `/bookings/${b.id}/report`, { reason: 'other', details: 'He reported me first, unfairly.' }, ALI);
  await s.both('POST', `/admin/bookings/${b.id}/payout`, null, A); // disputed: no payout
  await s.both('POST', `/bookings/${b.id}/cancel`, { reason: 'changed my mind' }, JAMES);
  for (const who of [JAMES, ALI]) {
    await s.ok('GET', `/bookings/${b.id}`, null, who);
    await s.ok('GET', '/notifications', null, who);
    await s.ok('GET', '/dashboard', null, who);
  }
  await s.ok('GET', '/dashboard', null, A);
  await s.ok('GET', '/notifications', null, A);
  const reports = (await s.ok('GET', '/admin/reports', null, A)).reports;
  await s.both('GET', '/admin/reports', null, JAMES);
  const mine = reports.find((x: any) => x.booking.id === b.id);
  await s.both('POST', `/admin/reports/${mine.id}/resolve`, { action: 'burn' }, A);
  await s.both('POST', `/admin/reports/${mine.id}/resolve`, { action: 'refund' }, ALI);
  await s.ok('POST', `/admin/reports/${mine.id}/resolve`, { action: 'refund', note: 'Refunded in full.', suspend: true }, A);
  await s.both('POST', `/admin/reports/${mine.id}/resolve`, { action: 'dismiss' }, A);
  await s.ok('GET', '/admin/reports', null, A);
  await s.ok('GET', '/admin/reports', null, A, { status: 'resolved' });
  await s.ok('GET', `/bookings/${b.id}`, null, JAMES);
  await s.ok('GET', '/wallet', null, JAMES);
  await s.both('GET', '/dashboard', null, ALI); // suspended: reading still works
  await s.both('POST', `/requests/${r.id}/offers`, { price: 90, plan: [{ title: 'Day one' }, { title: 'Day two' }], message: 'Let me try again, please.' }, ALI);
  await s.ok('GET', '/admin/users', null, A, { q: 'ali' });

  // The report that was already open in the demo data: the state pays the guide.
  const seeded = reports.find((x: any) => x.booking.id !== b.id);
  if (seeded) {
    await s.ok('POST', `/admin/reports/${seeded.id}/resolve`, { action: 'release', note: 'The tour took place.' }, A);
    await s.ok('GET', '/admin/reports', null, A, { status: 'resolved' });
  }
  // A second fresh trip, completed by the state's payout, then both sides review each other.
  const r2 = await s.ok('POST', '/requests', { ...trip, title: 'Babylon with the family', cities: ['babylon'], startDate: addDays(s.today(), 6), endDate: addDays(s.today(), 6) }, JAMES);
  const o2 = await s.ok('POST', `/requests/${r2.id}/offers`, { price: 70, plan: [{ title: 'Ancient Babylon' }], message: 'A calm day among the ruins, with lunch.' }, Z);
  const b2 = await s.ok('POST', `/offers/${o2.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, JAMES);
  await s.ok('POST', `/bookings/${b2.id}/confirm`, null, Z);
  await s.both('POST', `/bookings/${b2.id}/review`, good, JAMES); // not completed yet
  await s.ok('POST', `/admin/bookings/${b2.id}/payout`, null, A);
  await s.ok('POST', `/bookings/${b2.id}/review`, good, JAMES);
  await s.ok('GET', `/bookings/${b2.id}`, null, Z); // the tourist's review stays hidden until the guide writes theirs
  await s.both('POST', `/bookings/${b2.id}/review`, { ratings: { communication: 5, punctuality: 5 }, comment: 'A pleasure to guide this family.' }, Z);
  await s.ok('POST', `/bookings/${b2.id}/review`, { ratings: { communication: 5, punctuality: 5, respect: 5 }, comment: 'A pleasure to guide this family.', hireAgain: true }, Z);
  for (const who of [JAMES, Z]) {
    await s.ok('GET', `/bookings/${b2.id}`, null, who);
    await s.ok('GET', '/dashboard', null, who);
    await s.ok('GET', '/notifications', null, who);
    await s.ok('GET', '/wallet', null, who);
  }
  const james = await s.ok('GET', '/me', null, JAMES);
  await s.ok('GET', `/users/${james.id}`, null, Z);
  await s.ok('GET', `/guides/${b2.guide.id}`, null, JAMES);
  await s.ok('GET', '/admin/stats', null, A);
  assert.ok(s.stats().calls > 70);
});

// ---------------------------------------------------------------------------------------------------------------
// M5: the state's tools, accounts, guides, requests, offers, bookings, wallet and the trip assistant.

const MARCO = 'marco@tripguide.demo';
const NOOR = 'noor@tripguide.demo'; // waiting for verification in the demo data
const trip = (today: string, extra: any = {}) => ({ title: 'Two days of Baghdad history', cities: ['baghdad'], startDate: addDays(today, 3), endDate: addDays(today, 4), groupSize: 2, languages: ['en'], interests: ['history'], budgetMin: 60, budgetMax: 120, ...extra });
const offer = (days: number, price = 100) => ({ price, plan: Array.from({ length: days }, (_, i) => ({ title: `Day ${i + 1} walk` })), includes: ['water'], message: 'Happy to show you around the old city.' });

test('contract: the state verifies guides, sets prices, manages governorates, pays out and manages users', async () => {
  const s = await setup();
  for (const p of ['/admin/stats', '/admin/settings', '/admin/verifications', '/admin/payouts', '/admin/cities', '/admin/users', '/admin/reports']) {
    await s.ok('GET', p, null, A);
    await s.both('GET', p, null, H);
    await s.both('GET', p, null, null);
  }
  // Prices and the dinar rate.
  await s.ok('PUT', '/admin/settings', { guideSubscriptionPrice: 7.5, subscriptionDays: 45, promotionPrice: 12, promotionDays: 10, iqdPerUsd: 1480 }, A);
  await s.both('PUT', '/admin/settings', { iqdPerUsd: 5 }, A);
  await s.both('PUT', '/admin/settings', { subscriptionDays: 1.5 }, A);
  await s.both('PUT', '/admin/settings', { promotionPrice: 'free' }, A);
  await s.both('PUT', '/admin/settings', { iqdPerUsd: 1500 }, Z);
  await s.ok('GET', '/admin/settings', null, A);
  await s.ok('GET', '/meta');
  await s.ok('GET', '/dashboard', null, A);
  await s.ok('GET', '/guide/subscription', null, Z);
  await s.ok('GET', '/guide/promotion', null, Z);

  // Verification: the guide waiting in the demo data is rejected with a reason, sends new photos, and is approved.
  const queue = (await s.ok('GET', '/admin/verifications', null, A)).guides;
  const noor = queue[0].id;
  // (Rejecting without a reason is a known difference, checked on its own at the end of this file.)
  await s.both('POST', `/admin/guides/${noor}/verify`, { approve: true }, Z);
  await s.both('POST', '/admin/guides/9999/verify', { approve: true }, A);
  await s.ok('POST', `/admin/guides/${noor}/verify`, { approve: false, note: 'The back of the ID is not readable.' }, A);
  await s.both('POST', `/admin/guides/${noor}/verify`, { approve: true }, A);
  await s.ok('GET', '/me', null, NOOR);
  await s.ok('GET', '/notifications', null, NOOR);
  await s.both('PUT', '/guide/profile', { headline: 'Babylon and Hillah for families' }, NOOR); // not verified yet
  await s.both('POST', '/guide/verification', { idFront: img('F'), idBack: img('B') }, NOOR);
  await s.both('POST', '/guide/verification', { idFront: img('F'), idBack: 'nope', residence: img('R') }, NOOR);
  await s.both('POST', '/guide/verification', { idFront: img('F'), idBack: img('B'), residence: img('R') }, H);
  await s.ok('POST', '/guide/verification', { idFront: img('F'), idBack: img('B'), residence: img('R') }, NOOR);
  await s.both('POST', '/guide/verification', { idFront: img('F'), idBack: img('B'), residence: img('R') }, NOOR);
  await s.ok('GET', '/admin/verifications', null, A);
  await s.ok('GET', '/notifications', null, A);
  await s.ok('POST', `/admin/guides/${noor}/verify`, { approve: true }, A);
  await s.both('POST', '/guide/verification', { idFront: img('F'), idBack: img('B'), residence: img('R') }, NOOR);
  await s.ok('PUT', '/guide/profile', { headline: 'Babylon and Hillah for families', pricePerDay: 45 }, NOOR);
  await s.ok('GET', `/guides/${noor}`);
  await s.ok('GET', '/admin/verifications', null, A);

  // Governorates: add one with places and photos, edit it, and a tourist uses it.
  const city = { name: 'Dhi Qar', nameAr: 'ذي قار', places: [{ name: 'Ziggurat of Ur', nameAr: 'زقورة أور', kind: 'archaeological' }, { name: 'Nasiriyah Museum', nameAr: 'متحف الناصرية', kind: 'heritage' }], covers: [img('C'), 'ziggurat.jpg'] };
  await s.both('POST', '/admin/cities', city, H);
  await s.both('POST', '/admin/cities', { ...city, places: [] }, A);
  await s.both('POST', '/admin/cities', { ...city, covers: [] }, A);
  await s.both('POST', '/admin/cities', { ...city, places: [{ name: 'X place', nameAr: 'مكان', kind: 'castle' }] }, A);
  await s.both('POST', '/admin/cities', { ...city, covers: ['not-a-photo.jpg'] }, A);
  await s.both('POST', '/admin/cities', { ...city, name: 'Baghdad' }, A);
  await s.both('POST', '/admin/cities', { ...city, nameAr: '' }, A);
  const made = await s.ok('POST', '/admin/cities', city, A);
  await s.both('POST', '/admin/cities', city, A);
  await s.ok('GET', `/admin/cities/${made.slug}`, null, A);
  await s.both('GET', '/admin/cities/atlantis', null, A);
  await s.both('PUT', '/admin/cities/atlantis', city, A);
  const edited = await s.ok('PUT', `/admin/cities/${made.slug}`, { name: 'Dhi Qar', nameAr: 'ذي قار', places: [{ id: made.places[0].id, name: 'Great Ziggurat of Ur', nameAr: 'زقورة أور العظيمة', kind: 'archaeological' }, { name: 'Marshes of Chibayish', nameAr: 'أهوار الجبايش', kind: 'nature' }], covers: [made.covers[0], img('D'), 'babylon.jpg'] }, A);
  await s.both('PUT', `/admin/cities/${made.slug}`, { ...city, name: 'Babylon' }, A);
  await s.ok('GET', '/admin/cities', null, A);
  await s.ok('GET', '/meta');
  const r = await s.ok('POST', '/requests', trip(s.today(), { title: 'Ur and the marshes', cities: [made.slug], places: [edited.places[0].id], cover: edited.covers[1] }), H);
  await s.both('POST', '/requests', trip(s.today(), { cities: [made.slug], cover: 'malwiya.jpg' }), H);
  await s.ok('GET', `/requests/${r.id}`, null, H);
  await s.ok('PUT', '/guide/profile', { cities: ['babylon', made.slug], places: [edited.places[1].id] }, Z);
  await s.ok('GET', '/admin/stats', null, A);

  // Payouts: one full payment per card booking, transferred by the state.
  await s.ok('GET', '/admin/payouts', null, A);
  const r2 = await s.ok('POST', '/requests', trip(s.today()), JAMES);
  const o2 = await s.ok('POST', `/requests/${r2.id}/offers`, offer(2), ALI);
  const b2 = await s.ok('POST', `/offers/${o2.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, JAMES);
  await s.both('POST', `/admin/bookings/${b2.id}/payout`, null, A); // not confirmed yet
  await s.ok('POST', `/bookings/${b2.id}/confirm`, null, ALI);
  await s.ok('GET', '/admin/payouts', null, A);
  await s.ok('GET', '/dashboard', null, A);
  await s.both('POST', `/admin/bookings/${b2.id}/payout`, null, JAMES);
  await s.both('POST', '/admin/bookings/9999/payout', null, A);
  await s.ok('POST', `/admin/bookings/${b2.id}/payout`, null, A);
  await s.both('POST', `/admin/bookings/${b2.id}/payout`, null, A);
  await s.ok('GET', '/admin/payouts', null, A);
  for (const who of [JAMES, ALI]) {
    await s.ok('GET', `/bookings/${b2.id}`, null, who);
    await s.ok('GET', '/wallet', null, who);
    await s.ok('GET', '/notifications', null, who);
  }
  // Every other card booking waiting in the demo data.
  for (const w of (await s.ok('GET', '/admin/payouts', null, A)).waiting) await s.ok('POST', `/admin/bookings/${w.id}/payout`, null, A);
  await s.ok('GET', '/admin/payouts', null, A);
  await s.ok('GET', '/admin/stats', null, A);

  // Users: search, suspend (signed out everywhere), reactivate.
  await s.ok('GET', '/admin/users', null, A, { q: 'hannah' });
  await s.ok('GET', '/admin/users', null, A, { q: '@tripguide' });
  await s.ok('GET', '/admin/users', null, A, { q: 'zzzz' });
  const marco = (await s.ok('GET', '/me', null, MARCO)).id;
  await s.both('POST', `/admin/users/${marco}/status`, { status: 'suspended' }, H);
  await s.both('POST', '/admin/users/1/status', { status: 'suspended' }, A);
  await s.both('POST', '/admin/users/9999/status', { status: 'suspended' }, A);
  await s.ok('POST', `/admin/users/${marco}/status`, { status: 'suspended' }, A);
  await s.both('GET', '/me', null, MARCO); // signed out
  s.forget(MARCO);
  await s.signIn(MARCO); // can sign in again, but cannot act
  await s.both('POST', '/requests', trip(s.today()), MARCO);
  await s.ok('GET', '/requests/mine', null, MARCO);
  await s.ok('POST', `/admin/users/${marco}/status`, { status: 'active' }, A);
  await s.ok('POST', '/requests', trip(s.today(), { title: 'Back again in Baghdad' }), MARCO);
  await s.ok('GET', '/admin/users', null, A);
});

test('contract: accounts: sign-up, sign-in, passwords, your info, saved card', async () => {
  const s = await setup();
  const body = { role: 'tourist', name: 'Pat Doe', phone: '+447400123456', email: 'pat@example.com', password: 'Long#pass1', country: 'Spain', gender: 'f' };
  await s.both('POST', '/auth/register', { ...body, role: 'admin' });
  await s.both('POST', '/auth/register', { ...body, name: 'P' });
  await s.both('POST', '/auth/register', { ...body, phone: undefined });
  await s.both('POST', '/auth/register', { ...body, phone: '07400123456' });
  await s.both('POST', '/auth/register', { ...body, phone: '+44123' });
  await s.both('POST', '/auth/register', { ...body, email: 'pat@' });
  await s.both('POST', '/auth/register', { ...body, password: 'short' });
  await s.both('POST', '/auth/register', { ...body, password: 'alllowercase1!' });
  await s.both('POST', '/auth/register', { ...body, phone: s.api.phoneOf(Z) });
  await s.both('POST', '/auth/register', { ...body, email: Z });
  await s.both('POST', '/auth/register', { ...body, country: '' });
  await s.both('POST', '/auth/register', { ...body, gender: 'x' });
  s.useTokens('pat', await s.both('POST', '/auth/register', body));
  await s.both('POST', '/auth/register', body);
  s.useTokens('newguide', await s.both('POST', '/auth/register', { ...body, role: 'guide', name: 'Karim Nasser', phone: '+964 780 123 4567', email: 'karim@example.com', country: 'Iraq', gender: 'm' }));
  for (const who of ['pat', 'newguide']) {
    await s.ok('GET', '/me', null, who);
    await s.ok('GET', '/dashboard', null, who);
    await s.ok('GET', '/notifications', null, who);
  }
  await s.both('POST', '/auth/login', { phone: '+447400123456', password: 'wrong' });
  await s.both('POST', '/auth/login', { phone: 'not a phone', password: 'Long#pass1' });
  await s.both('POST', '/auth/login', { email: 'pat@example.com', password: 'Long#pass1' });
  await s.both('POST', '/auth/login', {});
  // Sign out ends that sign-in only.
  s.useTokens('pat2', await s.both('POST', '/auth/login', { phone: '+44 7400 123456', password: 'Long#pass1' }));
  await s.ok('POST', '/auth/logout', null, 'pat2');
  await s.both('GET', '/me', null, 'pat2');
  await s.ok('GET', '/me', null, 'pat');
  await s.both('POST', '/auth/logout', null, null);

  // Your info.
  await s.ok('PUT', '/me', { name: 'Pat D. Doe', country: 'Portugal', email: 'Pat.Doe@Example.com' }, 'pat');
  await s.both('PUT', '/me', { name: '' }, 'pat');
  await s.both('PUT', '/me', { email: 'nope' }, 'pat');
  await s.both('PUT', '/me', { email: Z }, 'pat');
  await s.both('PUT', '/me', { phone: s.api.phoneOf(Z) }, 'pat');
  await s.both('PUT', '/me', { phone: '0740' }, 'pat');
  await s.both('PUT', '/me', { phone: '+44 20 7946 0958' }, 'pat'); // a London landline
  await s.ok('PUT', '/me', { phone: '+34 612 345 678' }, 'pat');
  await s.ok('PUT', '/me', { avatar: img('A'), cover: img('V') }, 'pat');
  await s.both('PUT', '/me', { avatar: 'http://x/y.jpg' }, 'pat');
  await s.both('PUT', '/me', { avatar: 'data:image/png;base64,' + 'A'.repeat(200_001) }, 'pat');
  await s.ok('PUT', '/me', { cover: null }, 'pat');
  await s.both('PUT', '/me', { name: 'Nobody' }, null);
  // Phone verification (the demo code on staging).
  await s.ok('POST', '/me/phone-code', null, 'pat');
  await s.both('POST', '/me/phone-code', null, null);
  await s.both('POST', '/me/verify-phone', { code: '000000' }, 'pat');
  await s.ok('POST', '/me/verify-phone', { code: '123456' }, 'pat');
  // Saved card and payment check.
  await s.both('PUT', '/me/card', { ...CARD, number: '1234 5678' }, 'pat');
  await s.both('PUT', '/me/card', { ...CARD, name: '' }, 'pat');
  await s.both('PUT', '/me/card', { ...CARD, expiry: '13/30' }, 'pat');
  await s.both('PUT', '/me/card', { ...CARD, expiry: '01/20' }, 'pat');
  await s.both('PUT', '/me/card', { ...CARD, cvc: '1' }, 'pat');
  await s.both('PUT', '/me/card', { ...CARD, number: '4000 0000 0000 0002' }, 'pat');
  await s.both('PUT', '/me/card', CARD, A);
  await s.ok('PUT', '/me/card', { ...CARD, number: '5555 5555 5555 4444' }, 'pat');
  await s.ok('GET', '/wallet', null, 'pat');
  await s.ok('DELETE', '/me/card', null, 'pat');
  await s.both('POST', '/me/verify-payment', { card: '12' }, 'pat');
  await s.ok('POST', '/me/verify-payment', { card: '4242 4242 4242 4242' }, 'pat');
  await s.both('POST', '/me/verify-payment', { card: '4242 4242 4242 4242' }, 'newguide');

  // Passwords: change while signed in; forgot and reset by phone.
  s.useTokens('pat3', await s.both('POST', '/auth/login', { phone: '+34612345678', password: 'Long#pass1' }));
  await s.both('POST', '/me/password', { current: 'nope', password: 'Other#Pass2' }, 'pat');
  await s.both('POST', '/me/password', { current: 'Long#pass1', password: 'Long#pass1' }, 'pat');
  await s.both('POST', '/me/password', { current: 'Long#pass1', password: 'weak' }, 'pat');
  await s.ok('POST', '/me/password', { current: 'Long#pass1', password: 'Other#Pass2' }, 'pat');
  await s.ok('GET', '/me', null, 'pat');
  await s.both('GET', '/me', null, 'pat3'); // the other sign-in is ended
  await s.both('POST', '/auth/forgot', { phone: 'abc' });
  await s.both('POST', '/auth/forgot', { phone: '+9647809999999' });
  await s.both('POST', '/auth/forgot', { phone: s.api.phoneOf(A) }); // never for the admin
  const f = await s.both('POST', '/auth/forgot', { phone: '+34612345678' });
  assert.match(f.body.demoCode, /^\d{6}$/);
  const wrong = (code: string) => (code === '111111' ? '222222' : '111111');
  await s.both('POST', '/auth/reset', { phone: '+34612345678', code: wrong(f.body.demoCode), password: 'Third#Pass3' }, null, {}, { phone: '+34612345678', code: wrong(f.old.demoCode), password: 'Third#Pass3' });
  await s.both('POST', '/auth/reset', { phone: '+34612345678', code: f.body.demoCode, password: 'weak' }, null, {}, { phone: '+34612345678', code: f.old.demoCode, password: 'weak' });
  await s.both('POST', '/auth/reset', { phone: '+9647809999999', code: '123456', password: 'Third#Pass3' });
  s.useTokens('pat4', await s.both('POST', '/auth/reset', { phone: '+34612345678', code: f.body.demoCode, password: 'Third#Pass3' }, null, {}, { phone: '+34612345678', code: f.old.demoCode, password: 'Third#Pass3' }));
  await s.both('GET', '/me', null, 'pat'); // signed out by the reset
  await s.ok('GET', '/me', null, 'pat4');
  await s.both('POST', '/auth/reset', { phone: '+34612345678', code: f.body.demoCode, password: 'Fourth#Pass4' }, null, {}, { phone: '+34612345678', code: f.old.demoCode, password: 'Fourth#Pass4' }); // used once
  await s.both('POST', '/auth/login', { phone: '+34612345678', password: 'Other#Pass2' });
  await s.both('POST', '/auth/login', { phone: '+34612345678', password: 'Third#Pass3' });
  // Wrong paths and methods.
  await s.both('GET', '/nothing/here');
  await s.both('DELETE', '/meta');
  await s.both('PUT', '/auth/login', {});
  await s.ok('GET', '/admin/users', null, A, { q: 'pat' });
});

test('contract: guides, requests, offers, hiring by card and cash, cancelling, and the wallet', async () => {
  const s = await setup();
  // Guide profile, photos, plans.
  await s.ok('PUT', '/guide/profile', { headline: 'Archaeologist and licensed guide in Babylon', headlineAr: 'عالمة آثار', bio: 'I studied archaeology in Baghdad and have worked on digs at Babylon for years.', bioAr: '', pricePerDay: 65, cities: ['baghdad', 'babylon'], languages: [{ code: 'ar', level: 'native' }, { code: 'en', level: 'fluent' }], specialities: ['history', 'archaeology'], places: [13, 14], blockedDates: [addDays(s.today(), 20), addDays(s.today(), 21)], photos: [{ img: 'lib:babylon', caption: 'The walls', captionAr: 'الأسوار' }, { img: img('G'), caption: 'On tour' }] }, Z);
  const mine = await s.both('GET', '/me', null, Z);
  const me = mine.body;
  // The app sends back the photo list it was given: media links on the API, inline pictures in the engine.
  await s.both('PUT', '/guide/profile', { photos: [...mine.body.guide.photos].reverse() }, Z, {}, { photos: [...mine.old.guide.photos].reverse() });
  assert.match((await s.ok('GET', '/me', null, Z)).guide.photos[0].img, /\/media\/guide\//);
  for (const bad of [{ headline: 'Hey' }, { bio: 'too short' }, { pricePerDay: 5 }, { pricePerDay: 40.5 }, { cities: [] }, { cities: ['atlantis'] }, { languages: [] }, { languages: [{ code: 'xx', level: 'native' }] }, { specialities: ['juggling'] }, { places: [9999] }, { blockedDates: ['tomorrow'] }, { photos: [{ img: 'lib:nothing' }] }, { photos: Array(13).fill({ img: 'lib:babylon' }) }]) await s.both('PUT', '/guide/profile', bad, Z);
  await s.both('PUT', '/guide/profile', { headline: 'A tourist cannot do this' }, H);
  await s.ok('POST', '/guide/photos', { img: img('S'), caption: 'Sunrise at Babylon', captionAr: 'شروق بابل' }, Z);
  await s.both('POST', '/guide/photos', { img: 'nope' }, Z);
  await s.both('POST', '/guide/photos', { img: img('S') }, H);
  await s.ok('GET', `/guides/${me.id}`);
  await s.ok('GET', `/guides/${me.id}`, null, H);
  await s.both('GET', '/guides/9999');
  await s.both('GET', '/guides/abc');
  for (const q of [{}, { q: 'babylon' }, { q: 'بابل' }, { city: 'najaf' }, { lang: 'fa' }, { spec: 'food' }, { maxPrice: '40' }, { verified: '1' }, { female: '1' }, { promoted: '1' }, { minRating: '4.8' }, { sort: 'price_low' }, { sort: 'price_high' }, { sort: 'tours' }, { from: addDays(s.today(), 20), to: addDays(s.today(), 20) }]) await s.ok('GET', '/guides', null, null, q as any);
  // Subscription (cash bookings) and featuring.
  await s.both('POST', '/guide/subscription', { card: { ...CARD, number: '4000 0000 0000 0002' } }, ALI);
  await s.both('POST', '/guide/subscription', {}, ALI);
  await s.ok('POST', '/guide/subscription', { card: CARD }, ALI);
  await s.ok('POST', '/guide/subscription', { card: CARD, acceptCash: false }, Z);
  await s.ok('GET', '/guide/subscription', null, ALI);
  await s.both('GET', '/guide/subscription', null, H);
  await s.ok('POST', '/guide/promotion', { card: CARD }, ALI);
  await s.ok('POST', '/guide/promotion', { card: CARD }, ALI); // extends
  await s.ok('GET', '/guide/promotion', null, ALI);
  await s.ok('GET', '/guides', null, null, { promoted: '1' });
  await s.ok('GET', '/wallet', null, ALI);
  await s.ok('GET', '/dashboard', null, A);

  // Requests.
  const today = s.today();
  for (const bad of [{ title: 'Hey' }, { cities: [] }, { cities: ['baghdad', 'babylon', 'najaf', 'karbala', 'erbil'] }, { startDate: addDays(today, -1) }, { endDate: addDays(today, 1) }, { endDate: addDays(today, 40) }, { startDate: 'soon' }, { groupSize: 11 }, { groupSize: 0 }, { languages: ['en', 'ar', 'fr', 'de'] }, { languages: [] }, { budgetMin: 200 }, { budgetMax: 5 }, { interests: ['skiing'] }, { plan: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] }, { cover: 'malwiya.jpg' }, { directGuideId: 9999 }]) await s.both('POST', '/requests', trip(today, bad), JAMES);
  await s.both('POST', '/requests', trip(today), Z);
  await s.both('POST', '/requests', trip(today), null);
  const r1 = await s.ok('POST', '/requests', trip(today, { description: 'We love old books and tea houses.', places: [4, 5, 9999], urgent: true, plan: [{ title: 'Mutanabbi Street', details: 'Friday morning' }, { title: '' }] }), JAMES);
  const zid = me.id;
  const direct = await s.ok('POST', '/requests', trip(today, { title: 'Only with Zainab please', cities: ['babylon'], startDate: addDays(today, 8), endDate: addDays(today, 8), directGuideId: zid, femaleGuide: true }), JAMES);
  await s.ok('GET', '/requests/mine', null, JAMES);
  for (const q of [{}, { matching: '1' }, { city: 'baghdad' }, { lang: 'en' }, { interest: 'history' }, { q: 'books' }, { q: 'nothing like this' }]) {
    await s.ok('GET', '/requests', null, ALI, q as any);
    await s.ok('GET', '/requests', null, Z, q as any);
  }
  await s.ok('GET', '/requests', null, A);
  await s.both('GET', '/requests', null, JAMES);
  for (const who of [JAMES, ALI, Z, A]) {
    await s.both('GET', `/requests/${r1.id}`, null, who);
    await s.both('GET', `/requests/${direct.id}`, null, who);
  }
  await s.both('GET', `/requests/${r1.id}`, null, H);
  await s.both('GET', '/requests/9999', null, JAMES);
  await s.ok('GET', `/requests/${r1.id}/suggested-guides`, null, JAMES);
  await s.both('GET', `/requests/${r1.id}/suggested-guides`, null, H);
  const suggested = (await s.ok('GET', `/requests/${r1.id}/suggested-guides`, null, JAMES)).guides;
  await s.ok('POST', `/requests/${r1.id}/invite`, { guideId: suggested[0].id }, JAMES);
  await s.ok('POST', `/requests/${r1.id}/invite`, { guideId: suggested[0].id }, JAMES);
  await s.both('POST', `/requests/${r1.id}/invite`, { guideId: 9999 }, JAMES);
  await s.both('POST', `/requests/${r1.id}/invite`, { guideId: suggested[0].id }, H);
  await s.ok('GET', `/requests/${r1.id}/suggested-guides`, null, JAMES);

  // Offers.
  await s.both('POST', `/requests/${r1.id}/offers`, offer(1), ALI);
  await s.both('POST', `/requests/${r1.id}/offers`, { ...offer(2), price: 5 }, ALI);
  await s.both('POST', `/requests/${r1.id}/offers`, { ...offer(2), message: 'hi' }, ALI);
  await s.both('POST', `/requests/${r1.id}/offers`, { ...offer(2), includes: ['helicopter'] }, ALI);
  await s.both('POST', `/requests/${r1.id}/offers`, offer(2), JAMES);
  await s.both('POST', `/requests/${direct.id}/offers`, offer(1), ALI); // sent to Zainab only
  const o1 = await s.ok('POST', `/requests/${r1.id}/offers`, offer(2, 99.5), ALI);
  await s.both('POST', `/requests/${r1.id}/offers`, offer(2), ALI);
  const o2 = await s.ok('POST', `/requests/${r1.id}/offers`, offer(2, 130), Z);
  const o3 = await s.ok('POST', `/requests/${direct.id}/offers`, offer(1, 70), Z);
  await s.ok('PUT', `/offers/${o1.id}`, { ...offer(2, 110), includes: ['water', 'tickets'] }, ALI);
  await s.both('PUT', `/offers/${o1.id}`, offer(3), ALI);
  await s.both('PUT', `/offers/${o1.id}`, offer(2), Z);
  await s.both('PUT', '/offers/9999', offer(2), ALI);
  await s.ok('POST', `/offers/${o2.id}/shortlist`, { on: true }, JAMES);
  await s.both('POST', `/offers/${o2.id}/shortlist`, { on: true }, H);
  await s.ok('POST', `/offers/${o2.id}/shortlist`, { on: false }, JAMES);
  await s.ok('GET', '/offers/mine', null, ALI);
  await s.ok('GET', '/offers/mine', null, Z);
  await s.both('GET', '/offers/mine', null, JAMES);
  await s.ok('GET', `/requests/${r1.id}`, null, JAMES);
  await s.ok('GET', '/dashboard', null, JAMES);
  await s.ok('GET', `/guides/${zid}`, null, JAMES);

  // Hiring by card: refused cards, a saved card, then the guide declines.
  await s.both('POST', `/offers/${o1.id}/hire`, { method: 'card', card: CARD }, JAMES);
  await s.both('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: { ...CARD, number: '4000 0000 0000 0002' } }, JAMES);
  await s.both('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: { saved: true } }, JAMES);
  await s.both('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, H);
  await s.ok('PUT', '/me/card', CARD, JAMES);
  const b1 = await s.ok('POST', `/offers/${o1.id}/hire`, { confirmPayment: true, method: 'card', card: { saved: true } }, JAMES);
  await s.both('POST', `/offers/${o2.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, JAMES);
  await s.both('PUT', `/offers/${o1.id}`, offer(2), ALI);
  await s.both('POST', `/offers/${o1.id}/withdraw`, null, ALI);
  await s.both('POST', `/requests/${r1.id}/close`, null, JAMES);
  for (const who of [JAMES, ALI, Z, A]) await s.both('GET', `/bookings/${b1.id}`, null, who);
  await s.both('POST', `/bookings/${b1.id}/confirm`, null, Z);
  await s.both('POST', `/bookings/${b1.id}/cancel`, { reason: 'I cannot make it' }, ALI); // the guide must use "decline"
  await s.ok('POST', `/bookings/${b1.id}/decline`, null, ALI);
  await s.both('POST', `/bookings/${b1.id}/decline`, null, ALI);
  await s.ok('GET', `/requests/${r1.id}`, null, JAMES);
  await s.ok('GET', '/wallet', null, JAMES);
  // Hire the other guide, confirm; the day endpoints answer admin_pays for card bookings; cancel before the first day.
  const b2 = await s.ok('POST', `/offers/${o2.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, JAMES);
  await s.ok('POST', `/bookings/${b2.id}/confirm`, null, Z);
  await s.both('POST', `/bookings/${b2.id}/confirm`, null, Z);
  const day = b2.milestones[0].id;
  await s.both('POST', `/milestones/${day}/release`, null, JAMES);
  await s.both('POST', `/milestones/${day}/request-release`, null, Z);
  await s.both('POST', `/milestones/${day}/refund`, null, Z);
  await s.both('POST', `/milestones/${day}/cash-received`, null, Z);
  await s.both('POST', '/milestones/99999/release', null, JAMES);
  await s.both('POST', `/milestones/${day}/release`, null, H);
  await s.ok('GET', '/bookings', null, JAMES);
  await s.ok('GET', '/bookings', null, Z);
  await s.both('GET', '/bookings', null, null);
  await s.ok('POST', `/bookings/${b2.id}/cancel`, { reason: 'Our flight was moved.' }, JAMES);
  await s.both('POST', `/bookings/${b2.id}/cancel`, {}, JAMES);
  await s.ok('GET', `/requests/${r1.id}`, null, JAMES);

  // Cash: only with a subscribed guide who accepts cash; the guide marks each day's cash from that day on.
  await s.ok('PUT', '/guide/profile', { acceptsCash: false }, Z);
  await s.both('POST', `/offers/${o3.id}/hire`, { confirmPayment: true, method: 'cash' }, JAMES); // Zainab turned cash off
  await s.ok('PUT', '/guide/profile', { acceptsCash: true }, Z);
  const b3 = await s.ok('POST', `/offers/${o3.id}/hire`, { confirmPayment: true, method: 'cash' }, JAMES);
  await s.ok('POST', `/bookings/${b3.id}/confirm`, null, Z);
  const cashDay = b3.milestones[0].id;
  await s.both('POST', `/milestones/${cashDay}/cash-received`, null, Z); // not that day yet
  await s.both('POST', `/milestones/${cashDay}/release`, null, JAMES);
  await s.both('POST', `/milestones/${cashDay}/request-release`, null, Z);
  await s.both('POST', `/milestones/${cashDay}/refund`, null, Z);
  await s.both('POST', `/admin/bookings/${b3.id}/payout`, null, A);
  s.advance(24 * 8);
  await s.both('POST', `/bookings/${b3.id}/cancel`, { reason: 'too late' }, JAMES); // the tour has started
  await s.both('POST', `/milestones/${cashDay}/cash-received`, null, ALI);
  await s.ok('POST', `/milestones/${cashDay}/cash-received`, null, Z);
  await s.both('POST', `/milestones/${cashDay}/cash-received`, null, Z);
  for (const who of [JAMES, Z]) {
    await s.ok('GET', `/bookings/${b3.id}`, null, who);
    await s.ok('GET', '/wallet', null, who);
    await s.ok('GET', '/dashboard', null, who);
    await s.ok('GET', '/notifications', null, who);
  }
  // A lapsed hire: nobody confirms within 48 hours.
  const r4 = await s.ok('POST', '/requests', trip(s.today(), { title: 'Najaf and Karbala in two days', cities: ['najaf', 'karbala'] }), JAMES);
  const o4 = await s.ok('POST', `/requests/${r4.id}/offers`, offer(2, 150), 'omar@tripguide.demo');
  const b4 = await s.ok('POST', `/offers/${o4.id}/hire`, { confirmPayment: true, method: 'card', card: CARD }, JAMES);
  s.advance(49);
  await s.both('POST', `/bookings/${b4.id}/confirm`, null, 'omar@tripguide.demo');
  await s.ok('GET', `/bookings/${b4.id}`, null, JAMES);
  await s.ok('GET', `/requests/${r4.id}`, null, JAMES);
  await s.ok('POST', `/requests/${r4.id}/close`, null, JAMES);
  await s.both('POST', `/requests/${r4.id}/close`, null, JAMES);
  await s.ok('GET', '/notifications', null, 'omar@tripguide.demo');

  // Wallet: James holds refunds; he withdraws part, then the rest. Ali has nothing released.
  const wallet = await s.ok('GET', '/wallet', null, JAMES);
  assert.ok(wallet.available > 0);
  await s.both('POST', '/wallet/withdraw', { amount: wallet.available + 1 }, JAMES);
  await s.both('POST', '/wallet/withdraw', { amount: 0 }, JAMES);
  await s.ok('POST', '/wallet/withdraw', { amount: 10.25 }, JAMES);
  await s.ok('POST', '/wallet/withdraw', {}, JAMES);
  await s.both('POST', '/wallet/withdraw', {}, JAMES);
  await s.both('POST', '/wallet/withdraw', {}, H); // no saved card
  await s.both('POST', '/wallet/withdraw', {}, A);
  await s.both('GET', '/wallet', null, A);
  await s.ok('GET', '/wallet', null, JAMES);
  await s.ok('DELETE', '/me/card', null, JAMES);
  await s.ok('GET', '/admin/stats', null, A);
  await s.ok('GET', '/dashboard', null, A);
});

test('contract: the trip assistant, and every endpoint of the app has been compared', async () => {
  const s = await setup();
  await s.ok('GET', '/assistant/status');
  await s.ok('GET', '/assistant/context', null, H);
  await s.both('GET', '/assistant/context', null, Z);
  await s.both('GET', '/assistant/context', null, null);
  const turn = (messages: any[], draft: any = {}, lang = 'en') => ({ messages, draft, lang });
  await s.both('POST', '/assistant/trip', turn([{ role: 'user', content: 'hi' }]), null);
  await s.both('POST', '/assistant/trip', turn([{ role: 'user', content: 'hi' }]), Z);
  await s.both('POST', '/assistant/trip', turn([]), H);
  await s.both('POST', '/assistant/trip', turn([{ role: 'assistant', content: 'hello' }]), H);
  await s.both('GET', '/assistant/trip', null, H);
  const first = await s.ok('POST', '/assistant/trip', turn([{ role: 'user', content: 'Two days in Babylon next week for 2 people, in English, about 80 dollars a day' }]), H);
  const second = await s.ok('POST', '/assistant/trip', turn([{ role: 'user', content: 'Two days in Babylon next week for 2 people' }, { role: 'assistant', content: first.reply }, { role: 'user', content: 'Add the Ishtar Gate and call it Babylon with friends' }], first.draft), H);
  await s.ok('POST', '/assistant/trip', turn([{ role: 'user', content: 'أريد رحلة يومين إلى بابل الشهر القادم لثلاثة أشخاص بالعربي' }], {}, 'ar'), H);
  await s.ok('POST', '/assistant/trip', turn([{ role: 'user', content: 'x'.repeat(5000) }], { cities: ['atlantis'], groupSize: 99 }), H);
  assert.ok(second.draft);
  const missing = ALL_ENDPOINTS.filter((e) => !compared.has(e));
  assert.deepEqual(missing, [], 'endpoints never compared between the engine and the API');
  assert.equal(ALL_ENDPOINTS.length, 83, '81 engine routes (80 from the demo + phone-code) and the 2 assistant routes');
});

test('known difference: a failed call saves nothing on the API, while the demo engine can keep half of it', async () => {
  // Rejecting a guide without a reason fails on both sides (400 field_required). The engine has already marked the
  // guide rejected by then; the API has changed nothing, so the state can still decide. This is the one intended
  // difference in behaviour (PLAN.md, question 7; IMPROVEMENTS.md, item 7).
  const s = await setup();
  const queue = (await s.ok('GET', '/admin/verifications', null, A)).guides;
  const r = await s.both('POST', `/admin/guides/${queue[0].id}/verify`, { approve: false }, A);
  assert.deepEqual([r.status, r.body.error], [400, 'field_required']);
  const again = await s.api.call('POST', `/admin/guides/${queue[0].id}/verify`, { approve: true }, await s.api.login(A));
  assert.equal(again.status, 200, 'the API kept the guide waiting, so approving still works');
});
