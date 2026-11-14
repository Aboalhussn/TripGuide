// Every marketplace endpoint that is not written out by hand in account.ts: guides, requests, offers, hiring,
// bookings, payments, wallet, messages, notifications, passport, events, reviews, reports and the state's tools.
// Each call runs the engine's own rule (src/core/api.ts) on rows loaded from PostgreSQL, inside one transaction,
// with the rows that carry money or availability locked. See world.ts.
import { eq, sql } from 'drizzle-orm';
import { ROUTES, runRoute, sweep, type Ctx as CoreCtx } from '../../core/api';
import { ApiError } from '../../core/util';
import { schema } from '../../db/client';
import { CommittedError, audit, hasRoute, mediaRefFromUrl, noPlatform, route, type Ctx, type Req } from '../kernel';
import { World } from '../world';

const deep = (v: any, f: (s: string) => string): any => (typeof v === 'string' ? f(v) : Array.isArray(v) ? v.map((x) => deep(x, f)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x, f)])) : v);

// Row locks for the calls that move money or take a guide's days, on top of the write lock:
// hiring, confirming, declining, cancelling, cash days, payouts, refund decisions and withdrawals.
async function lockRows(ctx: Ctx, req: Req) {
  const { tx } = ctx;
  const id = Number(req.path.split('/')[req.path.startsWith('/admin/') ? 3 : 2]) || 0;
  const lockBooking = async (bookingId: number) => {
    const b = ((await tx.execute(sql`SELECT "guide_id" FROM "bookings" WHERE "id" = ${bookingId} FOR UPDATE`)) as any).rows[0];
    if (!b) return;
    await tx.execute(sql`SELECT 1 FROM "milestones" WHERE "booking_id" = ${bookingId} ORDER BY "id" FOR UPDATE`);
    await tx.execute(sql`SELECT 1 FROM "guide_profiles" WHERE "user_id" = ${b.guide_id} FOR UPDATE`);
  };
  if (/^\/offers\/\d+\/hire$/.test(req.path)) {
    const o = ((await tx.execute(sql`SELECT "request_id", "guide_id" FROM "offers" WHERE "id" = ${id} FOR UPDATE`)) as any).rows[0];
    if (o) {
      await tx.execute(sql`SELECT 1 FROM "trip_requests" WHERE "id" = ${o.request_id} FOR UPDATE`);
      await tx.execute(sql`SELECT 1 FROM "guide_profiles" WHERE "user_id" = ${o.guide_id} FOR UPDATE`);
    }
  } else if (/^\/bookings\/\d+\/(confirm|decline|cancel|report|review)$/.test(req.path) || /^\/admin\/bookings\/\d+\/payout$/.test(req.path)) await lockBooking(id);
  else if (/^\/milestones\/\d+\//.test(req.path)) {
    const m = ((await tx.execute(sql`SELECT "booking_id" FROM "milestones" WHERE "id" = ${id}`)) as any).rows[0];
    if (m) await lockBooking(m.booking_id);
  } else if (/^\/admin\/reports\/\d+\/resolve$/.test(req.path)) {
    const r = ((await tx.execute(sql`SELECT "booking_id" FROM "reports" WHERE "id" = ${id} FOR UPDATE`)) as any).rows[0];
    if (r) await lockBooking(r.booking_id);
  } else if ((req.path === '/wallet/withdraw' || req.path.startsWith('/guide/') || req.path === '/me/card') && ctx.user) await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, ctx.user.id)).for('update');
}

// Carries out the money moves the rules decided on, through the payment provider, before anything is saved:
// if the provider refuses, the whole call fails and nothing changes.
async function settle(ctx: Ctx, w: World, card: unknown) {
  const pay = ctx.deps.payments;
  const moves = w.moneyMoves();
  const refs: [typeof schema.payments | typeof schema.withdrawals, number, string][] = [];
  for (const p of moves.charges) refs.push([schema.payments, p.id, await pay.charge({ paymentId: p.id, userId: p.userId, amount: p.amount, purpose: p.purpose, refId: p.refId, brand: p.brand, last4: p.last4, card })]);
  for (const r of moves.refunds) await pay.refund(r);
  for (const p of moves.payouts) await pay.payout({ kind: 'booking', refId: p.bookingId, userId: p.guideId, amount: p.amount });
  for (const x of moves.withdrawals) refs.push([schema.withdrawals, x.id, await pay.payout({ kind: 'withdrawal', refId: x.id, userId: x.userId, amount: x.amount, brand: x.brand, last4: x.last4 })]);
  return refs;
}

