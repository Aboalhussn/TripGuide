// The frame every API call runs in: one database transaction, the signed-in user, the clock, and the same
// routing and error answers as the demo engine (src/core/api.ts createApi).
import crypto from 'node:crypto';
import { hash as argonHash, hashSync as argonHashSync, verify as argonVerify } from '@node-rs/argon2';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Data, GuideProfile, PassportPage, Platform, Role, SavedCard, User } from '../core/types';
import { ApiError, forbidden, iraqDate } from '../core/util';
import { meView as coreMeView, type Ctx as CoreCtx } from '../core/api';
import { nextId, schema, type Db, type Tx } from '../db/client';
import type { Config } from './config';
import { decodeDataUrl, newMediaKey, type Clock, type MediaStore, type RateLimiter, type SmsSender } from './services';

export interface Deps { cfg: Config; db: Db; clock: Clock; sms: SmsSender; media: MediaStore; limiter: RateLimiter; log: { info(o: object, msg?: string): void; warn(o: object, msg?: string): void; error(o: object, msg?: string): void } }
export interface Req { method: string; path: string; query: Record<string, string>; body: any; token: string | null; ip: string }
export interface Res { status: number; body: any }
export interface Ctx { deps: Deps; tx: Tx; user: User | null; tokenHash: string | null; now: Date; nowIso: string; today: string; req: Req; afterCommit: (() => Promise<void> | void)[] }
export type Handler = (ctx: Ctx, params: Record<string, string>, req: Req) => Promise<any>;

// An error that still keeps what the handler already saved (a wrong reset code must count as a try).
export class CommittedError extends Error {
  constructor(public error: ApiError) {
    super(error.code);
  }
}

const routes: { method: string; re: RegExp; keys: string[]; handler: Handler }[] = [];
export function route(method: string, pattern: string, handler: Handler) {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
}
export const routeCount = () => routes.length;

// ---------- passwords and tokens ----------
// argon2id. Tests use light settings so the suite stays fast; everything else uses the library's safe defaults.
const argonOptions = (cfg: Config) => (cfg.APP_ENV === 'test' ? { memoryCost: 1024, timeCost: 1, parallelism: 1 } : undefined);
export const hashPassword = (cfg: Config, password: string) => argonHash(password, argonOptions(cfg));
export const hashPasswordSync = (cfg: Config, password: string) => argonHashSync(password, argonOptions(cfg));
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    return await argonVerify(stored, password);
  } catch {
    return false;
  }
}
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
// Short codes (reset, phone) are kept as a keyed hash: useless without the server's secret.
export const codeHash = (cfg: Config, userId: number, code: string) => crypto.createHmac('sha256', cfg.TOKEN_SECRET).update(userId + ':' + code).digest('hex');
export const newCode = () => String(crypto.randomInt(100000, 1000000));

// Signs a user in: a random token, of which only the hash is stored, with an expiry.
export async function startSession(ctx: Ctx, userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await ctx.tx.insert(schema.sessions).values({ tokenHash: sha256(token), userId, createdAt: ctx.now, expiresAt: new Date(ctx.now.getTime() + ctx.deps.cfg.SESSION_DAYS * 86400_000) });
  return token;
}

// ---------- access (same answers as the engine) ----------
export function need(ctx: Ctx, ...roles: Role[]): User {
  if (!ctx.user) throw new ApiError(401, 'login_required');
  if (roles.length && !roles.includes(ctx.user.role)) throw forbidden();
  return ctx.user;
}
export function needActive(ctx: Ctx, ...roles: Role[]): User {
  const u = need(ctx, ...roles);
  if (u.status === 'suspended') throw forbidden('account_suspended');
  return u;
}

// ---------- rows as the engine's records ----------
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toUser(r: typeof schema.users.$inferSelect, card: SavedCard | null = null, passport?: PassportPage[]): User {
  return {
    id: r.id, role: r.role, name: r.name, email: r.email, passwordHash: r.passwordHash, country: r.country, gender: r.gender, avatarColor: r.avatarColor,
    avatar: r.avatar, cover: r.cover, savedCard: card, ...(passport ? { passport } : {}), phone: r.phone, phoneVerified: r.phoneVerified, paymentVerified: r.paymentVerified,
    status: r.status, createdAt: r.createdAt.toISOString(),
  };
}

