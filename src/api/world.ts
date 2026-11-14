// The marketplace rules are written once, in src/core/api.ts. For each API call this file:
//   1. loads the rows from PostgreSQL into the engine's `Data` shape (inside the call's transaction),
//   2. lets the engine's own handler run on them (same checks, same money maths, same answers),
//   3. saves exactly what the handler changed: new rows, changed rows, removed rows, new ids.
// Calls that change data take the write lock first (the id counters, FOR UPDATE), so two of them never work from
// the same picture: a guide cannot be hired twice for the same days, and money cannot move twice.
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Data, GuideProfile, User } from '../core/types';
import { schema, type Tx } from '../db/client';
import { loadGuides, saveUpload, slice, type Ctx } from './kernel';

type Rec = Record<string, any>;
const isDataUrl = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:image/');

// The plain tables: same field names as the engine's records. `times` are timestamps (ISO text in the engine).
const TABLES = [
  { name: 'requests', table: schema.tripRequests, times: ['createdAt'], drop: [] as string[], counter: 'requests' },
  { name: 'offers', table: schema.offers, times: ['createdAt', 'updatedAt'], drop: [], counter: 'offers' },
  { name: 'bookings', table: schema.bookings, times: ['createdAt', 'confirmBy', 'confirmedAt', 'completedAt', 'cancelledAt'], drop: [], counter: 'bookings' },
  { name: 'milestones', table: schema.milestones, times: ['fundedAt', 'settledAt'], drop: [], counter: 'milestones' },
  { name: 'payments', table: schema.payments, times: ['createdAt'], drop: ['provider', 'providerRef'], counter: 'payments' },
  { name: 'withdrawals', table: schema.withdrawals, times: ['createdAt'], drop: ['providerRef'], counter: 'withdrawals' },
  { name: 'threads', table: schema.threads, times: ['createdAt', 'lastAt'], drop: [], counter: 'threads' },
  { name: 'messages', table: schema.messages, times: ['createdAt'], drop: [], counter: 'messages' },
  { name: 'notifications', table: schema.notifications, times: ['createdAt'], drop: [], counter: 'notifications' },
  { name: 'reviews', table: schema.reviews, times: ['createdAt'], drop: [], counter: 'reviews' },
  { name: 'reports', table: schema.reports, times: ['createdAt', 'resolvedAt'], drop: [], counter: 'reports' },
  { name: 'events', table: schema.specialEvents, times: ['createdAt'], drop: [], counter: 'events' },
  { name: 'places', table: schema.places, times: [], drop: [], counter: 'places' },
] as const;

function fromRow(row: Rec, times: readonly string[], drop: readonly string[]): Rec {
  const out: Rec = { ...row };
  for (const k of times) out[k] = row[k] ? (row[k] as Date).toISOString() : null;
  for (const k of drop) delete out[k];
  if ('cover' in out && out.cover === null) delete out.cover; // requests: no cover chosen
  return out;
}
function toRow(rec: Rec, times: readonly string[]): Rec {
  const out: Rec = { ...rec };
  for (const k of times) out[k] = rec[k] ? new Date(rec[k]) : null;
  return out;
}

export class World {
  data: Data = slice({});
  private snap = new Map<string, string>(); // what each record looked like when it was loaded
  private seq0: Record<string, number> = {};
  private locked = false;
  uploads = new Map<string, string>(); // data URL -> stored reference, for the answer
  constructor(private ctx: Ctx) {}
  private get tx(): Tx {
    return this.ctx.tx;
  }

  // The write lock: every call that may change data holds the id counters until it commits.
  async lock() {
    if (this.locked) return;
    await this.tx.execute(sql`SELECT 1 FROM "counters" ORDER BY "name" FOR UPDATE`);
    this.locked = true;
  }

  private remember(coll: string, recs: Rec[], key: (r: Rec) => string | number = (r) => r.id) {
    for (const r of recs) this.snap.set(coll + ':' + key(r), JSON.stringify(r));
  }

