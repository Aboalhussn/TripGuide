// The whole marketplace: every rule lives here, and the same code runs on the server and in the browser demo.
import { settings } from '../config/brand';
import { AVATAR_COLORS, BUILTIN_COVERS, cityCovers, coversFor, PLACE_KINDS, GUIDE_RATING_KEYS, INCLUDES, INTERESTS, LANGUAGES, LANGUAGE_LEVELS, PHOTO_LIBRARY, TOURIST_RATING_KEYS } from './catalog';
import type { ApiRequest, ApiResponse, Booking, Data, GuideProfile, Milestone, Offer, PaymentMethod, Platform, Role, TripRequest, User } from './types';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './seed';
import { ApiError, addDays, bad, conflict, dateRange, daysInclusive, forbidden, iraqDate, isDate, money, nextId, notFound, num, optStr, str, strList } from './util';
import { bookedDates, bookingMoney, cashOpen, guideCard, guideStats, isAvailable, publicUser, reviewView, reviewVisible, touristStats } from './views';

type Ctx = { data: Data; p: Platform; user: User | null; now: Date; nowIso: string; today: string };
type Handler = (ctx: Ctx, params: Record<string, string>, req: ApiRequest) => any;

const routes: { method: string; re: RegExp; keys: string[]; handler: Handler }[] = [];
function route(method: string, pattern: string, handler: Handler) {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
}

// ---------- access helpers ----------
function need(ctx: Ctx, ...roles: Role[]): User {
  if (!ctx.user) throw new ApiError(401, 'login_required');
  if (roles.length && !roles.includes(ctx.user.role)) throw forbidden();
  return ctx.user;
}
function needActive(ctx: Ctx, ...roles: Role[]): User {
  const u = need(ctx, ...roles);
  if (u.status === 'suspended') throw forbidden('account_suspended');
  return u;
}
const idOf = (s: string) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};
const userById = (d: Data, id: number) => d.users.find((u) => u.id === id);
const guideOf = (d: Data, id: number) => d.guides.find((g) => g.userId === id);
function findRequest(d: Data, id: number) {
  const r = d.requests.find((x) => x.id === id);
  if (!r) throw notFound();
  return r;
}
function findBooking(d: Data, id: number) {
  const b = d.bookings.find((x) => x.id === id);
  if (!b) throw notFound();
  return b;
}

function notify(ctx: Ctx, userId: number, type: string, params: Record<string, string | number>, link: string) {
  ctx.data.notifications.push({ id: nextId(ctx.data, 'notifications'), userId, type, params, link, read: false, createdAt: ctx.nowIso });
}
function notifyAdmins(ctx: Ctx, type: string, params: Record<string, string | number>, link: string) {
  for (const a of ctx.data.users.filter((u) => u.role === 'admin')) notify(ctx, a.id, type, params, link);
}

// ---------- payments ----------
// Card payments are simulated (sandbox) until a real Iraqi gateway is connected:
// swap chargeCard() for the gateway call and keep the same return shape.
export const TEST_CARDS = { ok: '4242 4242 4242 4242', declined: '4000 0000 0000 0002' };

function luhn(d: string) {
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}
function cardBrand(d: string) {
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  return 'Card';
}
// Checks a card typed in by the user. Only brand, last 4, name and expiry are ever kept.
function checkCard(ctx: Ctx, card: any) {
  const digits = String(card?.number || '').replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits) || !luhn(digits)) throw bad('card_invalid');
  const name = String(card?.name || '').trim();
  if (name.length < 2) throw bad('card_name_required');
  const exp = String(card?.expiry || '').replace(/\s/g, '');
  const em = exp.match(/^(\d{2})\/?(\d{2})$/);
  if (!em || Number(em[1]) < 1 || Number(em[1]) > 12) throw bad('card_expiry_invalid');
  const lastDay = new Date(Date.UTC(2000 + Number(em[2]), Number(em[1]), 0));
  if (lastDay.toISOString().slice(0, 10) < ctx.today) throw bad('card_expired');
  if (!/^\d{3,4}$/.test(String(card?.cvc || ''))) throw bad('card_cvc_invalid');
  if (digits === TEST_CARDS.declined.replace(/\s/g, '')) throw new ApiError(402, 'card_declined');
  return { brand: cardBrand(digits), last4: digits.slice(-4), name, expiry: `${em[1]}/${em[2]}` };
}

function cardExpired(ctx: Ctx, expiry: string) {
  const [m, y] = expiry.split('/').map(Number);
  return new Date(Date.UTC(2000 + y, m, 0)).toISOString().slice(0, 10) < ctx.today;
}

function chargeCard(ctx: Ctx, u: User, card: any, amount: number, purpose: 'booking' | 'subscription' | 'promotion', refId: number) {
  let used;
  if (card?.saved) {
    // Paying with the card saved in the profile.
    if (!u.savedCard) throw bad('card_invalid');
    if (cardExpired(ctx, u.savedCard.expiry)) throw bad('card_expired');
    used = u.savedCard;
  } else used = checkCard(ctx, card);
  const p = { id: nextId(ctx.data, 'payments'), userId: u.id, purpose, refId, amount: money(amount), brand: used.brand, last4: used.last4, status: 'succeeded' as const, createdAt: ctx.nowIso };
  ctx.data.payments.push(p);
  return p;
}
// The app shows the same limits and locks extra choices once a limit is reached.
const TRIP_LIMITS = { cities: 4, places: 6, languages: 3, interests: 5, people: 10 };
const GUIDE_LIMITS = { languages: 5, specialities: 6, places: 12 };
const MAX_PHOTOS = 12; // tour photos on a guide's profile
const subActive = (ctx: Ctx, g: GuideProfile) => !!g.subscriptionUntil && g.subscriptionUntil > ctx.nowIso;
const promoActive = (ctx: Ctx, g: GuideProfile) => !!g.promotedUntil && g.promotedUntil > ctx.nowIso;

// Older saved data (and the browser demo's stored copy) predates payment methods.
function normalize(data: Data) {
  if (!data.payments) data.payments = [];
  if (!data.platform) data.platform = { guideSubscriptionPrice: settings.guideSubscriptionPrice, subscriptionDays: settings.subscriptionDays, promotionPrice: settings.promotionPrice, promotionDays: settings.promotionDays, iqdPerUsd: settings.iqdPerUsd };
  if (data.seq.payments === undefined) data.seq.payments = 0;
  if (data.platform.promotionPrice === undefined) data.platform.promotionPrice = settings.promotionPrice;
  if (data.platform.promotionDays === undefined) data.platform.promotionDays = settings.promotionDays;
  if (data.platform.iqdPerUsd === undefined) data.platform.iqdPerUsd = settings.iqdPerUsd;
  for (const g of data.guides) {
    if (g.acceptsCash === undefined) g.acceptsCash = false;
    if (g.subscriptionUntil === undefined) g.subscriptionUntil = null;
    if (g.promotedUntil === undefined) g.promotedUntil = null;
  }
  for (const r of data.requests) if (!r.plan) r.plan = [];
  for (const b of data.bookings) {
    if (!b.paymentMethod) b.paymentMethod = 'card';
    if (b.cardLast4 === undefined) b.cardLast4 = '';
  }
}

// ---------- lifecycle sweeps (run before every request) ----------
function sweep(ctx: Ctx) {
  for (const b of ctx.data.bookings) {
    if (b.status === 'awaiting_guide' && b.confirmBy < ctx.nowIso) {
      b.status = 'expired';
      refundHeld(ctx, b);
      const offer = ctx.data.offers.find((o) => o.id === b.offerId);
      if (offer) offer.status = 'declined';
      reopenRequest(ctx, b.requestId);
      notify(ctx, b.touristId, 'hire_expired', { title: b.title }, `/requests/${b.requestId}`);
      notify(ctx, b.guideId, 'hire_expired_guide', { title: b.title }, `/bookings/${b.id}`);
    }
  }
}

// Returns held card money; unpaid cash days simply fall away.
function refundHeld(ctx: Ctx, b: Booking) {
  for (const m of ctx.data.milestones.filter((m) => m.bookingId === b.id && (m.status === 'held' || m.status === 'release_requested' || m.status === 'cash_due'))) {
    m.status = m.status === 'cash_due' ? 'void' : 'refunded';
    m.settledAt = ctx.nowIso;
  }
}

function reopenRequest(ctx: Ctx, requestId: number) {
  const r = ctx.data.requests.find((x) => x.id === requestId);
  if (!r) return;
  r.status = 'open';
  for (const o of ctx.data.offers.filter((o) => o.requestId === r.id && o.status === 'not_selected')) o.status = 'pending';
}

function checkComplete(ctx: Ctx, b: Booking) {
  const ms = ctx.data.milestones.filter((m) => m.bookingId === b.id);
  if (ms.some((m) => m.status === 'held' || m.status === 'release_requested' || m.status === 'cash_due')) return;
  if (ms.some((m) => m.status === 'released' || m.status === 'cash_paid')) {
    b.status = 'completed';
    b.completedAt = ctx.nowIso;
    notify(ctx, b.touristId, 'review_prompt', { title: b.title }, `/bookings/${b.id}`);
    notify(ctx, b.guideId, 'review_prompt', { title: b.title }, `/bookings/${b.id}`);
  } else {
    b.status = 'cancelled';
    b.cancelledAt = ctx.nowIso;
    b.cancelledBy = b.cancelledBy || 'guide';
  }
}

// ---------- shapes ----------
function requestSummary(ctx: Ctx, r: TripRequest) {
  const offers = ctx.data.offers.filter((o) => o.requestId === r.id && !['withdrawn'].includes(o.status));
  const tourist = userById(ctx.data, r.touristId)!;
  return {
    ...r,
    tourist: { ...publicUser(tourist), stats: touristStats(ctx.data, tourist.id, ctx.now) },
    days: daysInclusive(r.startDate, r.endDate),
    cover: coverOf(ctx, r),
    offersCount: offers.length,
    avgOffer: offers.length ? Math.round(offers.reduce((a, o) => a + o.price, 0) / offers.length) : null,
    directGuide: r.directGuideId ? publicUser(userById(ctx.data, r.directGuideId)!) : null,
    // One trip a day: a guide already booked on any of these days can't offer.
    busyForMe: ctx.user?.role === 'guide' ? !isAvailable(ctx.data, guideOf(ctx.data, ctx.user.id)!, r.startDate, r.endDate) : false,
  };
}

function offerView(ctx: Ctx, o: Offer) {
  const g = guideOf(ctx.data, o.guideId)!;
  return { ...o, guide: guideCard(ctx.data, g, ctx.now), perDay: Math.round(o.price / Math.max(1, o.plan.length)) };
}