// What the state (admin) did, for the audit log.
const AUDIT: [RegExp, (req: Req) => string][] = [
  [/^\/admin\/guides\/\d+\/verify$/, (r) => (r.body?.approve ? 'guide_verify' : 'guide_reject')],
  [/^\/admin\/bookings\/\d+\/payout$/, () => 'payout'],
  [/^\/admin\/reports\/\d+\/resolve$/, (r) => 'report_' + String(r.body?.action || 'resolve')],
  [/^\/admin\/users\/\d+\/status$/, (r) => (r.body?.status === 'suspended' ? 'user_suspend' : 'user_reactivate')],
  [/^\/admin\/cities$/, () => 'governorate_create'],
  [/^\/admin\/cities\/[^/]+$/, () => 'governorate_update'],
  [/^\/admin\/events$/, () => 'event_create'],
  [/^\/admin\/events\/\d+$/, (r) => (r.method === 'DELETE' ? 'event_delete' : 'event_update')],
  [/^\/admin\/settings$/, () => 'price_change'],
];

async function run(ctx: Ctx, _params: Record<string, string>, req: Req) {
  const w = new World(ctx);
  // Anything that may change data takes the write lock before it looks at the data.
  const writes = req.method !== 'GET' || (await World.lapsedHires(ctx));
  if (writes) {
    await w.lock();
    await lockRows(ctx, req);
  }
  // Opening a chat marks it read, so that read gets its own copy too.
  await w.everything(writes || /^\/threads\/\d+$/.test(req.path) ? 'write' : 'read');
  const core: CoreCtx = { data: w.data, p: noPlatform, user: ctx.user ? w.data.users.find((u) => u.id === ctx.user!.id) || null : null, now: ctx.now, nowIso: ctx.nowIso, today: ctx.today };
  // Lapsed hires are settled first, exactly as the engine does before every call; that is saved even if the call then fails.
  if (writes) sweep(core);
  const swept = w.dirty;
  if (swept) {
    await settle(ctx, w, null);
    await w.save();
  }
  // The app sends back media links it was given (a guide's photo list): the rules see the stored reference.
  const body = deep(req.body, (s) => mediaRefFromUrl(s, ctx.deps.media) || s);
  let answer: any;
  try {
    answer = runRoute(core, { method: req.method, path: req.path, query: req.query, body, token: req.token });
  } catch (e) {
    // Nothing the failed call did is saved, except the ids it used up (and the lapsed hires settled above).
    if (e instanceof ApiError && ((await w.saveCountersOnly()) || swept)) throw new CommittedError(e);
    throw e;
  }
  const refs = await settle(ctx, w, body?.card);
  await w.save();
  for (const [table, id, providerRef] of refs) await ctx.tx.update(table).set({ provider: ctx.deps.payments.name, providerRef } as any).where(eq(table.id, id));
  // Suspending an account from the Users page signs it out everywhere (as the engine does; a suspension that comes
  // with a report decision leaves the session, and the account can still read but not act).
  const status = /^\/admin\/users\/(\d+)\/status$/.exec(req.path);
  if (status && w.data.users.find((u) => u.id === Number(status[1]))?.status === 'suspended') await ctx.tx.delete(schema.sessions).where(eq(schema.sessions.userId, Number(status[1])));
  for (const [re, name] of AUDIT) {
    if (req.method !== 'GET' && ctx.user?.role === 'admin' && re.test(req.path)) {
      await audit(ctx, name(req), req.path.split('/')[2], req.path.split('/')[3] || '', deep(req.body || {}, (s) => (s.startsWith('data:') ? '[image]' : s)));
      break;
    }
  }
  // Photos uploaded in this call are answered as their stored reference (the kernel turns it into a link).
  if (w.uploads.size) answer = deep(answer, (s) => w.uploads.get(s) || s);
  // ID and residence photos: only the state sees them, through links that stop working after five minutes.
  if (ctx.user?.role === 'admin' && req.path === '/admin/verifications') {
    const refs = new Set<string>();
    deep(answer, (s) => (/^p:id\//.test(s) ? (refs.add(s), s) : s));
    const links = new Map<string, string>();
    for (const ref of refs) links.set(ref, await ctx.deps.media.signedUrl(ref.slice(2), 300, ctx.now));
    answer = deep(answer, (s) => links.get(s) || s);
    if (refs.size) await audit(ctx, 'identity_photos_viewed', 'guides', '', { count: refs.size / 3 });
  }
  return answer;
}

for (const r of ROUTES) if (!hasRoute(r.method, r.pattern) && !r.pattern.startsWith('/auth/')) route(r.method, r.pattern, run);
