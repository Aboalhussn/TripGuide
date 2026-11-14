// Meta, sign-up, sign-in by phone, passwords, and the signed-in user's own info.
// Same checks, same order and same error codes as src/core/api.ts; the data lives in PostgreSQL.
import { and, eq, ne, sql } from 'drizzle-orm';
import { settings } from '../../config/brand';
import { AVATAR_COLORS, cityCovers, coversFor, GUIDE_RATING_KEYS, INCLUDES, INTERESTS, LANGUAGES, LANGUAGE_LEVELS, PHOTO_LIBRARY, PLACE_KINDS, TOURIST_RATING_KEYS } from '../../core/catalog';
import { checkPassword, imageData, TEST_CARDS } from '../../core/api';
import { loginPhone, serverPhone } from '../../core/phone';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../core/seed';
import { ApiError, bad, conflict, str } from '../../core/util';
import { schema } from '../../db/client';
import { CommittedError, codeHash, hashPassword, loadUser, meView, need, newCode, nextId, route, saveUpload, sha256, startSession, verifyPassword, worldWrite, type Ctx } from '../kernel';

const tooMany = () => new ApiError(429, 'too_many_attempts');
// Counts one try against a limit; over the limit the call is refused before it does anything.
async function limit(ctx: Ctx, key: string, max: number, seconds: number) {
  if (ctx.deps.cfg.RATE_LIMIT === 'off') return;
  if (!(await ctx.deps.limiter.hit(key, max, seconds))) throw tooMany();
}

// A database unique index is the last word on "already taken", also when two sign-ups race.
function takenError(e: unknown): ApiError | null {
  const text = String((e as any)?.constraint || '') + ' ' + String((e as any)?.cause?.constraint || '') + ' ' + String((e as any)?.message || '') + ' ' + String((e as any)?.cause?.message || '');
  if (text.includes('users_phone_key')) return conflict('phone_taken');
  if (text.includes('users_email_key')) return conflict('email_taken');
  return null;
}

// =====================================================================
// Meta
route('GET', '/meta', async (ctx) => {
  const { tx, deps } = ctx;
  const cityRows = await tx.select().from(schema.cities).orderBy(schema.cities.position);
  const cities = cityRows.map((c) => ({ slug: c.slug, name: c.name, nameAr: c.nameAr, covers: c.covers }));
  const media = await tx.select().from(schema.media).orderBy(schema.media.id);
  const [platform] = await tx.select().from(schema.platformSettings);
  return {
    cities: cities.map(({ covers, ...c }) => c),
    cityCovers: Object.fromEntries(cities.map((c) => [c.slug, cityCovers(c)])),
    generalCovers: coversFor([], []),
    media: Object.fromEntries(media.map((m) => ['m:' + m.id, deps.media.publicUrl(m.key)])),
    places: await tx.select().from(schema.places).orderBy(schema.places.id),
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
      cardSandbox: deps.cfg.PAYMENT_PROVIDER === 'simulated',
      testCards: TEST_CARDS,
      guideSubscriptionPrice: platform.guideSubscriptionPrice,
      subscriptionDays: platform.subscriptionDays,
    },
    iqdPerUsd: platform.iqdPerUsd,
    confirmWindowHours: settings.confirmWindowHours,
    // Demo helpers exist on staging only: production never shows a demo code or demo accounts.
    demoPhoneCode: deps.cfg.demoHelpers ? settings.demoPhoneCode : null,
    demoLogins: deps.cfg.demoHelpers && (await tx.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.phone, DEMO_ACCOUNTS.admin), eq(schema.users.role, 'admin')))).length ? { ...DEMO_ACCOUNTS, password: DEMO_PASSWORD } : null,
    today: ctx.today,
  };
});

// ---------- auth ----------
route('POST', '/auth/register', async (ctx, _p, req) => {
  const { tx } = ctx;
  await worldWrite(tx);
  await limit(ctx, 'register:ip:' + req.ip, 30, 3600);
  const b = req.body || {};
  const role = b.role === 'guide' ? 'guide' : b.role === 'tourist' ? 'tourist' : null;
  if (!role) throw bad('field_required', { field: 'role' });
  const name = str(b.name, 'name', 2, 60);
  const phone = serverPhone(b.phone);
  const email = str(b.email, 'email', 3, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('email_invalid');
  checkPassword(b.password);
  if ((await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phone, phone))).length) throw conflict('phone_taken');
  if ((await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email))).length) throw conflict('email_taken');
  const country = str(b.country, 'country', 2, 60);
  const gender = b.gender === 'f' ? 'f' : b.gender === 'm' ? 'm' : null;
  if (!gender) throw bad('field_required', { field: 'gender' });
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  const id = await nextId(tx, 'users');
  try {
    await tx.insert(schema.users).values({ id, role, name, email, phone, passwordHash: await hashPassword(ctx.deps.cfg, b.password), country, gender, avatarColor: n % AVATAR_COLORS, status: 'active', createdAt: ctx.now });
  } catch (e) {
    throw takenError(e) || e;
  }
  if (role === 'guide') {
    await tx.insert(schema.guideProfiles).values({ userId: id, pricePerDay: 40, cities: [], languages: [{ code: 'ar', level: 'native' }], specialities: [], places: [], blockedDates: [], verificationDocs: [] });
  }
  const token = await startSession(ctx, id);
  return { token, user: await meView(ctx, (await loadUser(tx, id))!) };
});

