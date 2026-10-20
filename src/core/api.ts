// The whole marketplace: every rule lives here, and the same code runs on the server and in the browser demo.
import { settings } from '../config/brand';
import { AVATAR_COLORS, CITIES, GUIDE_RATING_KEYS, INCLUDES, INTERESTS, LANGUAGES, LANGUAGE_LEVELS, PHOTO_LIBRARY, PLACES, TOURIST_RATING_KEYS } from './catalog';
import type { ApiRequest, ApiResponse, Booking, Data, GuideProfile, Milestone, Offer, Platform, Role, TripRequest, User } from './types';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './seed';
import { ApiError, addDays, bad, conflict, dateRange, daysInclusive, forbidden, iraqDate, isDate, money, nextId, notFound, num, optStr, str, strList } from './util';
import { bookedDates, bookingMoney, guideCard, guideStats, isAvailable, publicUser, reviewView, reviewVisible, touristStats } from './views';

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

function refundHeld(ctx: Ctx, b: Booking) {
  for (const m of ctx.data.milestones.filter((m) => m.bookingId === b.id && (m.status === 'held' || m.status === 'release_requested'))) {
    m.status = 'refunded';
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
  if (ms.some((m) => m.status === 'held' || m.status === 'release_requested')) return;
  if (ms.some((m) => m.status === 'released')) {
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
    offersCount: offers.length,
    avgOffer: offers.length ? Math.round(offers.reduce((a, o) => a + o.price, 0) / offers.length) : null,
    directGuide: r.directGuideId ? publicUser(userById(ctx.data, r.directGuideId)!) : null,
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
  cities: CITIES,
  places: PLACES,
  languages: LANGUAGES,
  levels: LANGUAGE_LEVELS,
  interests: INTERESTS,
  includes: INCLUDES,
  guideRatingKeys: GUIDE_RATING_KEYS,
  touristRatingKeys: TOURIST_RATING_KEYS,
  photoLibrary: PHOTO_LIBRARY,
  feeRate: settings.feeRate,
  iqdPerUsd: settings.iqdPerUsd,
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
    gender: u.gender,
    status: u.status,
    unreadNotifications,
    unreadMessages,
    guide: g ? { ...g, profileComplete: !!(g.headline && g.bio && g.cities.length) } : null,
  };
}

route('GET', '/me', (ctx) => meView(ctx, need(ctx)));

route('PUT', '/me', (ctx, _p, req) => {
  const u = need(ctx);
  const b = req.body || {};
  if (b.name !== undefined) u.name = str(b.name, 'name', 2, 60);
  if (b.country !== undefined) u.country = str(b.country, 'country', 2, 60);
  if (b.phone !== undefined) {
    const phone = optStr(b.phone, 'phone', 20);
    if (phone && !/^\+?[0-9 ]{7,20}$/.test(phone)) throw bad('phone_invalid');
    if (phone !== u.phone) u.phoneVerified = false;
    u.phone = phone;
  }
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
  if (q.verified === '1') list = list.filter((g) => g.verification === 'verified');
  if (q.female === '1') list = list.filter((g) => userById(ctx.data, g.userId)!.gender === 'f');
  if (isDate(q.from) && isDate(q.to) && q.from <= q.to) list = list.filter((g) => isAvailable(ctx.data, g, q.from, q.to));
  if (q.q) {
    const term = q.q.trim().toLowerCase();
    list = list.filter((g) => {
      const u = userById(ctx.data, g.userId)!;
      const placeHit = g.places.some((id) => {
        const p = PLACES.find((x) => x.id === id);
        return p && (p.name.toLowerCase().includes(term) || p.nameAr.includes(term));
      });
      const cityHit = g.cities.some((c) => {
        const city = CITIES.find((x) => x.slug === c)!;
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
  };
});

route('PUT', '/guide/profile', (ctx, _p, req) => {
  const u = needActive(ctx, 'guide');
  const g = guideOf(ctx.data, u.id)!;
  const b = req.body || {};
  if (b.headline !== undefined) g.headline = str(b.headline, 'headline', 5, 90);
  if (b.headlineAr !== undefined) g.headlineAr = optStr(b.headlineAr, 'headlineAr', 90);
  if (b.bio !== undefined) g.bio = str(b.bio, 'bio', 30, 1500);
  if (b.bioAr !== undefined) g.bioAr = optStr(b.bioAr, 'bioAr', 1500);
  if (b.pricePerDay !== undefined) g.pricePerDay = num(b.pricePerDay, 'pricePerDay', 10, 1000, true);
  if (b.cities !== undefined) g.cities = strList(b.cities, 'cities', CITIES.map((c) => c.slug), 1, 8);
  if (b.languages !== undefined) g.languages = validLanguages(b.languages);
  if (b.specialities !== undefined) g.specialities = strList(b.specialities, 'specialities', INTERESTS, 0, 10);
  if (b.places !== undefined) {
    const ids = Array.isArray(b.places) ? [...new Set(b.places.map(Number))] : [];
    for (const id of ids) if (!PLACES.some((x) => x.id === id)) throw bad('field_invalid', { field: 'places' });
    g.places = ids as number[];
  }
  if (b.blockedDates !== undefined) {
    if (!Array.isArray(b.blockedDates) || b.blockedDates.length > 366 || !b.blockedDates.every(isDate)) throw bad('field_invalid', { field: 'blockedDates' });
    g.blockedDates = [...new Set(b.blockedDates as string[])].sort();
  }
  if (b.photos !== undefined) {
    if (!Array.isArray(b.photos) || b.photos.length > 8) throw bad('field_too_long', { field: 'photos', max: 8 });
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
  return { ...publicUser(u), stats: touristStats(ctx.data, u.id, ctx.now), reviews };
});

// ---------- trip requests ----------
function parseRequestBody(ctx: Ctx, b: any) {
  const startDate = b.startDate;
  const endDate = b.endDate;
  if (!isDate(startDate) || !isDate(endDate)) throw bad('dates_required');
  if (startDate < ctx.today) throw bad('date_past');
  if (endDate < startDate) throw bad('dates_order');
  if (daysInclusive(startDate, endDate) > 30) throw bad('trip_too_long');
  const cities = strList(b.cities, 'cities', CITIES.map((c) => c.slug), 1, 8);
  const places = (Array.isArray(b.places) ? b.places.map(Number) : []).filter((id: number) => PLACES.some((p) => p.id === id));
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
    groupSize: num(b.groupSize, 'groupSize', 1, 50, true),
    languages: strList(b.languages, 'languages', LANGUAGES, 1, 5),
    interests: strList(b.interests, 'interests', INTERESTS, 0, 10),
    budgetMin,
    budgetMax,
    urgent: !!b.urgent,
    femaleGuide: !!b.femaleGuide,
  };
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
  const base = { ...requestSummary(ctx, r), booking: booking && (isOwner || u.role === 'admin' || booking.guideId === u.id) ? { id: booking.id, status: booking.status, guideId: booking.guideId } : null };
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
  const guideUser = userById(ctx.data, o.guideId)!;
  if (guideUser.status !== 'active') throw conflict('guide_unavailable');
  const g = guideOf(ctx.data, o.guideId)!;
  if (!isAvailable(ctx.data, g, r.startDate, r.endDate)) throw conflict('guide_busy');
  u.paymentVerified = true;

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
    feeRate: settings.feeRate,
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
    const m: Milestone = { id: nextId(ctx.data, 'milestones'), bookingId: b.id, index: i, date, title: o.plan[i]?.title || `Day ${i + 1}`, amount, status: 'held', fundedAt: ctx.nowIso, settledAt: null };
    ctx.data.milestones.push(m);
  });
  o.status = 'awarded';
  r.status = 'awarded';
  notify(ctx, o.guideId, 'hired', { name: publicUser(u).name, title: r.title, price: o.price }, `/bookings/${b.id}`);
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
      if (u.role === 'tourist') out.push({ ...base, kind: 'paid_in', amount: -m.amount, at: m.fundedAt });
      if (m.status === 'released') out.push({ ...base, kind: 'released', amount: u.role === 'guide' ? money(m.amount * (1 - b.feeRate)) : m.amount, fee: money(m.amount * b.feeRate), at: m.settledAt });
      if (m.status === 'refunded') out.push({ ...base, kind: 'refunded', amount: u.role === 'tourist' ? m.amount : 0, at: m.settledAt });
      return out;
    })
    .filter((x) => u.role === 'tourist' || x.kind !== 'refunded')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return {
    role: u.role,
    held: sum(['held', 'release_requested']),
    released: u.role === 'guide' ? sum(['released'], true) : sum(['released']),
    refunded: sum(['refunded']),
    fees: u.role === 'guide' ? money(sum(['released']) - sum(['released'], true)) : 0,
    thisMonth:
      u.role === 'guide'
        ? money(ms.filter((m) => m.status === 'released' && (m.settledAt || '').slice(0, 7) === month).reduce((a, m) => a + m.amount * (1 - bookings.find((b) => b.id === m.bookingId)!.feeRate), 0))
        : null,
    transactions: transactions.slice(0, 80),
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
  };
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
    for (const m of ctx.data.milestones.filter((m) => m.bookingId === b.id && (m.status === 'held' || m.status === 'release_requested'))) {
      m.status = action === 'refund' ? 'refunded' : 'released';
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