  // Loads the whole marketplace. Correct for every rule; routes with a narrower need can load less later.
  async everything() {
    const tx = this.tx;
    const d = this.data;
    const [platform] = await tx.select().from(schema.platformSettings);
    d.seededAt = platform.seededAt.toISOString();
    d.platform = { guideSubscriptionPrice: platform.guideSubscriptionPrice, subscriptionDays: platform.subscriptionDays, promotionPrice: platform.promotionPrice, promotionDays: platform.promotionDays, iqdPerUsd: platform.iqdPerUsd };
    this.snap.set('platform', JSON.stringify(d.platform));
    d.cities = (await tx.select().from(schema.cities).orderBy(schema.cities.position)).map((c) => ({ slug: c.slug, name: c.name, nameAr: c.nameAr, covers: c.covers }));
    this.remember('cities', d.cities, (c) => c.slug);
    d.media = (await tx.select().from(schema.media).orderBy(schema.media.id)).map((m) => ({ id: m.id, img: 'u:' + m.key }));
    this.remember('media', d.media);
    for (const t of TABLES) {
      const rows = await tx.select().from(t.table as any).orderBy((t.table as any).id);
      (d as any)[t.name] = rows.map((r) => fromRow(r, t.times, t.drop));
      this.remember(t.name, (d as any)[t.name]);
    }
    // Users with their saved card and passport pages; guides with their photos.
    const cards = await tx.select().from(schema.savedCards);
    const pages = await tx.select().from(schema.passportPages).orderBy(schema.passportPages.userId, schema.passportPages.id);
    d.users = (await tx.select().from(schema.users).orderBy(schema.users.id)).map((r): User => {
      const card = cards.find((c) => c.userId === r.id);
      const mine = pages.filter((p) => p.userId === r.id);
      return {
        id: r.id, role: r.role, name: r.name, email: r.email, passwordHash: r.passwordHash, country: r.country, gender: r.gender, avatarColor: r.avatarColor, avatar: r.avatar, cover: r.cover,
        savedCard: card ? { brand: card.brand, last4: card.last4, name: card.name, expiry: card.expiry } : null,
        ...(mine.length ? { passport: mine.map((p) => ({ id: p.id, img: p.img, place: p.place, city: p.city, date: p.date, note: p.note, createdAt: p.createdAt.toISOString() })) } : {}),
        phone: r.phone, phoneVerified: r.phoneVerified, paymentVerified: r.paymentVerified, status: r.status, createdAt: r.createdAt.toISOString(),
      };
    });
    this.remember('users', d.users);
    const guideIds = d.users.filter((u) => u.role === 'guide').map((u) => u.id);
    d.guides = (await loadGuides(tx, guideIds)).sort((a, b) => a.userId - b.userId);
    this.remember('guides', d.guides, (g) => g.userId);
    const counters = await tx.select().from(schema.counters);
    d.seq = Object.fromEntries(counters.map((c) => [c.name, c.value]));
    this.seq0 = { ...d.seq };
  }

  // Is there a hire whose 48 hours have run out? (Then the next call must take the write lock: the sweep will change data.)
  static async lapsedHires(ctx: Ctx): Promise<boolean> {
    const rows = await ctx.tx.select({ id: schema.bookings.id }).from(schema.bookings).where(and(eq(schema.bookings.status, 'awaiting_guide'), lt(schema.bookings.confirmBy, ctx.now))).limit(1);
    return rows.length > 0;
  }

  private async upload(v: string, kind: Parameters<typeof saveUpload>[2], ownerId: number | null): Promise<string> {
    const known = this.uploads.get(v);
    if (known) return known;
    const ref = await saveUpload(this.ctx, v, kind, ownerId);
    this.uploads.set(v, ref);
    return ref;
  }