export async function loadUser(tx: Tx, id: number): Promise<User | null> {
  const [r] = await tx.select().from(schema.users).where(eq(schema.users.id, id));
  if (!r) return null;
  const [card] = await tx.select().from(schema.savedCards).where(eq(schema.savedCards.userId, id));
  const passport = r.role === 'tourist' ? await loadPassport(tx, id) : undefined;
  return toUser(r, card ? { brand: card.brand, last4: card.last4, name: card.name, expiry: card.expiry } : null, passport);
}

export async function loadPassport(tx: Tx, userId: number): Promise<PassportPage[]> {
  const rows = await tx.select().from(schema.passportPages).where(eq(schema.passportPages.userId, userId)).orderBy(schema.passportPages.id);
  return rows.map((p) => ({ id: p.id, img: p.img, place: p.place, city: p.city, date: p.date, note: p.note, createdAt: p.createdAt.toISOString() }));
}

export async function loadGuides(tx: Tx, ids: number[]): Promise<GuideProfile[]> {
  if (!ids.length) return [];
  const rows = await tx.select().from(schema.guideProfiles).where(inArray(schema.guideProfiles.userId, ids));
  const photos = await tx.select().from(schema.guidePhotos).where(inArray(schema.guidePhotos.guideId, ids)).orderBy(schema.guidePhotos.guideId, schema.guidePhotos.position);
  const docs = await tx.select().from(schema.verificationPhotos).where(inArray(schema.verificationPhotos.guideId, ids));
  return rows.map((g) => {
    const d = docs.find((x) => x.guideId === g.userId);
    return {
      userId: g.userId, headline: g.headline, headlineAr: g.headlineAr, bio: g.bio, bioAr: g.bioAr, pricePerDay: g.pricePerDay, cities: g.cities, languages: g.languages,
      specialities: g.specialities, places: g.places, photos: photos.filter((p) => p.guideId === g.userId).map((p) => ({ img: p.img, caption: p.caption, captionAr: p.captionAr })),
      blockedDates: g.blockedDates, verification: g.verification, verificationNote: g.verificationNote, verificationDocs: g.verificationDocs,
      verificationPhotos: d ? { idFront: d.idFront, idBack: d.idBack, residence: d.residence } : null,
      verificationRequestedAt: iso(g.verificationRequestedAt), acceptsCash: g.acceptsCash, subscriptionUntil: iso(g.subscriptionUntil), promotedUntil: iso(g.promotedUntil),
    };
  });
}

// A piece of the engine's Data holding only the rows a view needs. The view functions in src/core then run unchanged.
export function slice(parts: Partial<Data>): Data {
  return {
    version: 1, seededAt: '', seq: {}, users: [], guides: [], cities: [], places: [], media: [], withdrawals: [], events: [], resets: [], requests: [], offers: [], bookings: [],
    milestones: [], reviews: [], threads: [], messages: [], notifications: [], reports: [], sessions: [], payments: [],
    platform: { guideSubscriptionPrice: 0, subscriptionDays: 0, promotionPrice: 0, promotionDays: 0, iqdPerUsd: 0 },
    ...parts,
  };
}
const noPlatform: Platform = { now: () => new Date(0), hashPassword: () => '', verifyPassword: () => false, randomToken: () => '' };
export const coreCtx = (ctx: Ctx, data: Data): CoreCtx => ({ data, p: noPlatform, user: ctx.user, now: ctx.now, nowIso: ctx.nowIso, today: ctx.today });

// GET /me: the engine's own meView, fed with this user's unread notifications, chats and guide profile.
export async function meView(ctx: Ctx, u: User) {
  const { tx } = ctx;
  const notifications = await tx.select().from(schema.notifications).where(and(eq(schema.notifications.userId, u.id), eq(schema.notifications.read, false)));
  const threads = await tx.select().from(schema.threads).where(sql`${schema.threads.touristId} = ${u.id} OR ${schema.threads.guideId} = ${u.id}`);
  const messages = threads.length ? await tx.select().from(schema.messages).where(and(inArray(schema.messages.threadId, threads.map((t) => t.id)), sql`${schema.messages.senderId} <> ${u.id}`)) : [];
  const data = slice({
    users: [u],
    guides: u.role === 'guide' ? await loadGuides(tx, [u.id]) : [],
    notifications: notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    threads: threads.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), lastAt: t.lastAt.toISOString() })),
    messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
  });
  return coreMeView(coreCtx(ctx, data), u);
}

