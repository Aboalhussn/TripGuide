// First data in a new database.
//   Production: the governorates, their places, the starting prices and the state (admin) account. Nothing else.
//   Demo (staging): exactly the demo data of src/core/seed.ts, written into the tables row for row.
// Run by hand:  npm run db:seed            (production data)
//               npm run db:seed -- --demo  (demo data)
import { eq, sql } from 'drizzle-orm';
import { settings } from '../config/brand';
import { checkPassword } from '../core/api';
import { CITIES, CITY_COVERS, PLACES } from '../core/catalog';
import { serverPhone } from '../core/phone';
import { seed as demoSeed } from '../core/seed';
import type { Data } from '../core/types';
import type { Config } from '../api/config';
import { hashPassword, hashPasswordSync } from '../api/kernel';
import { decodeDataUrl, newMediaKey, type Clock, type MediaStore } from '../api/services';
import { nextId, schema, type Db, type Tx } from './client';

const d = (s: string) => new Date(s);
const dn = (s: string | null | undefined) => (s ? new Date(s) : null);

async function insertMany(tx: Tx, table: any, rows: object[]) {
  for (let i = 0; i < rows.length; i += 200) await tx.insert(table).values(rows.slice(i, i + 200));
}

export async function isEmpty(db: Db): Promise<boolean> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.platformSettings);
  return n === 0;
}

// Writes a whole engine Data object into the database: every record keeps its id.
export async function importData(db: Db, data: Data, media: MediaStore): Promise<void> {
  // Pictures that are stored inline in the engine go to media storage; the row keeps a reference.
  const stored = async (tx: Tx, img: string, kind: 'avatar' | 'cover' | 'guide' | 'passport' | 'media' | 'id', ownerId: number | null): Promise<string> => {
    const file = decodeDataUrl(img);
    if (!file) return img; // 'lib:<name>', a built-in picture name or 'm:<id>'
    const key = newMediaKey(kind, file.ext);
    await media.put(key, file.bytes, file.contentType, kind === 'id');
    await tx.insert(schema.uploads).values({ key, ownerId, kind, contentType: file.contentType, bytes: file.bytes.length, private: kind === 'id', createdAt: d(data.seededAt) });
    return (kind === 'id' ? 'p:' : 'u:') + key;
  };
  await db.transaction(async (tx) => {
    await tx.insert(schema.platformSettings).values({ id: 1, ...data.platform, seededAt: d(data.seededAt) });
    await insertMany(tx, schema.cities, data.cities.map((c, i) => ({ slug: c.slug, name: c.name, nameAr: c.nameAr, position: i, covers: c.covers || [] })));
    await insertMany(tx, schema.places, data.places);
    for (const m of data.media || []) await tx.insert(schema.media).values({ id: m.id, key: (await stored(tx, m.img, 'media', null)).slice(2), createdAt: d(data.seededAt) });
    for (const u of data.users) {
      await tx.insert(schema.users).values({
        id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone, passwordHash: u.passwordHash, country: u.country, gender: u.gender, avatarColor: u.avatarColor,
        avatar: u.avatar ? await stored(tx, u.avatar, 'avatar', u.id) : null, cover: u.cover ? await stored(tx, u.cover, 'cover', u.id) : null,
        phoneVerified: u.phoneVerified, paymentVerified: u.paymentVerified, status: u.status, createdAt: d(u.createdAt),
      });
      if (u.savedCard) await tx.insert(schema.savedCards).values({ userId: u.id, ...u.savedCard });
      for (const p of u.passport || []) await tx.insert(schema.passportPages).values({ userId: u.id, id: p.id, img: await stored(tx, p.img, 'passport', u.id), place: p.place, city: p.city, date: p.date, note: p.note, createdAt: d(p.createdAt) });
    }
    for (const g of data.guides) {
      await tx.insert(schema.guideProfiles).values({
        userId: g.userId, headline: g.headline, headlineAr: g.headlineAr, bio: g.bio, bioAr: g.bioAr, pricePerDay: g.pricePerDay, cities: g.cities, languages: g.languages, specialities: g.specialities,
        places: g.places, blockedDates: g.blockedDates, verification: g.verification, verificationNote: g.verificationNote, verificationDocs: g.verificationDocs,
        verificationRequestedAt: dn(g.verificationRequestedAt), acceptsCash: g.acceptsCash, subscriptionUntil: dn(g.subscriptionUntil), promotedUntil: dn(g.promotedUntil),
      });
      let position = 0;
      for (const ph of g.photos) await tx.insert(schema.guidePhotos).values({ guideId: g.userId, position: position++, img: await stored(tx, ph.img, 'guide', g.userId), caption: ph.caption, captionAr: ph.captionAr });
      const v = g.verificationPhotos;
      if (v) await tx.insert(schema.verificationPhotos).values({ guideId: g.userId, idFront: await stored(tx, v.idFront, 'id', g.userId), idBack: await stored(tx, v.idBack, 'id', g.userId), residence: await stored(tx, v.residence, 'id', g.userId) });
    }
    for (const e of data.events || []) await tx.insert(schema.specialEvents).values({ ...e, img: await stored(tx, e.img, 'media', null), createdAt: d(e.createdAt) });
    await insertMany(tx, schema.tripRequests, data.requests.map((r) => ({ ...r, plan: r.plan || [], cover: r.cover ?? null, createdAt: d(r.createdAt) })));
    await insertMany(tx, schema.offers, data.offers.map((o) => ({ ...o, createdAt: d(o.createdAt), updatedAt: d(o.updatedAt) })));
    await insertMany(tx, schema.bookings, data.bookings.map((b) => ({ ...b, createdAt: d(b.createdAt), confirmBy: d(b.confirmBy), confirmedAt: dn(b.confirmedAt), completedAt: dn(b.completedAt), cancelledAt: dn(b.cancelledAt) })));
    await insertMany(tx, schema.milestones, data.milestones.map((m) => ({ ...m, fundedAt: d(m.fundedAt), settledAt: dn(m.settledAt) })));
    await insertMany(tx, schema.payments, data.payments.map((p) => ({ ...p, createdAt: d(p.createdAt) })));
    await insertMany(tx, schema.withdrawals, (data.withdrawals || []).map((w) => ({ ...w, createdAt: d(w.createdAt) })));
    await insertMany(tx, schema.threads, data.threads.map((t) => ({ ...t, createdAt: d(t.createdAt), lastAt: d(t.lastAt) })));
    await insertMany(tx, schema.messages, data.messages.map((m) => ({ ...m, createdAt: d(m.createdAt) })));
    await insertMany(tx, schema.notifications, data.notifications.map((n) => ({ ...n, createdAt: d(n.createdAt) })));
    await insertMany(tx, schema.reviews, data.reviews.map((r) => ({ ...r, createdAt: d(r.createdAt) })));
    await insertMany(tx, schema.reports, data.reports.map((r) => ({ ...r, createdAt: d(r.createdAt), resolvedAt: dn(r.resolvedAt) })));
    // The id counters carry on from where the engine's stopped.
    const seq: Record<string, number> = { ...data.seq };
    const max = (xs: { id: number }[] = []) => xs.reduce((a, x) => Math.max(a, x.id), 0);
    Object.assign(seq, { media: max(data.media), events: max(data.events), withdrawals: max(data.withdrawals), places: max(data.places) });
    await insertMany(tx, schema.counters, Object.entries(seq).map(([name, value]) => ({ name, value })));
  });
}