route('POST', '/auth/login', async (ctx, _p, req) => {
  const { tx, deps } = ctx;
  const phone = loginPhone(req.body?.phone);
  const limited = deps.cfg.RATE_LIMIT !== 'off';
  // Wrong tries are counted per phone and per address; a correct sign-in clears the phone's count.
  const keys = ['login:ip:' + req.ip, ...(phone ? ['login:phone:' + phone] : [])];
  if (limited && ((await deps.limiter.count(keys[0])) >= 100 || (phone && (await deps.limiter.count(keys[1])) >= 10))) throw tooMany();
  const [row] = phone ? await tx.select().from(schema.users).where(eq(schema.users.phone, phone)) : [];
  if (!row || !(await verifyPassword(String(req.body?.password || ''), row.passwordHash))) {
    if (limited) for (const k of keys) await deps.limiter.hit(k, Infinity, 900);
    throw new ApiError(401, 'login_failed');
  }
  if (limited && phone) await deps.limiter.clear(keys[1]);
  const token = await startSession(ctx, row.id);
  return { token, user: await meView(ctx, (await loadUser(tx, row.id))!) };
});

// Forgot password: a 6-digit code by SMS, valid 15 minutes. The answer is the same whether or not the phone
// has an account. On staging (no SMS service needed) the code is also returned as demoCode.
route('POST', '/auth/forgot', async (ctx, _p, req) => {
  const { tx, deps } = ctx;
  const phone = serverPhone(req.body?.phone);
  await limit(ctx, 'forgot:ip:' + req.ip, 30, 3600);
  await limit(ctx, 'forgot:phone:' + phone, 5, 900);
  const [u] = await tx.select().from(schema.users).where(and(eq(schema.users.phone, phone), ne(schema.users.role, 'admin')));
  if (!u) return { sent: true };
  const code = newCode();
  const values = { codeHash: codeHash(deps.cfg, u.id, code), expiresAt: new Date(ctx.now.getTime() + 15 * 60_000), tries: 0 };
  await tx.insert(schema.passwordResets).values({ userId: u.id, ...values }).onConflictDoUpdate({ target: schema.passwordResets.userId, set: values });
  ctx.afterCommit.push(() => deps.sms.send(phone, `${code} is your Trip guide code to reset your password. It is valid for 15 minutes.\n${code} هو رمز Trip guide لاستعادة كلمة المرور. صالح لمدة ١٥ دقيقة.`));
  return { sent: true, ...(deps.cfg.demoHelpers ? { demoCode: code } : {}) };
});

// Sets a new password with the SMS code, signs out everywhere else, and signs in.
route('POST', '/auth/reset', async (ctx, _p, req) => {
  const { tx, deps } = ctx;
  await limit(ctx, 'reset:ip:' + req.ip, 60, 900);
  const phone = loginPhone(req.body?.phone);
  const [u] = phone ? await tx.select().from(schema.users).where(eq(schema.users.phone, phone)) : [];
  const [r] = u ? await tx.select().from(schema.passwordResets).where(eq(schema.passwordResets.userId, u.id)).for('update') : [];
  if (!u || !r || r.expiresAt.toISOString() < ctx.nowIso || r.tries >= 5) throw bad('reset_code_invalid');
  if (codeHash(deps.cfg, u.id, String(req.body?.code || '').trim()) !== r.codeHash) {
    await tx.update(schema.passwordResets).set({ tries: r.tries + 1 }).where(eq(schema.passwordResets.userId, u.id));
    throw new CommittedError(bad('reset_code_invalid')); // the wrong try is counted even though the call fails
  }
  const passwordHash = await hashPassword(deps.cfg, checkPassword(req.body?.password));
  await worldWrite(tx);
  await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, u.id));
  await tx.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, u.id));
  await tx.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
  const token = await startSession(ctx, u.id);
  return { token, user: await meView(ctx, (await loadUser(tx, u.id))!) };
});