function bookingView(ctx: Ctx, b: Booking) {
  const req = ctx.data.requests.find((r) => r.id === b.requestId);
  const report = ctx.data.reports.find((r) => r.bookingId === b.id && r.status === 'open') || null;
  const myReview = ctx.user ? ctx.data.reviews.find((r) => r.bookingId === b.id && r.authorId === ctx.user!.id) : undefined;
  const theirReview = ctx.user ? ctx.data.reviews.find((r) => r.bookingId === b.id && r.authorId !== ctx.user!.id) : undefined;
  const canReview = !!ctx.user && b.status === 'completed' && !myReview && (ctx.user.id === b.touristId || ctx.user.id === b.guideId);
  return {
    ...b,
    milestones: ctx.data.milestones.filter((m) => m.bookingId === b.id).sort((a, c) => a.index - c.index),
    money: bookingMoney(ctx.data, b),
    tourist: publicUser(userById(ctx.data, b.touristId)!),
    guide: guideCard(ctx.data, guideOf(ctx.data, b.guideId)!, ctx.now),
    request: req ? { id: req.id, cities: req.cities, places: req.places, interests: req.interests, languages: req.languages } : null,
    offer: ctx.data.offers.find((o) => o.id === b.offerId) || null,
    report: report ? { id: report.id, reason: report.reason, reporterId: report.reporterId, createdAt: report.createdAt } : null,
    canReview,
    myReview: myReview ? reviewView(ctx.data, myReview) : null,
    theirReview: theirReview && reviewVisible(ctx.data, theirReview, ctx.now) ? reviewView(ctx.data, theirReview) : null,
    theirReviewPending: !!theirReview && !reviewVisible(ctx.data, theirReview, ctx.now),
    today: ctx.today,
  };
}

// ---------- validation of shared inputs ----------
function validLanguages(v: unknown) {
  if (!Array.isArray(v) || !v.length) throw bad('field_required', { field: 'languages' });
  if (v.length > GUIDE_LIMITS.languages) throw bad('field_too_long', { field: 'languages', max: GUIDE_LIMITS.languages });
  return v.map((l: any) => {
    if (!LANGUAGES.includes(l?.code) || !LANGUAGE_LEVELS.includes(l?.level)) throw bad('field_invalid', { field: 'languages' });
    return { code: l.code, level: l.level };
  });
}

function validPlan(v: unknown, days: number) {
  if (!Array.isArray(v) || v.length !== days) throw bad('plan_days', { days });
  return v.map((d: any, i: number) => ({
    title: str(d?.title, `plan.${i}.title`, 2, 80),
    details: optStr(d?.details, `plan.${i}.details`, 600),
  }));
}

// =====================================================================
// Meta
route('GET', '/meta', (ctx) => ({
  cities: ctx.data.cities.map(({ covers, ...c }) => c),
  cityCovers: Object.fromEntries(ctx.data.cities.map((c) => [c.slug, cityCovers(c)])),
  generalCovers: coversFor([], []),
  media: Object.fromEntries((ctx.data.media || []).map((m) => ['m:' + m.id, m.img])),
  places: ctx.data.places,
  placeKinds: PLACE_KINDS,
  languages: LANGUAGES,
  levels: LANGUAGE_LEVELS,
  interests: INTERESTS,
  includes: INCLUDES,
  guideRatingKeys: GUIDE_RATING_KEYS,
  touristRatingKeys: TOURIST_RATING_KEYS,
  photoLibrary: PHOTO_LIBRARY,
  feeRate: settings.feeRate,
  payments: {
    methods: ['card', 'cash'],
    cardSandbox: true,
    testCards: TEST_CARDS,
    guideSubscriptionPrice: ctx.data.platform.guideSubscriptionPrice,
    subscriptionDays: ctx.data.platform.subscriptionDays,
  },
  iqdPerUsd: ctx.data.platform.iqdPerUsd,
  confirmWindowHours: settings.confirmWindowHours,
  demoPhoneCode: settings.demoPhoneCode,
  demoLogins: settings.showDemoLogins ? { ...DEMO_ACCOUNTS, password: DEMO_PASSWORD } : null,
  today: ctx.today,
}));

// ---------- auth ----------
route('POST', '/auth/register', (ctx, _p, req) => {
  const b = req.body || {};
  const role = b.role === 'guide' ? 'guide' : b.role === 'tourist' ? 'tourist' : null;
  if (!role) throw bad('field_required', { field: 'role' });
  const name = str(b.name, 'name', 2, 60);
  const email = str(b.email, 'email', 3, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('email_invalid');
  if (typeof b.password !== 'string' || b.password.length < 8) throw bad('password_short');
  // Strong passwords: a capital letter, a small letter, a number and a symbol.
  if (!/[A-Z]/.test(b.password) || !/[a-z]/.test(b.password) || !/\d/.test(b.password) || !/[^A-Za-z0-9]/.test(b.password)) throw bad('password_weak');
  if (b.password.length > 200) throw bad('field_too_long', { field: 'password', max: 200 });
  if (ctx.data.users.some((u) => u.email === email)) throw conflict('email_taken');
  const country = str(b.country, 'country', 2, 60);
  const gender = b.gender === 'f' ? 'f' : b.gender === 'm' ? 'm' : null;
  if (!gender) throw bad('field_required', { field: 'gender' });
  const user: User = {
    id: nextId(ctx.data, 'users'),
    role,
    name,
    email,
    passwordHash: ctx.p.hashPassword(b.password),
    country,
    gender,
    avatarColor: ctx.data.users.length % AVATAR_COLORS,
    phone: '',
    phoneVerified: false,
    paymentVerified: false,
    status: 'active',
    createdAt: ctx.nowIso,
  };
  ctx.data.users.push(user);
  if (role === 'guide') {
    ctx.data.guides.push({
      userId: user.id,
      headline: '',
      headlineAr: '',
      bio: '',
      bioAr: '',
      pricePerDay: 40,
      cities: [],
      languages: [{ code: 'ar', level: 'native' }],
      specialities: [],
      places: [],
      photos: [],
      blockedDates: [],
      verification: 'none',
      verificationNote: '',
      verificationDocs: [],
      verificationRequestedAt: null,
      acceptsCash: false,
      subscriptionUntil: null,
      promotedUntil: null,
    });
  }
  const token = ctx.p.randomToken();
  ctx.data.sessions.push({ token, userId: user.id, createdAt: ctx.nowIso });
  return { token, user: meView(ctx, user) };
});

route('POST', '/auth/login', (ctx, _p, req) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const u = ctx.data.users.find((x) => x.email === email);
  if (!u || !ctx.p.verifyPassword(String(req.body?.password || ''), u.passwordHash)) throw new ApiError(401, 'login_failed');
  const token = ctx.p.randomToken();
  ctx.data.sessions.push({ token, userId: u.id, createdAt: ctx.nowIso });
  return { token, user: meView(ctx, u) };
});

route('POST', '/auth/logout', (ctx, _p, req) => {
  ctx.data.sessions = ctx.data.sessions.filter((s) => s.token !== req.token);
  return { ok: true };
});

function meView(ctx: Ctx, u: User) {
  const unreadNotifications = ctx.data.notifications.filter((n) => n.userId === u.id && !n.read).length;
  const unreadMessages = ctx.data.threads
    .filter((t) => t.touristId === u.id || t.guideId === u.id)
    .reduce((acc, t) => acc + ctx.data.messages.filter((m) => m.threadId === t.id && m.senderId !== u.id && m.id > (t.readAt[u.id] || 0)).length, 0);
  const g = u.role === 'guide' ? guideOf(ctx.data, u.id) : null;
  return {
    ...publicUser(u),
    name: u.name,
    email: u.email,
    phone: u.phone,
    savedCard: u.savedCard || null,
    passport: u.role === 'tourist' ? passportView(u) : null,
    gender: u.gender,
    status: u.status,
    unreadNotifications,
    unreadMessages,
    guide: g ? { ...g, profileComplete: !!(g.headline && g.bio && g.cities.length), subscriptionActive: subActive(ctx, g), cashOpen: cashOpen(g, ctx.now) } : null,
  };
}

route('GET', '/me', (ctx) => meView(ctx, need(ctx)));

// ---------- travel passport: tourists keep photo memories of their trips, shown on their profile ----------
const PASSPORT_MAX = 30;
const passportNo = (u: User) => 'TG-' + String(u.id).padStart(6, '0');
function passportView(u: User) {
  const pages = [...(u.passport || [])].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  return { number: passportNo(u), pages, cities: new Set(pages.map((p) => p.city)).size };
}
route('POST', '/me/passport', (ctx, _p, req) => {
  const u = needActive(ctx, 'tourist');
  const b = req.body || {};
  u.passport ||= [];
  if (u.passport.length >= PASSPORT_MAX) throw bad('passport_full', { max: PASSPORT_MAX });
  const img = imageData(b.img, 'img', 400_000);
  const place = str(b.place, 'place', 2, 60);
  const city = strList([b.city], 'city', ctx.data.cities.map((c) => c.slug), 1, 1)[0];
  if (!isDate(b.date)) throw bad('field_invalid', { field: 'date' });
  if (b.date > ctx.today) throw bad('date_future');
  const id = u.passport.reduce((a, p) => Math.max(a, p.id), 0) + 1;
  u.passport.push({ id, img, place, city, date: b.date, note: optStr(b.note, 'note', 160), createdAt: ctx.nowIso });
  return passportView(u);
});
route('DELETE', '/me/passport/:id', (ctx, p) => {
  const u = need(ctx, 'tourist');
  const before = (u.passport || []).length;
  u.passport = (u.passport || []).filter((x) => x.id !== Number(p.id));
  if (u.passport.length === before) throw notFound();
  return passportView(u);
});

route('PUT', '/me', (ctx, _p, req) => {
  const u = need(ctx);
  const b = req.body || {};
  if (b.name !== undefined) u.name = str(b.name, 'name', 2, 60);
  if (b.country !== undefined) u.country = str(b.country, 'country', 2, 60);
  if (b.email !== undefined) {
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw bad('email_invalid');
    if (email !== u.email && ctx.data.users.some((x) => x.email === email)) throw conflict('email_taken');
    u.email = email;
  }
  if (b.phone !== undefined) {
    const phone = optStr(b.phone, 'phone', 20);
    if (phone && !/^\+?[0-9 ]{7,20}$/.test(phone)) throw bad('phone_invalid');
    if (phone !== u.phone) u.phoneVerified = false;
    u.phone = phone;
  }
  // Profile and cover photos: a resized JPEG/PNG/WebP data URL, or null to remove.
  if (b.avatar !== undefined) u.avatar = b.avatar === null ? null : imageData(b.avatar, 'avatar', 200_000);
  if (b.cover !== undefined) u.cover = b.cover === null ? null : imageData(b.cover, 'cover', 450_000);
  return meView(ctx, u);
});

function imageData(v: unknown, field: string, max: number) {
  const img = String(v || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(img)) throw bad('photo_invalid');
  if (img.length > max) throw bad('photo_too_big', { field });
  return img;
}

// A payment card kept in the profile, for tourists and guides alike.
route('PUT', '/me/card', (ctx, _p, req) => {
  const u = needActive(ctx);
  if (u.role === 'admin') throw forbidden();
  u.savedCard = checkCard(ctx, req.body || {});
  return meView(ctx, u);
});

route('DELETE', '/me/card', (ctx) => {
  const u = need(ctx);
  u.savedCard = null;
  return meView(ctx, u);
});

// Guides add one photo from their tours straight from the + button.
route('POST', '/guide/photos', (ctx, _p, req) => {
  const u = needActive(ctx, 'guide');
  const g = guideOf(ctx.data, u.id)!;
  if (g.photos.length >= MAX_PHOTOS) throw bad('photos_full', { max: MAX_PHOTOS });
  const img = imageData(req.body?.img, 'img', 400_000);
  g.photos.push({ img, caption: optStr(req.body?.caption, 'caption', 80), captionAr: optStr(req.body?.captionAr, 'captionAr', 80) });
  return meView(ctx, u);
});

route('POST', '/me/verify-phone', (ctx, _p, req) => {
  const u = need(ctx);
  if (!u.phone) throw bad('phone_missing');
  if (String(req.body?.code || '').trim() !== settings.demoPhoneCode) throw bad('code_wrong');
  u.phoneVerified = true;
  return meView(ctx, u);
});