  // Saves what the handler changed. Order follows the foreign keys.
  async save() {
    const tx = this.tx;
    const d = this.data;
    const changed = (coll: string, key: string | number, rec: Rec): 'new' | 'changed' | null => {
      const before = this.snap.get(coll + ':' + key);
      if (before === undefined) return 'new';
      return before === JSON.stringify(rec) ? null : 'changed';
    };
    const gone = (coll: string, keys: Set<string>) => [...this.snap.keys()].filter((k) => k.startsWith(coll + ':') && !keys.has(k.slice(coll.length + 1))).map((k) => k.slice(coll.length + 1));

    if (this.snap.get('platform') !== JSON.stringify(d.platform)) await tx.update(schema.platformSettings).set(d.platform).where(eq(schema.platformSettings.id, 1));

    // Photos the state added for governorates and events.
    for (const m of d.media || []) {
      if (changed('media', m.id, m) !== 'new') continue;
      const ref = await this.upload(m.img, 'media', null);
      await tx.insert(schema.media).values({ id: m.id, key: ref.slice(2), createdAt: this.ctx.now });
      m.img = ref;
    }
    for (let i = 0; i < d.cities.length; i++) {
      const c = d.cities[i];
      const state = changed('cities', c.slug, c);
      const row = { slug: c.slug, name: c.name, nameAr: c.nameAr, position: i, covers: c.covers || [] };
      if (state === 'new') await tx.insert(schema.cities).values(row);
      else if (state === 'changed') await tx.update(schema.cities).set(row).where(eq(schema.cities.slug, c.slug));
    }

    // Users: their own fields, the saved card and the passport pages.
    for (const u of d.users) {
      const state = changed('users', u.id, u);
      if (!state) continue;
      if (state === 'new') throw new Error('accounts are created by the sign-up route');
      const before = JSON.parse(this.snap.get('users:' + u.id)!) as User;
      if (isDataUrl(u.avatar)) u.avatar = await this.upload(u.avatar, 'avatar', u.id);
      if (isDataUrl(u.cover)) u.cover = await this.upload(u.cover, 'cover', u.id);
      await tx.update(schema.users).set({ name: u.name, email: u.email, phone: u.phone, country: u.country, avatar: u.avatar ?? null, cover: u.cover ?? null, phoneVerified: u.phoneVerified, paymentVerified: u.paymentVerified, status: u.status }).where(eq(schema.users.id, u.id));
      // A suspended account is signed out everywhere.
      if (u.status === 'suspended' && before.status !== 'suspended') await tx.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
      if (JSON.stringify(u.savedCard || null) !== JSON.stringify(before.savedCard || null)) {
        await tx.delete(schema.savedCards).where(eq(schema.savedCards.userId, u.id));
        if (u.savedCard) await tx.insert(schema.savedCards).values({ userId: u.id, ...u.savedCard });
      }
      if (JSON.stringify(u.passport || []) !== JSON.stringify(before.passport || [])) {
        const keep = new Set((u.passport || []).map((p) => p.id));
        const removed = (before.passport || []).filter((p) => !keep.has(p.id)).map((p) => p.id);
        if (removed.length) await tx.delete(schema.passportPages).where(and(eq(schema.passportPages.userId, u.id), inArray(schema.passportPages.id, removed)));
        for (const p of u.passport || []) {
          if ((before.passport || []).some((x) => x.id === p.id)) continue;
          if (isDataUrl(p.img)) p.img = await this.upload(p.img, 'passport', u.id);
          await tx.insert(schema.passportPages).values({ userId: u.id, id: p.id, img: p.img, place: p.place, city: p.city, date: p.date, note: p.note, createdAt: new Date(p.createdAt) });
        }
      }
    }

    // Guide profiles, tour photos and the private identity photos.
    for (const g of d.guides) {
      const state = changed('guides', g.userId, g);
      if (!state) continue;
      if (state === 'new') throw new Error('guide profiles are created by the sign-up route');
      const before = JSON.parse(this.snap.get('guides:' + g.userId)!) as GuideProfile;
      await tx.update(schema.guideProfiles).set({
        headline: g.headline, headlineAr: g.headlineAr, bio: g.bio, bioAr: g.bioAr, pricePerDay: g.pricePerDay, cities: g.cities, languages: g.languages, specialities: g.specialities, places: g.places,
        blockedDates: g.blockedDates, verification: g.verification, verificationNote: g.verificationNote, verificationDocs: g.verificationDocs,
        verificationRequestedAt: g.verificationRequestedAt ? new Date(g.verificationRequestedAt) : null, acceptsCash: g.acceptsCash,
        subscriptionUntil: g.subscriptionUntil ? new Date(g.subscriptionUntil) : null, promotedUntil: g.promotedUntil ? new Date(g.promotedUntil) : null,
      }).where(eq(schema.guideProfiles.userId, g.userId));
      if (JSON.stringify(g.photos) !== JSON.stringify(before.photos)) {
        for (const ph of g.photos) if (isDataUrl(ph.img)) ph.img = await this.upload(ph.img, 'guide', g.userId);
        await tx.delete(schema.guidePhotos).where(eq(schema.guidePhotos.guideId, g.userId));
        if (g.photos.length) await tx.insert(schema.guidePhotos).values(g.photos.map((ph, position) => ({ guideId: g.userId, position, img: ph.img, caption: ph.caption, captionAr: ph.captionAr })));
      }
      const v = g.verificationPhotos;
      if (v && JSON.stringify(v) !== JSON.stringify(before.verificationPhotos || null)) {
        const row = { idFront: isDataUrl(v.idFront) ? await this.upload(v.idFront, 'id', g.userId) : v.idFront, idBack: isDataUrl(v.idBack) ? await this.upload(v.idBack, 'id', g.userId) : v.idBack, residence: isDataUrl(v.residence) ? await this.upload(v.residence, 'id', g.userId) : v.residence };
        Object.assign(v, row);
        await tx.insert(schema.verificationPhotos).values({ guideId: g.userId, ...row }).onConflictDoUpdate({ target: schema.verificationPhotos.guideId, set: row });
      }
    }

    for (const t of TABLES) {
      const recs = ((d as any)[t.name] || []) as Rec[];
      const table = t.table as any;
      const removed = gone(t.name, new Set(recs.map((r) => String(r.id)))).map(Number);
      if (removed.length) await tx.delete(table).where(inArray(table.id, removed));
      const fresh: Rec[] = [];
      for (const r of recs) {
        const state = changed(t.name, r.id, r);
        if (state === 'new') fresh.push(toRow(r, t.times));
        else if (state === 'changed') await tx.update(table).set(toRow(r, t.times)).where(eq(table.id, r.id));
      }
      for (let i = 0; i < fresh.length; i += 200) await tx.insert(table).values(fresh.slice(i, i + 200));
    }

    // New ids: the engine's counters, plus the tables it numbers by "highest id + 1".
    const seq: Record<string, number> = { ...d.seq };
    const top = (xs: { id: number }[] = []) => xs.reduce((a, x) => Math.max(a, x.id), 0);
    for (const [name, value] of [['media', top(d.media)], ['events', top(d.events)], ['withdrawals', top(d.withdrawals)], ['places', top(d.places)]] as const) seq[name] = Math.max(seq[name] || 0, value);
    for (const [name, value] of Object.entries(seq)) {
      if (this.seq0[name] === value) continue;
      if (!this.locked) throw new Error('new ids were handed out without the write lock');
      await tx.insert(schema.counters).values({ name, value }).onConflictDoUpdate({ target: schema.counters.name, set: { value } });
    }
    this.resnapshot(seq);
  }