// Change password while signed in: the current one first; other sessions are signed out.
route('POST', '/me/password', async (ctx, _p, req) => {
  const u = need(ctx);
  if (!(await verifyPassword(String(req.body?.current || ''), u.passwordHash))) throw bad('password_wrong');
  const pw = checkPassword(req.body?.password);
  if (await verifyPassword(pw, u.passwordHash)) throw bad('password_same');
  await worldWrite(ctx.tx);
  await ctx.tx.update(schema.users).set({ passwordHash: await hashPassword(ctx.deps.cfg, pw) }).where(eq(schema.users.id, u.id));
  await ctx.tx.delete(schema.sessions).where(and(eq(schema.sessions.userId, u.id), ne(schema.sessions.tokenHash, ctx.tokenHash!)));
  return { ok: true };
});

route('POST', '/auth/logout', async (ctx, _p, req) => {
  if (req.token) await ctx.tx.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(req.token)));
  return { ok: true };
});

route('GET', '/me', async (ctx) => meView(ctx, need(ctx)));

route('PUT', '/me', async (ctx, _p, req) => {
  const u = need(ctx);
  const { tx } = ctx;
  await worldWrite(tx);
  const b = req.body || {};
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (b.name !== undefined) set.name = str(b.name, 'name', 2, 60);
  if (b.country !== undefined) set.country = str(b.country, 'country', 2, 60);
  if (b.email !== undefined) {
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw bad('email_invalid');
    if (email !== u.email && (await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email))).length) throw conflict('email_taken');
    set.email = email;
  }
  if (b.phone !== undefined) {
    const phone = serverPhone(b.phone);
    if (phone !== u.phone && (await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phone, phone))).length) throw conflict('phone_taken');
    if (phone !== u.phone) set.phoneVerified = false;
    set.phone = phone;
  }
  // Profile and cover photos: a resized JPEG/PNG/WebP data URL, or null to remove.
  if (b.avatar !== undefined) set.avatar = b.avatar === null ? null : await saveUpload(ctx, imageData(b.avatar, 'avatar', 200_000), 'avatar', u.id);
  if (b.cover !== undefined) set.cover = b.cover === null ? null : await saveUpload(ctx, imageData(b.cover, 'cover', 450_000), 'cover', u.id);
  if (Object.keys(set).length) {
    try {
      await tx.update(schema.users).set(set).where(eq(schema.users.id, u.id));
    } catch (e) {
      throw takenError(e) || e;
    }
  }
  return meView(ctx, (await loadUser(tx, u.id))!);
});

// Sends the phone verification code by SMS. On staging the fixed demo code also works, like in the demo.
route('POST', '/me/phone-code', async (ctx) => {
  const u = need(ctx);
  const { tx, deps } = ctx;
  if (!u.phone) throw bad('phone_missing');
  await limit(ctx, 'phonecode:user:' + u.id, 5, 3600);
  const code = newCode();
  const values = { phone: u.phone, codeHash: codeHash(deps.cfg, u.id, code), expiresAt: new Date(ctx.now.getTime() + 15 * 60_000), tries: 0 };
  await tx.insert(schema.phoneCodes).values({ userId: u.id, ...values }).onConflictDoUpdate({ target: schema.phoneCodes.userId, set: values });
  ctx.afterCommit.push(() => deps.sms.send(u.phone, `${code} is your Trip guide code to verify your phone.\n${code} هو رمز Trip guide لتوثيق هاتفك.`));
  return { sent: true };
});

route('POST', '/me/verify-phone', async (ctx, _p, req) => {
  const u = need(ctx);
  const { tx, deps } = ctx;
  if (!u.phone) throw bad('phone_missing');
  const code = String(req.body?.code || '').trim();
  const [r] = await tx.select().from(schema.phoneCodes).where(eq(schema.phoneCodes.userId, u.id)).for('update');
  const sentOk = !!r && r.phone === u.phone && r.expiresAt.toISOString() >= ctx.nowIso && r.tries < 5 && codeHash(deps.cfg, u.id, code) === r.codeHash;
  const demoOk = deps.cfg.demoHelpers && code === settings.demoPhoneCode;
  if (!sentOk && !demoOk) {
    if (r) await tx.update(schema.phoneCodes).set({ tries: r.tries + 1 }).where(eq(schema.phoneCodes.userId, u.id));
    throw new CommittedError(bad('code_wrong'));
  }
  await worldWrite(tx);
  await tx.update(schema.users).set({ phoneVerified: true }).where(eq(schema.users.id, u.id));
  await tx.delete(schema.phoneCodes).where(eq(schema.phoneCodes.userId, u.id));
  return meView(ctx, (await loadUser(tx, u.id))!);
});