route('POST', '/me/verify-payment', (ctx, _p, req) => {
  const u = need(ctx, 'tourist');
  // Simulated: we only check the shape of a card number and never store it.
  const digits = String(req.body?.card || '').replace(/\s/g, '');
  if (!/^\d{12,19}$/.test(digits)) throw bad('card_invalid');
  u.paymentVerified = true;
  return meView(ctx, u);
});

// ---------- guides ----------
route('GET', '/guides', (ctx, _p, req) => {
  const q = req.query;
  let list = ctx.data.guides.filter((g) => {
    const u = userById(ctx.data, g.userId)!;
    return u.status === 'active' && g.cities.length > 0 && g.headline;
  });
  if (q.city) list = list.filter((g) => g.cities.includes(q.city));
  if (q.lang) list = list.filter((g) => g.languages.some((l) => l.code === q.lang));
  if (q.spec) list = list.filter((g) => g.specialities.includes(q.spec));
  if (q.maxPrice) list = list.filter((g) => g.pricePerDay <= Number(q.maxPrice));
  if (q.promoted === '1') list = list.filter((g) => promoActive(ctx, g));
  if (q.verified === '1') list = list.filter((g) => g.verification === 'verified');
  if (q.female === '1') list = list.filter((g) => userById(ctx.data, g.userId)!.gender === 'f');
  if (isDate(q.from) && isDate(q.to) && q.from <= q.to) list = list.filter((g) => isAvailable(ctx.data, g, q.from, q.to));
  if (q.q) {
    const term = q.q.trim().toLowerCase();
    list = list.filter((g) => {
      const u = userById(ctx.data, g.userId)!;
      const placeHit = g.places.some((id) => {
        const p = ctx.data.places.find((x) => x.id === id);
        return p && (p.name.toLowerCase().includes(term) || p.nameAr.includes(term));
      });
      const cityHit = g.cities.some((c) => {
        const city = ctx.data.cities.find((x) => x.slug === c)!;
        return city.name.toLowerCase().includes(term) || city.nameAr.includes(term);
      });
      return u.name.toLowerCase().includes(term) || g.headline.toLowerCase().includes(term) || g.headlineAr.includes(term) || placeHit || cityHit;
    });
  }
  let cards = list.map((g) => guideCard(ctx.data, g, ctx.now));
  if (q.minRating) cards = cards.filter((c) => (c.stats.rating || 0) >= Number(q.minRating));
  const sort = q.sort || 'best';
  const score = (c: (typeof cards)[number]) => (c.stats.rating || 4) * 10 + Math.min(c.stats.toursCompleted, 30) / 3 + (c.stats.verified ? 8 : 0) + (c.stats.topGuide ? 5 : 0);
  cards.sort((a, b) => {
    if (sort === 'price_low') return a.pricePerDay - b.pricePerDay;
    if (sort === 'price_high') return b.pricePerDay - a.pricePerDay;
    if (sort === 'rating') return (b.stats.rating || 0) - (a.stats.rating || 0) || b.stats.reviewsCount - a.stats.reviewsCount;
    if (sort === 'tours') return b.stats.toursCompleted - a.stats.toursCompleted;
    return score(b) - score(a);
  });
  return { guides: cards, total: cards.length };
});

route('GET', '/guides/:id', (ctx, p) => {
  const id = idOf(p.id);
  const g = guideOf(ctx.data, id);
  const u = userById(ctx.data, id);
  if (!g || !u) throw notFound();
  const stats = guideStats(ctx.data, id, ctx.now);
  const reviews = ctx.data.reviews
    .filter((r) => r.subjectId === id && r.authorRole === 'tourist' && reviewVisible(ctx.data, r, ctx.now))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => reviewView(ctx.data, r));
  return {
    ...guideCard(ctx.data, g, ctx.now),
    bio: g.bio,
    bioAr: g.bioAr,
    places: g.places,
    photos: g.photos,
    blockedDates: g.blockedDates,
    booked: bookedDates(ctx.data, id),
    stats,
    reviews,
    forMe: ctx.user?.role === 'tourist' ? withGuide(ctx, ctx.user, id) : null,
  };
});

