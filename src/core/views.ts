// Read-side helpers: statistics and the public shapes the API returns.
import { CITIES, GUIDE_RATING_KEYS, PLACES, TOURIST_RATING_KEYS } from './catalog';
import type { Booking, Data, GuideProfile, Review, User } from './types';
import { addDays, avg, iraqDate, median, money, round1 } from './util';
import { settings } from '../config/brand';

export function reviewVisible(data: Data, r: Review, now: Date): boolean {
  const both = data.reviews.some((x) => x.bookingId === r.bookingId && x.authorId !== r.authorId);
  if (both) return true;
  const b = data.bookings.find((x) => x.id === r.bookingId);
  if (!b || !b.completedAt) return false;
  return iraqDate(now) >= addDays(b.completedAt.slice(0, 10), settings.reviewRevealDays);
}

export function displayName(u: User): string {
  if (u.role !== 'tourist') return u.name;
  // Tourists show as first name and last initial.
  const parts = u.name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export function publicUser(u: User) {
  return {
    id: u.id,
    role: u.role,
    name: displayName(u),
    country: u.country,
    avatarColor: u.avatarColor,
    memberSince: u.createdAt.slice(0, 10),
    phoneVerified: u.phoneVerified,
    paymentVerified: u.paymentVerified,
    suspended: u.status === 'suspended',
  };
}

export function guideStats(data: Data, guideId: number, now: Date) {
  const bookings = data.bookings.filter((b) => b.guideId === guideId);
  const completed = bookings.filter((b) => b.status === 'completed');
  const guideCancelled = bookings.filter((b) => b.status === 'cancelled' && b.cancelledBy === 'guide');
  const completionRate = completed.length + guideCancelled.length ? completed.length / (completed.length + guideCancelled.length) : null;

  const hired = bookings.filter((b) => ['completed', 'confirmed'].includes(b.status));
  const perTourist = new Map<number, number>();
  for (const b of hired) perTourist.set(b.touristId, (perTourist.get(b.touristId) || 0) + 1);
  const repeatHireRate = perTourist.size ? [...perTourist.values()].filter((n) => n > 1).length / perTourist.size : null;

  const reviews = data.reviews.filter((r) => r.subjectId === guideId && r.authorRole === 'tourist' && reviewVisible(data, r, now));
  const rating = round1(avg(reviews.map((r) => r.overall)));
  const subRatings: Record<string, number | null> = {};
  for (const k of GUIDE_RATING_KEYS) subRatings[k] = round1(avg(reviews.map((r) => r.ratings[k]).filter((x) => typeof x === 'number')));
  const hireAgain = reviews.length ? reviews.filter((r) => r.hireAgain).length / reviews.length : null;

  // Response rate and time: threads the tourist started, and how quickly the guide first answered.
  let started = 0;
  const mins: number[] = [];
  for (const t of data.threads.filter((t) => t.guideId === guideId)) {
    const msgs = data.messages.filter((m) => m.threadId === t.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!msgs.length || msgs[0].senderId !== t.touristId) continue;
    started++;
    const reply = msgs.find((m) => m.senderId === guideId);
    if (reply) mins.push((Date.parse(reply.createdAt) - Date.parse(msgs[0].createdAt)) / 60000);
  }
  const responseRate = started ? mins.length / started : null;
  const responseMinutes = median(mins);

  const g = data.guides.find((x) => x.userId === guideId);
  const verified = g?.verification === 'verified';
  const topGuide = !!(verified && completed.length >= 8 && rating !== null && rating >= 4.7);

  return {
    toursCompleted: completed.length,
    completionRate,
    repeatHireRate,
    rating,
    reviewsCount: reviews.length,
    subRatings,
    hireAgain,
    responseRate,
    responseMinutes: responseMinutes === null ? null : Math.max(1, Math.round(responseMinutes)),
    verified,
    topGuide,
  };
}

export function touristStats(data: Data, touristId: number, now: Date) {
  const bookings = data.bookings.filter((b) => b.touristId === touristId);
  const reviews = data.reviews.filter((r) => r.subjectId === touristId && r.authorRole === 'guide' && reviewVisible(data, r, now));
  return {
    tripsCompleted: bookings.filter((b) => b.status === 'completed').length,
    rating: round1(avg(reviews.map((r) => r.overall))),
    reviewsCount: reviews.length,
    requestsPosted: data.requests.filter((r) => r.touristId === touristId).length,
  };
}

export function bookedDates(data: Data, guideId: number): { start: string; end: string }[] {
  return data.bookings
    .filter((b) => b.guideId === guideId && ['awaiting_guide', 'confirmed', 'disputed'].includes(b.status))
    .map((b) => ({ start: b.startDate, end: b.endDate }));
}

export function isAvailable(data: Data, g: GuideProfile, start: string, end: string, ignoreBookingId?: number): boolean {
  if (g.blockedDates.some((d) => d >= start && d <= end)) return false;
  return !data.bookings.some(
    (b) => b.guideId === g.userId && b.id !== ignoreBookingId && ['awaiting_guide', 'confirmed', 'disputed'].includes(b.status) && b.startDate <= end && start <= b.endDate,
  );
}

export function guideCard(data: Data, g: GuideProfile, now: Date) {
  const u = data.users.find((x) => x.id === g.userId)!;
  const s = guideStats(data, g.userId, now);
  return {
    ...publicUser(u),
    headline: g.headline,
    headlineAr: g.headlineAr,
    pricePerDay: g.pricePerDay,
    cities: g.cities,
    languages: g.languages,
    specialities: g.specialities,
    verification: g.verification,
    cover: g.photos[0]?.img || null,
    stats: {
      rating: s.rating,
      reviewsCount: s.reviewsCount,
      toursCompleted: s.toursCompleted,
      responseMinutes: s.responseMinutes,
      verified: s.verified,
      topGuide: s.topGuide,
    },
  };
}

export function reviewView(data: Data, r: Review) {
  const author = data.users.find((u) => u.id === r.authorId)!;
  const b = data.bookings.find((x) => x.id === r.bookingId);
  return {
    id: r.id,
    overall: r.overall,
    ratings: r.ratings,
    hireAgain: r.hireAgain,
    comment: r.comment,
    createdAt: r.createdAt,
    author: publicUser(author),
    trip: b ? { title: b.title, startDate: b.startDate, endDate: b.endDate, cities: data.requests.find((q) => q.id === b.requestId)?.cities || [] } : null,
  };
}

export function placeNames(ids: number[]) {
  return ids.map((id) => PLACES.find((p) => p.id === id)).filter(Boolean);
}

export const cityExists = (slug: string) => CITIES.some((c) => c.slug === slug);

export function bookingMoney(data: Data, b: Booking) {
  const ms = data.milestones.filter((m) => m.bookingId === b.id);
  const sum = (st: string[]) => money(ms.filter((m) => st.includes(m.status)).reduce((a, m) => a + m.amount, 0));
  return {
    total: b.total,
    held: sum(['held', 'release_requested']),
    released: sum(['released']),
    refunded: sum(['refunded']),
    fee: money(sum(['released']) * b.feeRate),
  };
}

export { GUIDE_RATING_KEYS, TOURIST_RATING_KEYS };