  // After saving, the saved state is the new starting point (the sweep is saved before the handler runs).
  private resnapshot(seq: Record<string, number>) {
    const d = this.data;
    this.snap.clear();
    this.seq0 = { ...seq };
    this.snap.set('platform', JSON.stringify(d.platform));
    this.remember('cities', d.cities, (c) => c.slug);
    this.remember('media', d.media || []);
    this.remember('users', d.users);
    this.remember('guides', d.guides, (g) => g.userId);
    for (const t of TABLES) this.remember(t.name, (d as any)[t.name] || []);
  }

  // The money the handler decided to move, read from what it changed (before it is saved):
  // new card payments, held days that were refunded, held days released to the guide, and wallet withdrawals.
  moneyMoves() {
    const d = this.data;
    const was = (coll: string, id: number) => { const s = this.snap.get(coll + ':' + id); return s ? JSON.parse(s) : null; };
    const charges = d.payments.filter((p) => !was('payments', p.id));
    const withdrawals = (d.withdrawals || []).filter((x) => !was('withdrawals', x.id));
    const refunds = new Map<number, number>();
    const payouts = new Map<number, number>();
    for (const m of d.milestones) {
      const before = was('milestones', m.id);
      const b = d.bookings.find((x) => x.id === m.bookingId)!;
      if (b.paymentMethod === 'cash' || (before && before.status === m.status)) continue;
      if (m.status === 'refunded') refunds.set(b.id, (refunds.get(b.id) || 0) + m.amount);
      if (m.status === 'released') payouts.set(b.id, (payouts.get(b.id) || 0) + m.amount * (1 - b.feeRate));
    }
    const booking = (id: number) => d.bookings.find((x) => x.id === id)!;
    return {
      charges,
      withdrawals,
      refunds: [...refunds].map(([bookingId, amount]) => ({ bookingId, touristId: booking(bookingId).touristId, amount: Math.round(amount * 100) / 100 })),
      payouts: [...payouts].map(([bookingId, amount]) => ({ bookingId, guideId: booking(bookingId).guideId, amount: Math.round(amount * 100) / 100 })),
    };
  }

  // Did the handler (or the sweep) change anything since the last load or save?
  get dirty(): boolean {
    const d = this.data;
    const same = (coll: string, recs: Rec[], key: (r: Rec) => string | number = (r) => r.id) => recs.every((r) => this.snap.get(coll + ':' + key(r)) === JSON.stringify(r));
    return !(same('users', d.users) && same('guides', d.guides, (g) => g.userId) && TABLES.every((t) => same(t.name, (d as any)[t.name] || []))) || this.seq0.notifications !== d.seq.notifications;
  }
}
