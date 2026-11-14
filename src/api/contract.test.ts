// Contract tests (M4): messages, notifications, travel passport, special events, reviews and reports.
// Each step is called on the demo engine and on the database API; the answers must be the same (see twin.ts).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../core/util';
import { twin } from './twin';

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
  const st = s.stats();
  assert.ok(st.calls > 70 && st.paths.length >= 20, `${st.calls} calls on ${st.paths.length} endpoints compared`);
});