// What a tourist already has going with this guide, so "Hire" goes to the right place
// instead of asking for the whole trip again.
function withGuide(ctx: Ctx, u: User, guideId: number) {
  const booking = ctx.data.bookings
    .filter((b) => b.touristId === u.id && b.guideId === guideId && ['awaiting_guide', 'confirmed'].includes(b.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const offer = ctx.data.offers
    .filter((o) => o.guideId === guideId && o.status === 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // the newest offer first
    .map((o) => ({ o, r: ctx.data.requests.find((r) => r.id === o.requestId)! }))
    .find(({ r }) => r && r.touristId === u.id && r.status === 'open');
  const openRequests = ctx.data.requests
    .filter((r) => r.touristId === u.id && r.status === 'open' && (r.directGuideId === null || r.directGuideId === guideId))
    .filter((r) => !ctx.data.offers.some((o) => o.requestId === r.id && o.guideId === guideId && ['pending', 'awarded', 'accepted'].includes(o.status)))
    .map((r) => ({ id: r.id, title: r.title, startDate: r.startDate, endDate: r.endDate, invited: r.invited.includes(guideId) || r.directGuideId === guideId }));
  return {
    booking: booking ? { id: booking.id, status: booking.status, title: booking.title } : null,
    offer: offer ? { id: offer.o.id, requestId: offer.r.id, price: offer.o.price, title: offer.r.title } : null,
    openRequests,
  };
}

route('PUT', '/guide/profile', (ctx, _p, req) => {
  const u = needActive(ctx, 'guide');
  const g = guideOf(ctx.data, u.id)!;
  const b = req.body || {};
  if (b.headline !== undefined) g.headline = str(b.headline, 'headline', 5, 90);
  if (b.headlineAr !== undefined) g.headlineAr = optStr(b.headlineAr, 'headlineAr', 90);
  if (b.bio !== undefined) g.bio = str(b.bio, 'bio', 30, 1500);
  if (b.bioAr !== undefined) g.bioAr = optStr(b.bioAr, 'bioAr', 1500);
  if (b.pricePerDay !== undefined) g.pricePerDay = num(b.pricePerDay, 'pricePerDay', 10, 1000, true);
  if (b.acceptsCash !== undefined) g.acceptsCash = !!b.acceptsCash;
  if (b.cities !== undefined) g.cities = strList(b.cities, 'cities', ctx.data.cities.map((c) => c.slug), 1, 8);
  if (b.languages !== undefined) g.languages = validLanguages(b.languages);
  if (b.specialities !== undefined) g.specialities = strList(b.specialities, 'specialities', INTERESTS, 0, GUIDE_LIMITS.specialities);
  if (b.places !== undefined) {
    const ids = Array.isArray(b.places) ? [...new Set(b.places.map(Number))] : [];
    for (const id of ids) if (!ctx.data.places.some((x) => x.id === id)) throw bad('field_invalid', { field: 'places' });
    if (ids.length > GUIDE_LIMITS.places) throw bad('field_too_long', { field: 'places', max: GUIDE_LIMITS.places });
    g.places = ids as number[];
  }
  if (b.blockedDates !== undefined) {
    if (!Array.isArray(b.blockedDates) || b.blockedDates.length > 366 || !b.blockedDates.every(isDate)) throw bad('field_invalid', { field: 'blockedDates' });
    g.blockedDates = [...new Set(b.blockedDates as string[])].sort();
  }
  if (b.photos !== undefined) {
    if (!Array.isArray(b.photos) || b.photos.length > MAX_PHOTOS) throw bad('field_too_long', { field: 'photos', max: MAX_PHOTOS });
    g.photos = b.photos.map((ph: any) => {
      const img = String(ph?.img || '');
      const lib = img.startsWith('lib:') && PHOTO_LIBRARY.includes(img.slice(4));
      const upload = /^data:image\/(jpeg|png|webp);base64,/.test(img) && img.length < 400_000;
      if (!lib && !upload) throw bad('photo_invalid');
      return { img, caption: optStr(ph?.caption, 'caption', 80), captionAr: optStr(ph?.captionAr, 'captionAr', 80) };
    });
  }
  return meView(ctx, u);
});

// Guides pay (price set by the admin) to be featured on the home screen for a while.
route('GET', '/guide/promotion', (ctx) => {
  const u = need(ctx, 'guide');
  const g = guideOf(ctx.data, u.id)!;
  return { price: ctx.data.platform.promotionPrice, days: ctx.data.platform.promotionDays, until: g.promotedUntil, active: promoActive(ctx, g) };
});

route('POST', '/guide/promotion', (ctx, _p, req) => {
  const u = needActive(ctx, 'guide');
  const g = guideOf(ctx.data, u.id)!;
  if (!(g.headline && g.cities.length)) throw conflict('profile_incomplete');
  const { promotionPrice: price, promotionDays: days } = ctx.data.platform;
  if (price > 0) chargeCard(ctx, u, req.body?.card, price, 'promotion', u.id);
  const from = promoActive(ctx, g) ? new Date(g.promotedUntil!) : ctx.now;
  g.promotedUntil = new Date(from.getTime() + days * 86400_000).toISOString();
  notify(ctx, u.id, 'promotion_active', { until: g.promotedUntil.slice(0, 10) }, '/profile/guide');
  return { price, days, until: g.promotedUntil, active: true };
});

// Guides subscribe (price set by the admin) to take cash bookings; card bookings carry the usual fee instead.
route('GET', '/guide/subscription', (ctx) => {
  const u = need(ctx, 'guide');
  const g = guideOf(ctx.data, u.id)!;
  const history = ctx.data.payments.filter((p) => p.purpose === 'subscription' && p.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { price: ctx.data.platform.guideSubscriptionPrice, days: ctx.data.platform.subscriptionDays, until: g.subscriptionUntil, active: subActive(ctx, g), acceptsCash: g.acceptsCash, history };
});

route('POST', '/guide/subscription', (ctx, _p, req) => {
  const u = needActive(ctx, 'guide');
  const g = guideOf(ctx.data, u.id)!;
  const { guideSubscriptionPrice: price, subscriptionDays: days } = ctx.data.platform;
  if (price > 0) chargeCard(ctx, u, req.body?.card, price, 'subscription', u.id);
  const from = subActive(ctx, g) ? new Date(g.subscriptionUntil!) : ctx.now;
  g.subscriptionUntil = new Date(from.getTime() + days * 86400_000).toISOString();
  if (req.body?.acceptCash !== false) g.acceptsCash = true;
  notify(ctx, u.id, 'subscription_active', { until: g.subscriptionUntil.slice(0, 10) }, '/profile/guide');
  return { price, days, until: g.subscriptionUntil, active: true, acceptsCash: g.acceptsCash };
});

route('POST', '/guide/verification', (ctx, _p, req) => {
  const u = needActive(ctx, 'guide');
  const g = guideOf(ctx.data, u.id)!;
  if (g.verification === 'verified') throw conflict('already_verified');
  if (g.verification === 'pending') throw conflict('verification_pending');
  if (!g.headline || !g.bio || !g.cities.length) throw bad('profile_incomplete');
  const docs = strList(req.body?.docs, 'docs', null, 1, 4).map((d) => d.slice(0, 120));
  g.verification = 'pending';
  g.verificationDocs = docs;
  g.verificationNote = '';
  g.verificationRequestedAt = ctx.nowIso;
  notifyAdmins(ctx, 'verification_new', { name: u.name }, '/admin');
  return meView(ctx, u);
});

// Public tourist profile, for guides deciding whether to send an offer.
route('GET', '/users/:id', (ctx, p) => {
  need(ctx);
  const u = userById(ctx.data, idOf(p.id));
  if (!u || u.role === 'admin') throw notFound();
  if (u.role === 'guide') return { redirect: `/guides/${u.id}` };
  const reviews = ctx.data.reviews
    .filter((r) => r.subjectId === u.id && r.authorRole === 'guide' && reviewVisible(ctx.data, r, ctx.now))
    .map((r) => reviewView(ctx.data, r));
  return { ...publicUser(u), stats: touristStats(ctx.data, u.id, ctx.now), reviews, passport: passportView(u) };
});

// ---------- trip requests ----------
function parseRequestBody(ctx: Ctx, b: any) {
  const startDate = b.startDate;
  const endDate = b.endDate;
  if (!isDate(startDate) || !isDate(endDate)) throw bad('dates_required');
  if (startDate < ctx.today) throw bad('date_past');
  if (endDate < startDate) throw bad('dates_order');
  if (daysInclusive(startDate, endDate) > 30) throw bad('trip_too_long');
  const cities = strList(b.cities, 'cities', ctx.data.cities.map((c) => c.slug), 1, TRIP_LIMITS.cities);
  const places = (Array.isArray(b.places) ? b.places.map(Number) : []).filter((id: number) => ctx.data.places.some((p) => p.id === id));
  if (places.length > TRIP_LIMITS.places) throw bad('field_too_long', { field: 'places', max: TRIP_LIMITS.places });
  const budgetMin = num(b.budgetMin, 'budgetMin', 0, 100000);
  const budgetMax = num(b.budgetMax, 'budgetMax', 10, 100000);
  if (budgetMax < budgetMin) throw bad('budget_order');
  return {
    title: str(b.title, 'title', 5, 90),
    description: optStr(b.description, 'description', 2000),
    cities,
    places,
    startDate,
    endDate,
    groupSize: num(b.groupSize, 'groupSize', 1, TRIP_LIMITS.people, true),
    languages: strList(b.languages, 'languages', LANGUAGES, 1, TRIP_LIMITS.languages),
    interests: strList(b.interests, 'interests', INTERESTS, 0, TRIP_LIMITS.interests),
    budgetMin,
    budgetMax,
    urgent: !!b.urgent,
    femaleGuide: !!b.femaleGuide,
    plan: touristPlan(b.plan, daysInclusive(startDate, endDate)),
    cover: tripCover(ctx, b.cover, cities),
  };
}

// The cover must be one of the pictures of the trip's governorates; none chosen = the first city's first.
function tripCover(ctx: Ctx, v: unknown, cities: string[]) {
  const allowed = coversFor(ctx.data.cities, cities);
  if (v === undefined || v === null || v === '') return allowed[0];
  if (typeof v !== 'string' || !allowed.includes(v)) throw bad('field_invalid', { field: 'cover' });
  return v;
}
const coverOf = (ctx: Ctx, r: TripRequest) => r.cover || coversFor(ctx.data.cities, r.cities)[0];

// The tourist's own day plan is optional: days left blank are kept as blank, and no titles means no plan.
function touristPlan(v: unknown, days: number) {
  if (!Array.isArray(v) || v.length === 0) return [];
  if (v.length > days) throw bad('plan_days', { days });
  const plan = v.map((d: any, i: number) => ({ title: optStr(d?.title, `plan.${i}.title`, 80), details: optStr(d?.details, `plan.${i}.details`, 600) }));
  return plan.some((d) => d.title || d.details) ? plan : [];
}

route('POST', '/requests', (ctx, _p, req) => {
  const u = needActive(ctx, 'tourist');
  const fields = parseRequestBody(ctx, req.body || {});
  let directGuideId: number | null = null;
  if (req.body?.directGuideId) {
    const g = guideOf(ctx.data, Number(req.body.directGuideId));
    if (!g || userById(ctx.data, g.userId)!.status !== 'active') throw bad('guide_unavailable');
    directGuideId = g.userId;
  }
  const r: TripRequest = { id: nextId(ctx.data, 'requests'), touristId: u.id, ...fields, status: 'open', directGuideId, invited: [], createdAt: ctx.nowIso };
  ctx.data.requests.push(r);
  if (directGuideId) {
    notify(ctx, directGuideId, 'direct_request', { name: publicUser(u).name, title: r.title }, `/requests/${r.id}`);
  }
  return requestSummary(ctx, r);
});

route('GET', '/requests', (ctx, _p, req) => {
  const u = need(ctx, 'guide', 'admin');
  const q = req.query;
  const g = u.role === 'guide' ? guideOf(ctx.data, u.id)! : null;
  let list = ctx.data.requests.filter((r) => r.status === 'open' && (r.directGuideId === null || r.directGuideId === u.id));
  list = list.filter((r) => userById(ctx.data, r.touristId)!.status === 'active');
  if (q.city) list = list.filter((r) => r.cities.includes(q.city));
  if (q.lang) list = list.filter((r) => r.languages.includes(q.lang));
  if (q.interest) list = list.filter((r) => r.interests.includes(q.interest));
  if (q.matching === '1' && g) {
    const langs = g.languages.map((l) => l.code);
    list = list.filter((r) => r.cities.some((c) => g.cities.includes(c)) && r.languages.some((l) => langs.includes(l)));
  }
  if (q.q) {
    const t = q.q.toLowerCase();
    list = list.filter((r) => r.title.toLowerCase().includes(t) || r.description.toLowerCase().includes(t));
  }
  list.sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(b.directGuideId === u.id) - Number(a.directGuideId === u.id) || b.createdAt.localeCompare(a.createdAt));
  return {
    requests: list.map((r) => {
      const mine = ctx.data.offers.find((o) => o.requestId === r.id && o.guideId === u.id && o.status !== 'withdrawn');
      return { ...requestSummary(ctx, r), invitedMe: r.invited.includes(u.id), myOffer: mine ? { id: mine.id, price: mine.price, status: mine.status } : null };
    }),
  };
});

route('GET', '/requests/mine', (ctx) => {
  const u = need(ctx, 'tourist');
  const list = ctx.data.requests.filter((r) => r.touristId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    requests: list.map((r) => {
      const booking = ctx.data.bookings.filter((b) => b.requestId === r.id).sort((a, b) => b.id - a.id)[0];
      return { ...requestSummary(ctx, r), booking: booking ? { id: booking.id, status: booking.status } : null };
    }),
  };
});

route('GET', '/requests/:id', (ctx, p) => {
  const u = need(ctx);
  const r = findRequest(ctx.data, idOf(p.id));
  const isOwner = r.touristId === u.id;
  if (u.role === 'tourist' && !isOwner) throw notFound();
  if (u.role === 'guide' && r.directGuideId !== null && r.directGuideId !== u.id) throw notFound();
  const all = ctx.data.offers.filter((o) => o.requestId === r.id && o.status !== 'withdrawn');
  const booking = ctx.data.bookings.filter((b) => b.requestId === r.id).sort((a, b) => b.id - a.id)[0];
  const base = {
    ...requestSummary(ctx, r),
    booking:
      booking && (isOwner || u.role === 'admin' || booking.guideId === u.id)
        ? { id: booking.id, status: booking.status, guideId: booking.guideId, guideName: publicUser(userById(ctx.data, booking.guideId)!).name, total: booking.total, confirmBy: booking.confirmBy }
        : null,
  };
  if (isOwner || u.role === 'admin') {
    return { ...base, offers: all.map((o) => offerView(ctx, o)), invitedGuides: r.invited };
  }
  const mine = all.find((o) => o.guideId === u.id);
  return { ...base, offers: mine ? [offerView(ctx, mine)] : [], invitedMe: r.invited.includes(u.id) };
});

route('POST', '/requests/:id/close', (ctx, p) => {
  const u = need(ctx, 'tourist');
  const r = findRequest(ctx.data, idOf(p.id));
  if (r.touristId !== u.id) throw notFound();
  if (r.status !== 'open') throw conflict('request_not_open');
  r.status = 'closed';
  for (const o of ctx.data.offers.filter((o) => o.requestId === r.id && o.status === 'pending')) {
    o.status = 'not_selected';
    notify(ctx, o.guideId, 'request_closed', { title: r.title }, `/requests/${r.id}`);
  }
  return requestSummary(ctx, r);
});

route('GET', '/requests/:id/suggested-guides', (ctx, p) => {
  const u = need(ctx, 'tourist');
  const r = findRequest(ctx.data, idOf(p.id));
  if (r.touristId !== u.id) throw notFound();
  const offered = new Set(ctx.data.offers.filter((o) => o.requestId === r.id).map((o) => o.guideId));
  const list = ctx.data.guides
    .filter((g) => !offered.has(g.userId) && userById(ctx.data, g.userId)!.status === 'active' && g.headline)
    .filter((g) => g.cities.some((c) => r.cities.includes(c)) && g.languages.some((l) => r.languages.includes(l.code)))
    .filter((g) => isAvailable(ctx.data, g, r.startDate, r.endDate))
    .filter((g) => !r.femaleGuide || userById(ctx.data, g.userId)!.gender === 'f')
    .map((g) => ({ ...guideCard(ctx.data, g, ctx.now), invited: r.invited.includes(g.userId) }));
  list.sort((a, b) => (b.stats.rating || 0) - (a.stats.rating || 0));
  return { guides: list.slice(0, 8) };
});

route('POST', '/requests/:id/invite', (ctx, p, req) => {
  const u = needActive(ctx, 'tourist');
  const r = findRequest(ctx.data, idOf(p.id));
  if (r.touristId !== u.id) throw notFound();
  if (r.status !== 'open') throw conflict('request_not_open');
  const g = guideOf(ctx.data, Number(req.body?.guideId));
  if (!g) throw bad('guide_unavailable');
  if (!r.invited.includes(g.userId)) {
    r.invited.push(g.userId);
    notify(ctx, g.userId, 'invited', { name: publicUser(u).name, title: r.title }, `/requests/${r.id}`);
  }
  return { invited: r.invited };
});

// ---------- offers ----------
function parseOffer(b: any, days: number) {
  return {
    price: num(b.price, 'price', 10, 100000),
    plan: validPlan(b.plan, days),
    includes: strList(b.includes, 'includes', INCLUDES, 0, INCLUDES.length),
    message: str(b.message, 'message', 10, 2000),
  };
}

route('POST', '/requests/:id/offers', (ctx, p, req) => {
  const u = needActive(ctx, 'guide');
  const g = guideOf(ctx.data, u.id)!;
  if (!g.headline || !g.cities.length) throw bad('profile_incomplete');
  const r = findRequest(ctx.data, idOf(p.id));
  if (r.directGuideId !== null && r.directGuideId !== u.id) throw notFound();
  if (r.status !== 'open') throw conflict('request_not_open');
  if (ctx.data.offers.some((o) => o.requestId === r.id && o.guideId === u.id && ['pending', 'awarded', 'accepted'].includes(o.status))) throw conflict('offer_exists');
  if (!isAvailable(ctx.data, g, r.startDate, r.endDate)) throw conflict('busy_those_days');
  const fields = parseOffer(req.body || {}, daysInclusive(r.startDate, r.endDate));
  const o: Offer = { id: nextId(ctx.data, 'offers'), requestId: r.id, guideId: u.id, ...fields, status: 'pending', shortlisted: false, createdAt: ctx.nowIso, updatedAt: ctx.nowIso };
  ctx.data.offers.push(o);
  notify(ctx, r.touristId, 'offer_new', { name: u.name, title: r.title, price: o.price }, `/requests/${r.id}`);
  return offerView(ctx, o);
});

function findOffer(ctx: Ctx, id: number) {
  const o = ctx.data.offers.find((x) => x.id === id);
  if (!o) throw notFound();
  return o;
}

route('PUT', '/offers/:id', (ctx, p, req) => {
  const u = needActive(ctx, 'guide');
  const o = findOffer(ctx, idOf(p.id));
  if (o.guideId !== u.id) throw notFound();
  const r = findRequest(ctx.data, o.requestId);
  if (o.status !== 'pending' || r.status !== 'open') throw conflict('offer_locked');
  Object.assign(o, parseOffer(req.body || {}, daysInclusive(r.startDate, r.endDate)), { updatedAt: ctx.nowIso });
  notify(ctx, r.touristId, 'offer_updated', { name: u.name, title: r.title, price: o.price }, `/requests/${r.id}`);
  return offerView(ctx, o);
});

route('POST', '/offers/:id/withdraw', (ctx, p) => {
  const u = need(ctx, 'guide');
  const o = findOffer(ctx, idOf(p.id));
  if (o.guideId !== u.id) throw notFound();
  if (o.status !== 'pending') throw conflict('offer_locked');
  o.status = 'withdrawn';
  o.updatedAt = ctx.nowIso;
  return { ok: true };
});

route('POST', '/offers/:id/shortlist', (ctx, p, req) => {
  const u = need(ctx, 'tourist');
  const o = findOffer(ctx, idOf(p.id));
  const r = findRequest(ctx.data, o.requestId);
  if (r.touristId !== u.id) throw notFound();
  o.shortlisted = !!req.body?.on;
  return { shortlisted: o.shortlisted };
});

route('GET', '/offers/mine', (ctx) => {
  const u = need(ctx, 'guide');
  const list = ctx.data.offers.filter((o) => o.guideId === u.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    offers: list.map((o) => {
      const r = ctx.data.requests.find((x) => x.id === o.requestId)!;
      const booking = ctx.data.bookings.find((b) => b.offerId === o.id);
      return { ...o, request: requestSummary(ctx, r), booking: booking ? { id: booking.id, status: booking.status } : null };
    }),
  };
});

// Hiring: the tourist pays into holding, the guide has a window to confirm.
route('POST', '/offers/:id/hire', (ctx, p, req) => {
  const u = needActive(ctx, 'tourist');
  const o = findOffer(ctx, idOf(p.id));
  const r = findRequest(ctx.data, o.requestId);
  if (r.touristId !== u.id) throw notFound();
  if (r.status !== 'open' || o.status !== 'pending') throw conflict('cannot_hire');
  if (req.body?.confirmPayment !== true) throw bad('payment_confirm_required');
  const method: PaymentMethod = req.body?.method === 'cash' ? 'cash' : 'card';
  const guideUser = userById(ctx.data, o.guideId)!;
  if (guideUser.status !== 'active') throw conflict('guide_unavailable');
  const g = guideOf(ctx.data, o.guideId)!;
  if (!isAvailable(ctx.data, g, r.startDate, r.endDate)) throw conflict('guide_busy');
  if (method === 'cash' && !cashOpen(g, ctx.now)) throw conflict('cash_not_accepted');
  const bookingId = ctx.data.seq.bookings + 1;
  const charge = method === 'card' ? chargeCard(ctx, u, req.body?.card, o.price, 'booking', bookingId) : null;
  if (charge) u.paymentVerified = true;

  const b: Booking = {
    id: nextId(ctx.data, 'bookings'),
    requestId: r.id,
    offerId: o.id,
    touristId: u.id,
    guideId: o.guideId,
    title: r.title,
    startDate: r.startDate,
    endDate: r.endDate,
    groupSize: r.groupSize,
    total: o.price,
    feeRate: method === 'card' ? settings.feeRate : 0,
    paymentMethod: method,
    cardLast4: charge ? charge.last4 : '',
    status: 'awaiting_guide',
    statusBeforeDispute: null,
    createdAt: ctx.nowIso,
    confirmBy: new Date(ctx.now.getTime() + settings.confirmWindowHours * 3600_000).toISOString(),
    confirmedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: '',
  };
  ctx.data.bookings.push(b);
  const days = dateRange(r.startDate, r.endDate);
  const each = Math.floor((o.price / days.length) * 100) / 100;
  days.forEach((date, i) => {
    const amount = i === days.length - 1 ? money(o.price - each * (days.length - 1)) : each;
    const m: Milestone = { id: nextId(ctx.data, 'milestones'), bookingId: b.id, index: i, date, title: o.plan[i]?.title || `Day ${i + 1}`, amount, status: method === 'cash' ? 'cash_due' : 'held', fundedAt: ctx.nowIso, settledAt: null };
    ctx.data.milestones.push(m);
  });
  o.status = 'awarded';
  r.status = 'awarded';
  notify(ctx, o.guideId, method === 'cash' ? 'hired_cash' : 'hired', { name: publicUser(u).name, title: r.title, price: o.price }, `/bookings/${b.id}`);
  return bookingView(ctx, b);
});

// ---------- bookings ----------
function participant(ctx: Ctx, b: Booking) {
  const u = need(ctx);
  if (u.role === 'admin') return u;
  if (u.id !== b.touristId && u.id !== b.guideId) throw notFound();
  return u;
}

route('GET', '/bookings', (ctx) => {
  const u = need(ctx);
  const list = ctx.data.bookings.filter((b) => b.touristId === u.id || b.guideId === u.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return { bookings: list.map((b) => bookingView(ctx, b)) };
});

route('GET', '/bookings/:id', (ctx, p) => {
  const b = findBooking(ctx.data, idOf(p.id));
  participant(ctx, b);
  return bookingView(ctx, b);
});

route('POST', '/bookings/:id/confirm', (ctx, p) => {
  const u = needActive(ctx, 'guide');
  const b = findBooking(ctx.data, idOf(p.id));
  if (b.guideId !== u.id) throw notFound();
  if (b.status !== 'awaiting_guide') throw conflict('booking_state');
  const g = guideOf(ctx.data, u.id)!;
  if (!isAvailable(ctx.data, g, b.startDate, b.endDate, b.id)) throw conflict('guide_busy');
  b.status = 'confirmed';
  b.confirmedAt = ctx.nowIso;
  const o = ctx.data.offers.find((x) => x.id === b.offerId)!;
  o.status = 'accepted';
  const r = findRequest(ctx.data, b.requestId);
  r.status = 'hired';
  for (const other of ctx.data.offers.filter((x) => x.requestId === r.id && x.id !== o.id && x.status === 'pending')) {
    other.status = 'not_selected';
    notify(ctx, other.guideId, 'offer_not_selected', { title: r.title }, `/requests/${r.id}`);
  }
  notify(ctx, b.touristId, 'booking_confirmed', { name: u.name, title: b.title }, `/bookings/${b.id}`);
  // One trip a day: the guide's other open offers on any of these days are withdrawn.
  for (const other of ctx.data.offers.filter((x) => x.guideId === u.id && x.id !== o.id && x.status === 'pending')) {
    const rr = ctx.data.requests.find((q) => q.id === other.requestId);
    if (rr && rr.startDate <= b.endDate && b.startDate <= rr.endDate) {
      other.status = 'withdrawn';
      other.updatedAt = ctx.nowIso;
      notify(ctx, rr.touristId, 'offer_withdrawn_busy', { name: u.name, title: rr.title }, `/requests/${rr.id}`);
    }
  }
  return bookingView(ctx, b);
});

route('POST', '/bookings/:id/decline', (ctx, p) => {
  const u = need(ctx, 'guide');
  const b = findBooking(ctx.data, idOf(p.id));
  if (b.guideId !== u.id) throw notFound();
  if (b.status !== 'awaiting_guide') throw conflict('booking_state');
  b.status = 'declined';
  refundHeld(ctx, b);
  const o = ctx.data.offers.find((x) => x.id === b.offerId)!;
  o.status = 'declined';
  reopenRequest(ctx, b.requestId);
  notify(ctx, b.touristId, 'booking_declined', { name: u.name, title: b.title, amount: b.total }, `/requests/${b.requestId}`);
  return bookingView(ctx, b);
});

route('POST', '/bookings/:id/cancel', (ctx, p, req) => {
  const b = findBooking(ctx.data, idOf(p.id));
  const u = participant(ctx, b);
  if (u.role === 'admin') throw forbidden();
  const asGuide = u.id === b.guideId;
  const wasAwaiting = b.status === 'awaiting_guide';
  if (b.status === 'awaiting_guide') {
    if (asGuide) throw conflict('use_decline');
  } else if (b.status === 'confirmed') {
    if (ctx.today >= b.startDate) throw conflict('tour_started');
  } else throw conflict('booking_state');
  b.status = 'cancelled';
  b.cancelledAt = ctx.nowIso;
  b.cancelledBy = asGuide ? 'guide' : 'tourist';
  b.cancelReason = optStr(req.body?.reason, 'reason', 500);
  refundHeld(ctx, b);
  const o = ctx.data.offers.find((x) => x.id === b.offerId)!;
  o.status = 'declined';
  if (asGuide) {
    reopenRequest(ctx, b.requestId);
    notify(ctx, b.touristId, 'booking_cancelled_by_guide', { name: u.name, title: b.title, amount: b.total }, `/requests/${b.requestId}`);
  } else if (wasAwaiting) {
    // Changed their mind before the guide confirmed: the trip opens again so they can hire someone else.
    reopenRequest(ctx, b.requestId);
    notify(ctx, b.guideId, 'booking_cancelled_by_tourist', { name: publicUser(u).name, title: b.title }, `/bookings/${b.id}`);
  } else {
    const r = findRequest(ctx.data, b.requestId);
    r.status = 'closed';
    notify(ctx, b.guideId, 'booking_cancelled_by_tourist', { name: publicUser(u).name, title: b.title }, `/bookings/${b.id}`);
  }
  return bookingView(ctx, b);
});

function findMilestone(ctx: Ctx, id: number) {
  const m = ctx.data.milestones.find((x) => x.id === id);
  if (!m) throw notFound();
  return { m, b: findBooking(ctx.data, m.bookingId) };
}

route('POST', '/milestones/:id/release', (ctx, p) => {
  const u = needActive(ctx, 'tourist');
  const { m, b } = findMilestone(ctx, idOf(p.id));
  if (b.touristId !== u.id) throw notFound();
  if (b.status !== 'confirmed') throw conflict('booking_state');
  if (m.status !== 'held' && m.status !== 'release_requested') throw conflict('milestone_state');
  m.status = 'released';
  m.settledAt = ctx.nowIso;
  notify(ctx, b.guideId, 'payment_released', { title: b.title, amount: money(m.amount * (1 - b.feeRate)), day: m.index + 1 }, `/bookings/${b.id}`);
  checkComplete(ctx, b);
  return bookingView(ctx, b);
});

route('POST', '/milestones/:id/request-release', (ctx, p) => {
  const u = needActive(ctx, 'guide');
  const { m, b } = findMilestone(ctx, idOf(p.id));
  if (b.guideId !== u.id) throw notFound();
  if (b.status !== 'confirmed') throw conflict('booking_state');
  if (m.status !== 'held') throw conflict('milestone_state');
  if (m.date > ctx.today) throw conflict('day_not_reached');
  m.status = 'release_requested';
  notify(ctx, b.touristId, 'release_requested', { name: u.name, title: b.title, amount: m.amount, day: m.index + 1 }, `/bookings/${b.id}`);
  return bookingView(ctx, b);
});

route('POST', '/milestones/:id/refund', (ctx, p) => {
  const u = need(ctx, 'guide');
  const { m, b } = findMilestone(ctx, idOf(p.id));
  if (b.guideId !== u.id) throw notFound();
  if (b.status !== 'confirmed') throw conflict('booking_state');
  if (m.status !== 'held' && m.status !== 'release_requested') throw conflict('milestone_state');
  m.status = 'refunded';
  m.settledAt = ctx.nowIso;
  notify(ctx, b.touristId, 'payment_refunded', { name: u.name, title: b.title, amount: m.amount, day: m.index + 1 }, `/bookings/${b.id}`);
  checkComplete(ctx, b);
  return bookingView(ctx, b);
});

// Cash bookings: the guide confirms each day's cash once they have it in hand.
route('POST', '/milestones/:id/cash-received', (ctx, p) => {
  const u = needActive(ctx, 'guide');
  const { m, b } = findMilestone(ctx, idOf(p.id));
  if (b.guideId !== u.id) throw notFound();
  if (b.paymentMethod !== 'cash') throw conflict('not_cash_booking');
  if (b.status !== 'confirmed') throw conflict('booking_state');
  if (m.status !== 'cash_due') throw conflict('milestone_state');
  if (m.date > ctx.today) throw conflict('day_not_reached');
  m.status = 'cash_paid';
  m.settledAt = ctx.nowIso;
  notify(ctx, b.touristId, 'cash_confirmed', { name: u.name, title: b.title, amount: m.amount, day: m.index + 1 }, `/bookings/${b.id}`);
  checkComplete(ctx, b);
  return bookingView(ctx, b);
});

route('POST', '/bookings/:id/report', (ctx, p, req) => {
  const b = findBooking(ctx.data, idOf(p.id));
  const u = participant(ctx, b);
  if (u.role === 'admin') throw forbidden();
  if (!['awaiting_guide', 'confirmed'].includes(b.status)) throw conflict('booking_state');
  if (ctx.data.reports.some((r) => r.bookingId === b.id && r.status === 'open')) throw conflict('report_exists');
  const reasons = ['no_show', 'not_as_agreed', 'safety', 'payment', 'other'];
  const reason = String(req.body?.reason || '');
  if (!reasons.includes(reason)) throw bad('field_required', { field: 'reason' });
  const details = str(req.body?.details, 'details', 10, 2000);
  const againstId = u.id === b.touristId ? b.guideId : b.touristId;
  ctx.data.reports.push({ id: nextId(ctx.data, 'reports'), bookingId: b.id, reporterId: u.id, againstId, reason, details, status: 'open', resolution: '', adminNote: '', createdAt: ctx.nowIso, resolvedAt: null });
  b.statusBeforeDispute = b.status;
  b.status = 'disputed';
  notifyAdmins(ctx, 'report_new', { title: b.title }, '/admin');
  notify(ctx, againstId, 'report_filed', { title: b.title }, `/bookings/${b.id}`);
  return bookingView(ctx, b);
});

route('POST', '/bookings/:id/review', (ctx, p, req) => {
  const b = findBooking(ctx.data, idOf(p.id));
  const u = participant(ctx, b);
  if (u.role === 'admin') throw forbidden();
  if (b.status !== 'completed') throw conflict('booking_state');
  if (ctx.data.reviews.some((r) => r.bookingId === b.id && r.authorId === u.id)) throw conflict('review_exists');
  const asTourist = u.id === b.touristId;
  const keys = asTourist ? GUIDE_RATING_KEYS : TOURIST_RATING_KEYS;
  const ratings: Record<string, number> = {};
  for (const k of keys) ratings[k] = num(req.body?.ratings?.[k], `ratings.${k}`, 1, 5, true);
  const overall = Math.round((Object.values(ratings).reduce((a, x) => a + x, 0) / keys.length) * 10) / 10;
  const review = {
    id: nextId(ctx.data, 'reviews'),
    bookingId: b.id,
    authorId: u.id,
    subjectId: asTourist ? b.guideId : b.touristId,
    authorRole: (asTourist ? 'tourist' : 'guide') as 'tourist' | 'guide',
    overall,
    ratings,
    hireAgain: !!req.body?.hireAgain,
    comment: str(req.body?.comment, 'comment', 10, 1500),
    createdAt: ctx.nowIso,
  };
  ctx.data.reviews.push(review);
  notify(ctx, review.subjectId, 'review_received', { name: asTourist ? publicUser(u).name : u.name, title: b.title }, `/bookings/${b.id}`);
  return bookingView(ctx, b);
});

// ---------- messages ----------
function threadView(ctx: Ctx, t: (typeof ctx.data.threads)[number], me: User) {
  const otherId = me.id === t.touristId ? t.guideId : t.touristId;
  const other = userById(ctx.data, otherId)!;
  const msgs = ctx.data.messages.filter((m) => m.threadId === t.id);
  const last = msgs[msgs.length - 1] || null;
  const unread = msgs.filter((m) => m.senderId !== me.id && m.id > (t.readAt[me.id] || 0)).length;
  const r = t.requestId ? ctx.data.requests.find((x) => x.id === t.requestId) : null;
  return { id: t.id, other: publicUser(other), last, unread, lastAt: t.lastAt, request: r ? { id: r.id, title: r.title } : null };
}

function findThread(ctx: Ctx, id: number, me: User) {
  const t = ctx.data.threads.find((x) => x.id === id);
  if (!t || (t.touristId !== me.id && t.guideId !== me.id && me.role !== 'admin')) throw notFound();
  return t;
}

route('GET', '/threads', (ctx) => {
  const u = need(ctx);
  const list = ctx.data.threads.filter((t) => t.touristId === u.id || t.guideId === u.id).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return { threads: list.map((t) => threadView(ctx, t, u)) };
});

route('POST', '/threads', (ctx, _p, req) => {
  const u = needActive(ctx, 'tourist', 'guide');
  const requestId = req.body?.requestId ? Number(req.body.requestId) : null;
  let touristId: number;
  let guideId: number;
  if (u.role === 'tourist') {
    const g = guideOf(ctx.data, Number(req.body?.guideId));
    if (!g) throw bad('guide_unavailable');
    touristId = u.id;
    guideId = g.userId;
    if (requestId) {
      const r = findRequest(ctx.data, requestId);
      if (r.touristId !== u.id) throw notFound();
    }
  } else {
    // Guides can only open a conversation about a request they've made an offer on, or a booking they have.
    touristId = Number(req.body?.touristId);
    guideId = u.id;
    const allowed =
      (requestId && ctx.data.offers.some((o) => o.requestId === requestId && o.guideId === u.id) && ctx.data.requests.some((r) => r.id === requestId && r.touristId === touristId)) ||
      ctx.data.bookings.some((b) => b.guideId === u.id && b.touristId === touristId);
    if (!allowed) throw forbidden('cannot_message');
  }
  let t = ctx.data.threads.find((x) => x.touristId === touristId && x.guideId === guideId && x.requestId === requestId);
  if (!t) {
    t = { id: nextId(ctx.data, 'threads'), touristId, guideId, requestId, createdAt: ctx.nowIso, lastAt: ctx.nowIso, readAt: {} };
    ctx.data.threads.push(t);
  }
  return threadView(ctx, t, u);
});

route('GET', '/threads/:id', (ctx, p) => {
  const u = need(ctx);
  const t = findThread(ctx, idOf(p.id), u);
  if (u.id === t.touristId || u.id === t.guideId) t.readAt[u.id] = Math.max(0, ...ctx.data.messages.filter((m) => m.threadId === t.id).map((m) => m.id));
  const r = t.requestId ? ctx.data.requests.find((x) => x.id === t.requestId) : null;
  const offer = r ? ctx.data.offers.find((o) => o.requestId === r.id && o.guideId === t.guideId && o.status !== 'withdrawn') : null;
  const booking = ctx.data.bookings.filter((b) => b.touristId === t.touristId && b.guideId === t.guideId && (!r || b.requestId === r.id)).sort((a, b) => b.id - a.id)[0];
  return {
    ...threadView(ctx, t, u),
    messages: ctx.data.messages.filter((m) => m.threadId === t.id),
    guideId: t.guideId,
    touristId: t.touristId,
    request: r ? { id: r.id, title: r.title, startDate: r.startDate, endDate: r.endDate, status: r.status } : null,
    offer: offer ? { id: offer.id, price: offer.price, status: offer.status } : null,
    booking: booking ? { id: booking.id, status: booking.status } : null,
    responseMinutes: guideStats(ctx.data, t.guideId, ctx.now).responseMinutes,
  };
});

route('POST', '/threads/:id/messages', (ctx, p, req) => {
  const u = needActive(ctx, 'tourist', 'guide');
  const t = findThread(ctx, idOf(p.id), u);
  const body = str(req.body?.body, 'body', 1, 2000);
  const m = { id: nextId(ctx.data, 'messages'), threadId: t.id, senderId: u.id, body, createdAt: ctx.nowIso };
  ctx.data.messages.push(m);
  t.lastAt = ctx.nowIso;
  t.readAt[u.id] = m.id;
  return m;
});

// ---------- notifications ----------
route('GET', '/notifications', (ctx) => {
  const u = need(ctx);
  const list = ctx.data.notifications.filter((n) => n.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  return { notifications: list.slice(0, 60), unread: list.filter((n) => !n.read).length };
});
route('POST', '/notifications/read-all', (ctx) => {
  const u = need(ctx);
  for (const n of ctx.data.notifications) if (n.userId === u.id) n.read = true;
  return { ok: true };
});
route('POST', '/notifications/:id/read', (ctx, p) => {
  const u = need(ctx);
  const n = ctx.data.notifications.find((x) => x.id === idOf(p.id) && x.userId === u.id);
  if (!n) throw notFound();
  n.read = true;
  return { ok: true };
});

// ---------- wallet and dashboards ----------
// What can be taken out of the wallet: a guide's released earnings (after the fee), or a tourist's
// refunds from card bookings (kept in the wallet until they choose to withdraw), minus earlier withdrawals.
function walletBalance(ctx: Ctx, u: User) {
  const bookings = ctx.data.bookings.filter((b) => b.paymentMethod !== 'cash' && (u.role === 'tourist' ? b.touristId : b.guideId) === u.id);
  const ids = new Map(bookings.map((b) => [b.id, b]));
  const ms = ctx.data.milestones.filter((m) => ids.has(m.bookingId));
  const inflow =
    u.role === 'guide'
      ? ms.filter((m) => m.status === 'released').reduce((a, m) => a + m.amount * (1 - ids.get(m.bookingId)!.feeRate), 0)
      : ms.filter((m) => m.status === 'refunded').reduce((a, m) => a + m.amount, 0);
  const withdrawn = (ctx.data.withdrawals || []).filter((w) => w.userId === u.id).reduce((a, w) => a + w.amount, 0);
  return { available: money(Math.max(0, inflow - withdrawn)), withdrawn: money(withdrawn) };
}

route('POST', '/wallet/withdraw', (ctx, _p, req) => {
  const u = needActive(ctx, 'tourist', 'guide');
  if (!u.savedCard) throw conflict('card_required');
  const { available } = walletBalance(ctx, u);
  const amount = req.body?.amount === undefined ? available : num(req.body.amount, 'amount', 0.01, 1_000_000);
  if (available <= 0) throw conflict('nothing_to_withdraw');
  if (amount > available + 1e-9) throw bad('withdraw_too_much', { max: available });
  ctx.data.withdrawals ||= [];
  const id = ctx.data.withdrawals.reduce((a, w) => Math.max(a, w.id), 0) + 1;
  const w = { id, userId: u.id, amount: money(amount), brand: u.savedCard.brand, last4: u.savedCard.last4, createdAt: ctx.nowIso };
  ctx.data.withdrawals.push(w);
  return { withdrawal: w, ...walletBalance(ctx, u) };
});

route('GET', '/wallet', (ctx) => {
  const u = need(ctx, 'tourist', 'guide');
  const bookings = ctx.data.bookings.filter((b) => (u.role === 'tourist' ? b.touristId : b.guideId) === u.id);
  const ids = new Set(bookings.map((b) => b.id));
  const ms = ctx.data.milestones.filter((m) => ids.has(m.bookingId));
  const sum = (st: string[], net = false) =>
    money(ms.filter((m) => st.includes(m.status)).reduce((a, m) => a + (net ? m.amount * (1 - bookings.find((b) => b.id === m.bookingId)!.feeRate) : m.amount), 0));
  const month = ctx.today.slice(0, 7);
  const transactions = ms
    .flatMap((m) => {
      const b = bookings.find((x) => x.id === m.bookingId)!;
      const base = { bookingId: b.id, title: b.title, day: m.index + 1 };
      const out: any[] = [];
      if (b.paymentMethod === 'cash') {
        if (m.status === 'cash_paid') out.push({ ...base, kind: 'cash', amount: u.role === 'guide' ? m.amount : -m.amount, at: m.settledAt });
        return out;
      }
      if (u.role === 'tourist') out.push({ ...base, kind: 'paid_in', amount: -m.amount, at: m.fundedAt });
      if (m.status === 'released') out.push({ ...base, kind: 'released', amount: u.role === 'guide' ? money(m.amount * (1 - b.feeRate)) : m.amount, fee: money(m.amount * b.feeRate), at: m.settledAt });
      if (m.status === 'refunded') out.push({ ...base, kind: 'refunded', amount: u.role === 'tourist' ? m.amount : 0, at: m.settledAt });
      return out;
    })
    .filter((x) => u.role === 'tourist' || x.kind !== 'refunded')
    .concat(
      ctx.data.payments
        .filter((p) => (p.purpose === 'subscription' || p.purpose === 'promotion') && p.userId === u.id)
        .map((p) => ({ bookingId: null, title: '', day: 0, kind: p.purpose, amount: -p.amount, at: p.createdAt })),
    )
    .concat((ctx.data.withdrawals || []).filter((w) => w.userId === u.id).map((w) => ({ bookingId: null, title: `${w.brand} •••• ${w.last4}`, day: 0, kind: 'withdrawn', amount: -w.amount, at: w.createdAt })))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return {
    role: u.role,
    held: sum(['held', 'release_requested']),
    released: u.role === 'guide' ? sum(['released'], true) : sum(['released']),
    refunded: sum(['refunded']),
    fees: u.role === 'guide' ? money(sum(['released']) - sum(['released'], true)) : 0,
    cashPaid: sum(['cash_paid']),
    cashDue: sum(['cash_due']),
    thisMonth:
      u.role === 'guide'
        ? money(ms.filter((m) => m.status === 'released' && (m.settledAt || '').slice(0, 7) === month).reduce((a, m) => a + m.amount * (1 - bookings.find((b) => b.id === m.bookingId)!.feeRate), 0))
        : null,
    transactions: transactions.slice(0, 80),
    ...walletBalance(ctx, u),
    card: u.savedCard ? { brand: u.savedCard.brand, last4: u.savedCard.last4 } : null,
  };
});

route('GET', '/dashboard', (ctx) => {
  const u = need(ctx);
  if (u.role === 'tourist') {
    const requests = ctx.data.requests.filter((r) => r.touristId === u.id && (r.status === 'open' || r.status === 'awarded')).map((r) => requestSummary(ctx, r));
    const bookings = ctx.data.bookings
      .filter((b) => b.touristId === u.id && ['awaiting_guide', 'confirmed', 'disputed'].includes(b.status))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((b) => bookingView(ctx, b));
    const toReview = ctx.data.bookings.filter((b) => b.touristId === u.id && b.status === 'completed' && !ctx.data.reviews.some((r) => r.bookingId === b.id && r.authorId === u.id)).map((b) => ({ id: b.id, title: b.title, guide: publicUser(userById(ctx.data, b.guideId)!) }));
    const releaseAsks = ctx.data.milestones
      .filter((m) => m.status === 'release_requested' && ctx.data.bookings.some((b) => b.id === m.bookingId && b.touristId === u.id))
      .map((m) => ({ milestoneId: m.id, bookingId: m.bookingId, amount: m.amount, day: m.index + 1, title: ctx.data.bookings.find((b) => b.id === m.bookingId)!.title }));
    return { role: 'tourist', requests, bookings, toReview, releaseAsks };
  }
  if (u.role === 'guide') {
    const g = guideOf(ctx.data, u.id)!;
    const awaiting = ctx.data.bookings.filter((b) => b.guideId === u.id && b.status === 'awaiting_guide').map((b) => bookingView(ctx, b));
    const upcoming = ctx.data.bookings
      .filter((b) => b.guideId === u.id && ['confirmed', 'disputed'].includes(b.status))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((b) => bookingView(ctx, b));
    const langs = g.languages.map((l) => l.code);
    const matching = ctx.data.requests
      .filter((r) => r.status === 'open' && (r.directGuideId === null || r.directGuideId === u.id))
      .filter((r) => r.directGuideId === u.id || r.invited.includes(u.id) || (r.cities.some((c) => g.cities.includes(c)) && r.languages.some((l) => langs.includes(l))))
      .filter((r) => !ctx.data.offers.some((o) => o.requestId === r.id && o.guideId === u.id && o.status !== 'withdrawn'))
      .sort((a, b) => Number(b.directGuideId === u.id || b.invited.includes(u.id)) - Number(a.directGuideId === u.id || a.invited.includes(u.id)) || Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...requestSummary(ctx, r), invitedMe: r.invited.includes(u.id) }));
    const offers = ctx.data.offers.filter((o) => o.guideId === u.id);
    const toReview = ctx.data.bookings.filter((b) => b.guideId === u.id && b.status === 'completed' && !ctx.data.reviews.some((r) => r.bookingId === b.id && r.authorId === u.id)).map((b) => ({ id: b.id, title: b.title, tourist: publicUser(userById(ctx.data, b.touristId)!) }));
    return {
      role: 'guide',
      verification: g.verification,
      profileComplete: !!(g.headline && g.bio && g.cities.length),
      awaiting,
      upcoming,
      matching: matching.slice(0, 6),
      matchingCount: matching.length,
      offers: { pending: offers.filter((o) => o.status === 'pending').length, won: offers.filter((o) => ['accepted', 'awarded'].includes(o.status)).length },
      toReview,
      stats: guideStats(ctx.data, u.id, ctx.now),
    };
  }
  const open = ctx.data.reports.filter((r) => r.status === 'open').length;
  return {
    role: 'admin',
    pendingVerifications: ctx.data.guides.filter((g) => g.verification === 'pending').length,
    openReports: open,
    users: ctx.data.users.length,
    openRequests: ctx.data.requests.filter((r) => r.status === 'open').length,
    activeBookings: ctx.data.bookings.filter((b) => ['awaiting_guide', 'confirmed', 'disputed'].includes(b.status)).length,
    heldTotal: money(ctx.data.milestones.filter((m) => m.status === 'held' || m.status === 'release_requested').reduce((a, m) => a + m.amount, 0)),
    activeSubscriptions: ctx.data.guides.filter((g) => subActive(ctx, g)).length,
    subscriptionPrice: ctx.data.platform.guideSubscriptionPrice,
    subscriptionDays: ctx.data.platform.subscriptionDays,
    activePromotions: ctx.data.guides.filter((g) => promoActive(ctx, g)).length,
    promotionPrice: ctx.data.platform.promotionPrice,
    promotionDays: ctx.data.platform.promotionDays,
    iqdPerUsd: ctx.data.platform.iqdPerUsd,
  };
});

// City statistics for the admin: visitors (people on booked trips), trips, requests, guides and money.
route('GET', '/admin/stats', (ctx) => {
  need(ctx, 'admin');
  const live = ctx.data.bookings.filter((b) => ['confirmed', 'completed', 'disputed', 'awaiting_guide'].includes(b.status));
  const done = live.filter((b) => b.status === 'completed');
  const reqOf = (b: Booking) => ctx.data.requests.find((r) => r.id === b.requestId);
  const cities = ctx.data.cities.map((c) => {
    const trips = live.filter((b) => reqOf(b)?.cities.includes(c.slug));
    const guides = ctx.data.guides.filter((g) => g.cities.includes(c.slug) && userById(ctx.data, g.userId)!.status === 'active' && g.headline);
    const revenue = trips.reduce((a, b) => a + b.total / Math.max(1, reqOf(b)!.cities.length), 0);
    return {
      slug: c.slug,
      visitors: trips.reduce((a, b) => a + b.groupSize, 0),
      trips: trips.length,
      completed: trips.filter((b) => b.status === 'completed').length,
      requests: ctx.data.requests.filter((r) => r.cities.includes(c.slug)).length,
      openRequests: ctx.data.requests.filter((r) => r.status === 'open' && r.cities.includes(c.slug)).length,
      guides: guides.length,
      avgPrice: guides.length ? Math.round(guides.reduce((a, g) => a + g.pricePerDay, 0) / guides.length) : null,
      revenue: money(revenue),
    };
  }).sort((a, b) => b.visitors - a.visitors || b.requests - a.requests);
  const langs: Record<string, number> = {};
  for (const r of ctx.data.requests) for (const l of r.languages) langs[l] = (langs[l] || 0) + 1;
  return {
    cities,
    totals: {
      visitors: live.reduce((a, b) => a + b.groupSize, 0),
      trips: live.length,
      completed: done.length,
      avgGroup: live.length ? Math.round((live.reduce((a, b) => a + b.groupSize, 0) / live.length) * 10) / 10 : 0,
      avgTripDays: live.length ? Math.round((live.reduce((a, b) => a + daysInclusive(b.startDate, b.endDate), 0) / live.length) * 10) / 10 : 0,
      revenue: money(live.reduce((a, b) => a + b.total, 0)),
    },
    languages: Object.entries(langs).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
  };
});

route('GET', '/admin/settings', (ctx) => {
  need(ctx, 'admin');
  return { ...ctx.data.platform, activeSubscriptions: ctx.data.guides.filter((g) => subActive(ctx, g)).length };
});

route('PUT', '/admin/settings', (ctx, _p, req) => {
  need(ctx, 'admin');
  const b = req.body || {};
  if (b.guideSubscriptionPrice !== undefined) ctx.data.platform.guideSubscriptionPrice = num(b.guideSubscriptionPrice, 'guideSubscriptionPrice', 0, 500);
  if (b.subscriptionDays !== undefined) ctx.data.platform.subscriptionDays = num(b.subscriptionDays, 'subscriptionDays', 1, 366, true);
  if (b.promotionPrice !== undefined) ctx.data.platform.promotionPrice = num(b.promotionPrice, 'promotionPrice', 0, 1000);
  if (b.promotionDays !== undefined) ctx.data.platform.promotionDays = num(b.promotionDays, 'promotionDays', 1, 366, true);
  if (b.iqdPerUsd !== undefined) ctx.data.platform.iqdPerUsd = num(b.iqdPerUsd, 'iqdPerUsd', 100, 100000, true);
  return { ...ctx.data.platform, activeSubscriptions: ctx.data.guides.filter((g) => subActive(ctx, g)).length };
});

// ---------- admin ----------
route('GET', '/admin/verifications', (ctx) => {
  need(ctx, 'admin');
  const list = ctx.data.guides.filter((g) => g.verification === 'pending').sort((a, b) => String(a.verificationRequestedAt).localeCompare(String(b.verificationRequestedAt)));
  return {
    guides: list.map((g) => {
      const u = userById(ctx.data, g.userId)!;
      return { ...guideCard(ctx.data, g, ctx.now), email: u.email, phone: u.phone, docs: g.verificationDocs, requestedAt: g.verificationRequestedAt, bio: g.bio };
    }),
  };
});

route('POST', '/admin/guides/:id/verify', (ctx, p, req) => {
  need(ctx, 'admin');
  const g = guideOf(ctx.data, idOf(p.id));
  if (!g) throw notFound();
  if (g.verification !== 'pending') throw conflict('verification_state');
  if (req.body?.approve) {
    g.verification = 'verified';
    g.verificationNote = '';
    notify(ctx, g.userId, 'verification_approved', {}, '/profile');
  } else {
    g.verification = 'rejected';
    g.verificationNote = str(req.body?.note, 'note', 5, 300);
    notify(ctx, g.userId, 'verification_rejected', { note: g.verificationNote }, '/profile');
  }
  return { verification: g.verification };
});

route('GET', '/admin/reports', (ctx, _p, req) => {
  need(ctx, 'admin');
  const status = req.query.status === 'resolved' ? 'resolved' : 'open';
  const list = ctx.data.reports.filter((r) => r.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    reports: list.map((r) => {
      const b = ctx.data.bookings.find((x) => x.id === r.bookingId)!;
      const thread = ctx.data.threads.find((t) => t.touristId === b.touristId && t.guideId === b.guideId);
      return {
        ...r,
        reporter: publicUser(userById(ctx.data, r.reporterId)!),
        against: publicUser(userById(ctx.data, r.againstId)!),
        booking: { id: b.id, title: b.title, startDate: b.startDate, endDate: b.endDate, money: bookingMoney(ctx.data, b) },
        messages: thread ? ctx.data.messages.filter((m) => m.threadId === thread.id).slice(-12) : [],
        threadParticipants: thread ? { tourist: b.touristId, guide: b.guideId } : null,
      };
    }),
  };
});

route('POST', '/admin/reports/:id/resolve', (ctx, p, req) => {
  need(ctx, 'admin');
  const r = ctx.data.reports.find((x) => x.id === idOf(p.id));
  if (!r) throw notFound();
  if (r.status !== 'open') throw conflict('report_resolved');
  const action = req.body?.action;
  if (!['refund', 'release', 'dismiss'].includes(action)) throw bad('field_required', { field: 'action' });
  const b = findBooking(ctx.data, r.bookingId);
  b.status = b.statusBeforeDispute || 'confirmed';
  b.statusBeforeDispute = null;
  if (action === 'refund' || action === 'release') {
    for (const m of ctx.data.milestones.filter((m) => m.bookingId === b.id && ['held', 'release_requested', 'cash_due'].includes(m.status))) {
      if (m.status === 'cash_due') m.status = action === 'refund' ? 'void' : 'cash_paid';
      else m.status = action === 'refund' ? 'refunded' : 'released';
      m.settledAt = ctx.nowIso;
    }
    if (b.status === 'awaiting_guide') {
      // Settled before the guide ever confirmed.
      b.status = action === 'refund' ? 'cancelled' : 'completed';
      if (action === 'refund') {
        b.cancelledAt = ctx.nowIso;
        b.cancelledBy = 'guide';
        reopenRequest(ctx, b.requestId);
      } else b.completedAt = ctx.nowIso;
    } else checkComplete(ctx, b);
  }
  r.status = 'resolved';
  r.resolution = action;
  r.adminNote = optStr(req.body?.note, 'note', 500);
  r.resolvedAt = ctx.nowIso;
  if (req.body?.suspend) {
    const target = userById(ctx.data, r.againstId);
    if (target && target.role !== 'admin') target.status = 'suspended';
  }
  for (const uid of [b.touristId, b.guideId]) notify(ctx, uid, 'report_resolved', { title: b.title, action }, `/bookings/${b.id}`);
  return { ok: true };
});

// ---------- governorates: the admin adds governorates, their heritage places and photos ----------
const CITY_LIMITS = { places: 30, covers: 12 };
function adminCityView(ctx: Ctx, c: any) {
  return {
    ...c,
    covers: cityCovers(c),
    places: ctx.data.places.filter((p) => p.city === c.slug),
    guides: ctx.data.guides.filter((g) => g.cities.includes(c.slug)).length,
    requests: ctx.data.requests.filter((r) => r.cities.includes(c.slug)).length,
  };
}
function slugFor(ctx: Ctx, name: string) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'city';
  let slug = base;
  for (let n = 2; ctx.data.cities.some((c) => c.slug === slug); n++) slug = `${base}-${n}`;
  return slug;
}
// Saves a governorate from the admin's form: names, places (kept by id when edited) and photos.
function saveCity(ctx: Ctx, b: any, existing?: any) {
  const name = str(b.name, 'name', 2, 40);
  const nameAr = str(b.nameAr, 'nameAr', 2, 40);
  const clash = ctx.data.cities.find((c) => c !== existing && (c.name.toLowerCase() === name.toLowerCase() || c.nameAr === nameAr));
  if (clash) throw conflict('city_exists');
  if (!Array.isArray(b.places) || b.places.length < 1) throw bad('field_required', { field: 'places' });
  if (b.places.length > CITY_LIMITS.places) throw bad('field_too_long', { field: 'places', max: CITY_LIMITS.places });
  const places = b.places.map((p: any, i: number) => ({
    id: Number(p?.id) || 0,
    name: str(p?.name, `places.${i}.name`, 2, 80),
    nameAr: str(p?.nameAr, `places.${i}.nameAr`, 2, 80),
    kind: (PLACE_KINDS as string[]).includes(p?.kind) ? p.kind : (() => { throw bad('field_invalid', { field: `places.${i}.kind` }); })(),
  }));
  if (!Array.isArray(b.covers) || b.covers.length < 1) throw bad('field_required', { field: 'covers' });
  if (b.covers.length > CITY_LIMITS.covers) throw bad('field_too_long', { field: 'covers', max: CITY_LIMITS.covers });
  const known = new Set([...BUILTIN_COVERS(), ...(existing ? cityCovers(existing) : []), ...(ctx.data.media || []).map((m) => 'm:' + m.id)]);
  ctx.data.media ||= [];
  const covers = b.covers.map((v: any) => {
    const img = String(v || '');
    if (known.has(img)) return img;
    if (/^data:image\/(jpeg|png|webp);base64,/.test(img) && img.length < 400_000) {
      const id = (ctx.data.media!.reduce((a, m) => Math.max(a, m.id), 0) || 0) + 1;
      ctx.data.media!.push({ id, img });
      return 'm:' + id;
    }
    throw bad('photo_invalid');
  });
  const city = existing || { slug: slugFor(ctx, name), name, nameAr, covers: [] };
  Object.assign(city, { name, nameAr, covers: [...new Set(covers)] });
  if (!existing) ctx.data.cities.push(city);
  // Places: edit the ones with an id, add the new ones, drop the rest from this governorate.
  const keep = new Set(places.filter((p: any) => p.id).map((p: any) => p.id));
  ctx.data.places = ctx.data.places.filter((p) => p.city !== city.slug || keep.has(p.id));
  let next = ctx.data.places.reduce((a, p) => Math.max(a, p.id), 0);
  for (const p of places) {
    const old = p.id && ctx.data.places.find((x) => x.id === p.id && x.city === city.slug);
    if (old) Object.assign(old, { name: p.name, nameAr: p.nameAr, kind: p.kind });
    else ctx.data.places.push({ id: ++next, city: city.slug, name: p.name, nameAr: p.nameAr, kind: p.kind });
  }
  return adminCityView(ctx, city);
}
route('GET', '/admin/cities', (ctx) => {
  need(ctx, 'admin');
  return ctx.data.cities.map((c) => adminCityView(ctx, c));
});
route('GET', '/admin/cities/:slug', (ctx, p) => {
  need(ctx, 'admin');
  const c = ctx.data.cities.find((x) => x.slug === p.slug);
  if (!c) throw notFound();
  return adminCityView(ctx, c);
});
route('POST', '/admin/cities', (ctx, _p, req) => {
  need(ctx, 'admin');
  return saveCity(ctx, req.body || {});
});
route('PUT', '/admin/cities/:slug', (ctx, p, req) => {
  need(ctx, 'admin');
  const c = ctx.data.cities.find((x) => x.slug === p.slug);
  if (!c) throw notFound();
  return saveCity(ctx, req.body || {}, c);
});

route('GET', '/admin/users', (ctx, _p, req) => {
  need(ctx, 'admin');
  const q = (req.query.q || '').toLowerCase();
  const list = ctx.data.users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.includes(q)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { users: list.slice(0, 100).map((u) => ({ ...publicUser(u), name: u.name, email: u.email, status: u.status, verification: guideOf(ctx.data, u.id)?.verification || null })) };
});

route('POST', '/admin/users/:id/status', (ctx, p, req) => {
  need(ctx, 'admin');
  const u = userById(ctx.data, idOf(p.id));
  if (!u || u.role === 'admin') throw notFound();
  u.status = req.body?.status === 'suspended' ? 'suspended' : 'active';
  if (u.status === 'suspended') ctx.data.sessions = ctx.data.sessions.filter((s) => s.userId !== u.id);
  return { status: u.status };
});

// =====================================================================
export function createApi(data: Data, platform: Platform, onChange: (data: Data) => void = () => {}) {
  normalize(data);
  return function handle(req: ApiRequest): ApiResponse {
    const now = platform.now();
    const session = req.token ? data.sessions.find((s) => s.token === req.token) : undefined;
    const user = session ? data.users.find((u) => u.id === session.userId) || null : null;
    const ctx: Ctx = { data, p: platform, user, now, nowIso: now.toISOString(), today: iraqDate(now) };
    const before = data.seq.notifications;
    try {
      sweep(ctx);
      const r = routes.find((x) => x.method === req.method && x.re.test(req.path));
      if (!r) {
        const pathExists = routes.some((x) => x.re.test(req.path));
        throw new ApiError(pathExists ? 405 : 404, pathExists ? 'method_not_allowed' : 'not_found');
      }
      const m = req.path.match(r.re)!;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const body = r.handler(ctx, params, req);
      // Reads also change data when the sweep expires a hire or a thread is marked read.
      if (req.method !== 'GET' || data.seq.notifications !== before || req.path.startsWith('/threads/')) onChange(data);
      return { status: 200, body };
    } catch (e) {
      if (e instanceof ApiError) return { status: e.status, body: { error: e.code, params: e.params } };
      console.error(e);
      return { status: 500, body: { error: 'server_error' } };
    }
  };
}

export type ApiHandler = ReturnType<typeof createApi>;
export type { GuideProfile };