// ---------- media ----------
// Uploaded photos are kept in storage and remembered as 'u:<key>'; answers carry their URL instead.
const PUBLIC_REF = /^u:((?:avatar|cover|guide|passport|media)\/[0-9a-f]{32}\.(?:jpg|png|webp|svg))$/;
export function withMediaUrls<T>(v: T, media: MediaStore): T {
  if (typeof v === 'string') {
    const m = PUBLIC_REF.exec(v);
    return (m ? media.publicUrl(m[1]) : v) as T;
  }
  if (Array.isArray(v)) return v.map((x) => withMediaUrls(x, media)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withMediaUrls(x, media)])) as T;
  return v;
}
// The app sends back the URLs it was given (for example the guide's photo list): find the stored reference again.
export function mediaRefFromUrl(url: string, media: MediaStore): string | null {
  const prefix = media.publicUrl('');
  if (!url.startsWith(prefix)) return null;
  const ref = 'u:' + url.slice(prefix.length);
  return PUBLIC_REF.test(ref) ? ref : null;
}
// Saves an uploaded photo (a data URL the engine's imageData() already checked) and returns its reference.
export async function saveUpload(ctx: Ctx, dataUrl: string, kind: 'avatar' | 'cover' | 'guide' | 'passport' | 'media' | 'id', ownerId: number | null): Promise<string> {
  const file = decodeDataUrl(dataUrl);
  if (!file) throw new ApiError(400, 'photo_invalid');
  const isPrivate = kind === 'id';
  const key = newMediaKey(kind, file.ext);
  await ctx.deps.media.put(key, file.bytes, file.contentType, isPrivate);
  await ctx.tx.insert(schema.uploads).values({ key, ownerId, kind, contentType: file.contentType, bytes: file.bytes.length, private: isPrivate, createdAt: ctx.now });
  return (isPrivate ? 'p:' : 'u:') + key;
}

// ---------- audit ----------
export async function audit(ctx: Ctx, action: string, targetType: string, targetId: string | number, details: Record<string, unknown> = {}) {
  await ctx.tx.insert(schema.auditLog).values({ adminId: ctx.user!.id, action, targetType, targetId: String(targetId), details, ip: ctx.req.ip, at: ctx.now });
}

// ---------- one API call ----------
export async function handle(deps: Deps, req: Req): Promise<Res> {
  const now = deps.clock.now();
  const r = routes.find((x) => x.method === req.method && x.re.test(req.path));
  if (!r) {
    const pathExists = routes.some((x) => x.re.test(req.path));
    return { status: pathExists ? 405 : 404, body: { error: pathExists ? 'method_not_allowed' : 'not_found', params: {} } };
  }
  const m = req.path.match(r.re)!;
  const params: Record<string, string> = {};
  r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
  const afterCommit: Ctx['afterCommit'] = [];
  try {
    const res = await deps.db.transaction(async (tx): Promise<Res> => {
      const ctx: Ctx = { deps, tx, user: null, tokenHash: null, now, nowIso: now.toISOString(), today: iraqDate(now), req, afterCommit };
      if (req.token) {
        const tokenHash = sha256(req.token);
        const [s] = await tx.select().from(schema.sessions).where(and(eq(schema.sessions.tokenHash, tokenHash), gt(schema.sessions.expiresAt, now)));
        if (s) {
          ctx.user = await loadUser(tx, s.userId);
          ctx.tokenHash = tokenHash;
          // Sessions stay alive while they are used: push the expiry forward at most once a day.
          const full = new Date(now.getTime() + deps.cfg.SESSION_DAYS * 86400_000);
          if (full.getTime() - s.expiresAt.getTime() > 86400_000) await tx.update(schema.sessions).set({ expiresAt: full }).where(eq(schema.sessions.tokenHash, tokenHash));
        }
      }
      try {
        const body = await r.handler(ctx, params, req);
        return { status: 200, body: withMediaUrls(body, deps.media) };
      } catch (e) {
        if (e instanceof CommittedError) return { status: e.error.status, body: { error: e.error.code, params: e.error.params } };
        throw e;
      }
    });
    for (const fn of afterCommit) {
      try {
        await fn();
      } catch (e) {
        deps.log.error({ err: String(e), path: req.path }, 'after-commit step failed');
      }
    }
    return res;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { error: e.code, params: e.params } };
    deps.log.error({ err: e instanceof Error ? e.stack : String(e), method: req.method, path: req.path }, 'request failed');
    return { status: 500, body: { error: 'server_error' } };
  }
}

export { nextId };