// The demo data of the offline app, with real password hashes.
export async function seedDemo(db: Db, cfg: Config, clock: Clock, media: MediaStore): Promise<Data> {
  const data = demoSeed({ now: () => clock.now(), hashPassword: (p) => hashPasswordSync(cfg, p), verifyPassword: () => false, randomToken: () => '' });
  await importData(db, data, media);
  return data;
}

// Production starts with the governorates, their places and the starting prices only.
export async function seedProduction(db: Db, clock: Clock, media: MediaStore): Promise<void> {
  const now = clock.now().toISOString();
  const data: Data = {
    version: 1, seededAt: now, seq: {}, users: [], guides: [], cities: CITIES.map((c) => ({ ...c, covers: [...(CITY_COVERS[c.slug] || [])] })), places: PLACES.map((p) => ({ ...p })),
    media: [], events: [], requests: [], offers: [], bookings: [], milestones: [], reviews: [], threads: [], messages: [], notifications: [], reports: [], sessions: [], payments: [],
    platform: { guideSubscriptionPrice: settings.guideSubscriptionPrice, subscriptionDays: settings.subscriptionDays, promotionPrice: settings.promotionPrice, promotionDays: settings.promotionDays, iqdPerUsd: settings.iqdPerUsd },
  };
  await importData(db, data, media);
}

// The state (admin) account: created once from ADMIN_PHONE and ADMIN_PASSWORD. Only the password's hash is stored,
// and the password itself is never logged. Returns what happened, for the start-up log.
export async function ensureAdmin(db: Db, cfg: Config, clock: Clock): Promise<'exists' | 'created' | 'skipped'> {
  const phone = serverPhone(cfg.ADMIN_PHONE);
  const [existing] = await db.select({ id: schema.users.id, role: schema.users.role }).from(schema.users).where(eq(schema.users.phone, phone));
  if (existing) {
    if (existing.role !== 'admin') throw new Error('ADMIN_PHONE belongs to an account that is not an admin.');
    return 'exists';
  }
  if (!cfg.ADMIN_PASSWORD) {
    if (cfg.isProduction || cfg.APP_ENV === 'staging') throw new Error('ADMIN_PASSWORD must be set (in .env, never in the repository) to create the state account on first start.');
    return 'skipped';
  }
  try {
    checkPassword(cfg.ADMIN_PASSWORD);
  } catch {
    throw new Error('ADMIN_PASSWORD is too weak: use 8+ characters with a capital letter, a small letter, a number and a symbol.');
  }
  const passwordHash = await hashPassword(cfg, cfg.ADMIN_PASSWORD);
  await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.users);
    await tx.insert(schema.users).values({ id: await nextId(tx, 'users'), role: 'admin', name: cfg.ADMIN_NAME, email: cfg.ADMIN_EMAIL.trim().toLowerCase(), phone, passwordHash, country: 'Iraq', gender: 'f', avatarColor: n % 6, phoneVerified: true, status: 'active', createdAt: clock.now() });
  });
  return 'created';
}

// Called on start: fills an empty database, then makes sure the state account exists.
export async function prepareData(db: Db, cfg: Config, clock: Clock, media: MediaStore): Promise<{ seeded: 'demo' | 'production' | null; admin: 'exists' | 'created' | 'skipped' }> {
  let seeded: 'demo' | 'production' | null = null;
  if (await isEmpty(db)) {
    if (cfg.SEED_DEMO) await seedDemo(db, cfg, clock, media);
    else await seedProduction(db, clock, media);
    seeded = cfg.SEED_DEMO ? 'demo' : 'production';
  }
  return { seeded, admin: await ensureAdmin(db, cfg, clock) };
}
