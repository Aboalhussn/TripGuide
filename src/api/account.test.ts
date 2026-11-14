// The database-backed API: sign-up and sign-in by phone, passwords, the state account, and parity with the demo engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createApi } from '../core/api';
import { DEMO_ACCOUNTS, DEMO_EMAILS, DEMO_PASSWORD, seed } from '../core/seed';
import type { Platform } from '../core/types';
import { schema } from '../db/client';
import { setupApi } from './testing';

const body = (extra: any = {}) => ({ role: 'tourist', name: 'Pat Doe', email: 'pat' + Math.random() + '@ex.com', password: 'Long#pass1', country: 'Spain', gender: 'f', ...extra });

test('api: demo accounts sign in by phone; /me and /meta match the demo engine field for field', async () => {
  const s = await setupApi();
  // The same seed and the same clock in the old engine.
  const platform: Platform = { now: () => s.clock.now(), hashPassword: (p) => 'h:' + p, verifyPassword: (p, h) => h === 'h:' + p, randomToken: () => 'tok' + Math.random() };
  const engine = createApi(seed(platform), platform);
  const old = (method: string, path: string, b?: any, token?: string | null) => engine({ method, path, body: b ?? null, token: token ?? null, query: {} });
  for (const who of ['tourist', 'guide', 'admin'] as const) {
    const mine = await s.ok('POST', '/auth/login', { phone: DEMO_ACCOUNTS[who], password: DEMO_PASSWORD });
    const theirs = old('POST', '/auth/login', { phone: DEMO_ACCOUNTS[who], password: DEMO_PASSWORD }).body;
    assert.deepEqual(mine.user, theirs.user, `${who}: the sign-in answer is the same`);
    assert.deepEqual(await s.ok('GET', '/me', null, mine.token), old('GET', '/me', null, theirs.token).body, `${who}: /me is the same`);
    assert.notEqual(mine.token, theirs.token);
    assert.ok(mine.token.length >= 40, 'a long random token');
  }
  assert.deepEqual(await s.ok('GET', '/meta'), old('GET', '/meta').body, '/meta is the same');
  await s.close();
});

test('api: unknown paths, wrong methods and missing sign-in answer like the engine', async () => {
  const s = await setupApi();
  assert.deepEqual(await s.call('GET', '/nope'), { status: 404, body: { error: 'not_found', params: {} } });
  assert.deepEqual(await s.call('DELETE', '/meta'), { status: 405, body: { error: 'method_not_allowed', params: {} } });
  assert.deepEqual(await s.call('GET', '/me'), { status: 401, body: { error: 'login_required', params: {} } });
  assert.deepEqual(await s.call('GET', '/me', null, 'not-a-token'), { status: 401, body: { error: 'login_required', params: {} } });
  await s.close();
});

test('api: sign-up needs a valid phone with a country code; numbers are unique and stored in E.164', async () => {
  const s = await setupApi();
  assert.deepEqual((await s.call('POST', '/auth/register', body())).body, { error: 'field_required', params: { field: 'phone' } });
  assert.equal((await s.call('POST', '/auth/register', body({ phone: '07713111325' }))).body.error, 'country_code_required');
  assert.equal((await s.call('POST', '/auth/register', body({ phone: '+964123' }))).body.error, 'phone_invalid');
  assert.equal((await s.call('POST', '/auth/register', body({ phone: '+49 1512 3456789', password: 'weak' }))).body.error, 'password_short');
  const taken = await s.call('POST', '/auth/register', body({ phone: DEMO_ACCOUNTS.guide }));
  assert.deepEqual([taken.status, taken.body.error], [409, 'phone_taken']);
  assert.equal((await s.call('POST', '/auth/register', body({ phone: '+4915123456789', email: DEMO_EMAILS.guide }))).body.error, 'email_taken');
  // Spaces, dashes and Arabic-Indic digits are the same number.
  const reg = await s.ok('POST', '/auth/register', body({ phone: '+٩٦٤ ٧٧١-٢٣٤-٥٦٧٨', role: 'guide' }));
  assert.equal(reg.user.phone, '+9647712345678');
  assert.equal(reg.user.role, 'guide');
  assert.equal(reg.user.guide.verification, 'none');
  assert.equal(reg.user.phoneVerified, false);
  assert.equal((await s.call('POST', '/auth/register', body({ phone: '+964 771 234 5678' }))).body.error, 'phone_taken', 'compared in E.164');
  const [row] = await s.db.select().from(schema.users).where(eq(schema.users.phone, '+9647712345678'));
  assert.match(row.passwordHash, /^\$argon2id\$/, 'the password is stored as an argon2id hash');
  // A non-Iraqi number.
  assert.equal((await s.ok('POST', '/auth/register', body({ phone: '+81 90-1234-5678' }))).user.phone, '+819012345678');
  await s.close();
});

test('api: phone sign-in; tokens are stored hashed, expire, and end on sign-out', async () => {
  const s = await setupApi();
  const reg = await s.ok('POST', '/auth/register', body({ phone: '+447400123456' }));
  assert.equal((await s.call('POST', '/auth/login', { phone: '+44 7400 123456', password: 'wrong' })).status, 401);
  assert.equal((await s.call('POST', '/auth/login', { email: reg.user.email, password: 'Long#pass1' })).body.error, 'login_failed', 'email does not sign in');
  assert.equal((await s.call('POST', '/auth/login', { phone: '07400123456', password: 'Long#pass1' })).body.error, 'login_failed', 'no country code, no match');
  const { token } = await s.ok('POST', '/auth/login', { phone: '+44 7400 123456', password: 'Long#pass1' });
  const sessions = await s.db.select().from(schema.sessions);
  assert.ok(!sessions.some((x) => x.tokenHash === token || x.tokenHash === reg.token), 'the raw token is not in the database');
  assert.equal((await s.ok('GET', '/me', null, token)).phone, '+447400123456');
  // Sign-out ends that token only.
  await s.ok('POST', '/auth/logout', null, token);
  assert.equal((await s.call('GET', '/me', null, token)).status, 401);
  assert.equal((await s.call('GET', '/me', null, reg.token)).status, 200);
  // Unused for longer than the session length: expired. Used in between: it stays alive.
  s.advance(24 * 20);
  assert.equal((await s.call('GET', '/me', null, reg.token)).status, 200);
  s.advance(24 * 20);
  assert.equal((await s.call('GET', '/me', null, reg.token)).status, 200, 'kept alive by use');
  s.advance(24 * 31);
  assert.equal((await s.call('GET', '/me', null, reg.token)).status, 401, 'expired');
  await s.close();
});

test('api: forgot password sends the code by SMS; reset signs in and ends other sessions; change needs the current one', async () => {
  const s = await setupApi();
  const phone = DEMO_ACCOUNTS.tourist;
  const old = await s.login(phone);
  assert.deepEqual(await s.ok('POST', '/auth/forgot', { phone: '+9647809999999' }), { sent: true }); // same answer for unknown numbers
  assert.equal(s.sms.sent.length, 0, 'nothing is sent to a number without an account');
  assert.equal((await s.call('POST', '/auth/forgot', { phone: '0770' })).body.error, 'country_code_required');
  const f = await s.ok('POST', '/auth/forgot', { phone });
  assert.equal(s.sms.sent.length, 1);
  assert.equal(s.sms.sent[0].to, phone);
  assert.equal(s.smsCode(phone), f.demoCode, 'the SMS carries the code (staging also shows it)');
  const wrong = f.demoCode === '111111' ? '222222' : '111111';
  assert.equal((await s.call('POST', '/auth/reset', { phone, code: wrong, password: 'New#Pass123' })).body.error, 'reset_code_invalid');
  assert.equal((await s.db.select().from(schema.passwordResets))[0].tries, 1, 'the wrong try is counted');
  assert.equal((await s.call('POST', '/auth/reset', { phone, code: f.demoCode, password: 'weak' })).body.error, 'password_short');
  const r = await s.ok('POST', '/auth/reset', { phone, code: f.demoCode, password: 'New#Pass123' });
  assert.ok(r.token && r.user.id);
  assert.equal((await s.call('GET', '/me', null, old)).status, 401, 'the old session is signed out');
  assert.equal((await s.call('POST', '/auth/reset', { phone, code: f.demoCode, password: 'Other#Pass1' })).body.error, 'reset_code_invalid'); // used once
  assert.equal((await s.call('POST', '/auth/login', { phone, password: 'Demo@1234' })).status, 401);
  const tk = (await s.ok('POST', '/auth/login', { phone, password: 'New#Pass123' })).token;
  assert.equal((await s.call('POST', '/me/password', { current: 'nope', password: 'Third#Pass1' }, tk)).body.error, 'password_wrong');
  assert.equal((await s.call('POST', '/me/password', { current: 'New#Pass123', password: 'New#Pass123' }, tk)).body.error, 'password_same');
  await s.ok('POST', '/me/password', { current: 'New#Pass123', password: 'Third#Pass1' }, tk);
  assert.equal((await s.call('GET', '/me', null, tk)).status, 200, 'this session stays');
  assert.equal((await s.call('GET', '/me', null, r.token)).status, 401, 'the other session is signed out');
  assert.equal((await s.call('POST', '/auth/login', { phone, password: 'Third#Pass1' })).status, 200);
  // A code is good for 15 minutes and 5 tries; the admin cannot reset by SMS.
  const f2 = await s.ok('POST', '/auth/forgot', { phone });
  s.advance(0.3);
  assert.equal((await s.call('POST', '/auth/reset', { phone, code: f2.demoCode, password: 'Late#Pass12' })).body.error, 'reset_code_invalid', 'expired');
  const f3 = await s.ok('POST', '/auth/forgot', { phone });
  for (let i = 0; i < 5; i++) await s.call('POST', '/auth/reset', { phone, code: f3.demoCode === '111111' ? '222222' : '111111', password: 'Late#Pass12' });
  assert.equal((await s.call('POST', '/auth/reset', { phone, code: f3.demoCode, password: 'Late#Pass12' })).body.error, 'reset_code_invalid', 'locked after 5 wrong tries');
  const before = s.sms.sent.length;
  assert.deepEqual(await s.ok('POST', '/auth/forgot', { phone: DEMO_ACCOUNTS.admin }), { sent: true });
  assert.equal(s.sms.sent.length, before);
  await s.close();
});

test('api: Your info edits the phone with the same rules; verifying it uses an SMS code', async () => {
  const s = await setupApi();
  const tt = await s.login(DEMO_ACCOUNTS.tourist);
  const me = await s.ok('PUT', '/me', { name: 'Hannah Weber', country: 'Austria', email: 'Hannah.New@Example.com' }, tt);
  assert.deepEqual([me.email, me.country, me.phoneVerified], ['hannah.new@example.com', 'Austria', true]);
  assert.equal((await s.call('PUT', '/me', { email: 'not-an-email' }, tt)).body.error, 'email_invalid');
  assert.equal((await s.call('PUT', '/me', { email: DEMO_EMAILS.guide }, tt)).body.error, 'email_taken');
  assert.equal((await s.call('PUT', '/me', { phone: DEMO_ACCOUNTS.guide }, tt)).body.error, 'phone_taken');
  assert.equal((await s.call('PUT', '/me', { phone: '0771 311 1325' }, tt)).body.error, 'country_code_required');
  assert.equal((await s.call('PUT', '/me', { phone: '+964 1 234 5678' }, tt)).body.error, 'phone_invalid');
  // A failed call changes nothing.
  assert.equal((await s.call('PUT', '/me', { name: 'Changed Name', email: 'bad' }, tt)).status, 400);
  assert.equal((await s.ok('GET', '/me', null, tt)).name, 'Hannah Weber');
  const changed = await s.ok('PUT', '/me', { phone: '+49 1512 3456789' }, tt);
  assert.deepEqual([changed.phone, changed.phoneVerified], ['+4915123456789', false], 'a new number is not verified yet');
  assert.equal((await s.call('POST', '/me/verify-phone', { code: '000000' }, tt)).body.error, 'code_wrong');
  await s.ok('POST', '/me/phone-code', null, tt);
  assert.equal((await s.ok('POST', '/me/verify-phone', { code: s.smsCode('+4915123456789') }, tt)).phoneVerified, true);
  // The new number signs in; the old one no longer does.
  assert.equal((await s.call('POST', '/auth/login', { phone: DEMO_ACCOUNTS.tourist, password: DEMO_PASSWORD })).status, 401);
  assert.equal((await s.call('POST', '/auth/login', { phone: '+4915123456789', password: DEMO_PASSWORD })).status, 200);
  // Profile photo: kept in media storage, answered as a link, removable.
  const img = 'data:image/png;base64,' + Buffer.from('not really a picture').toString('base64');
  const withPhoto = await s.ok('PUT', '/me', { avatar: img }, tt);
  assert.match(withPhoto.avatar, /^http:\/\/api\.test\/media\/avatar\/[0-9a-f]{32}\.png$/);
  assert.equal((await s.call('PUT', '/me', { avatar: 'data:text/html;base64,AAAA' }, tt)).body.error, 'photo_invalid');
  assert.equal((await s.ok('PUT', '/me', { avatar: null }, tt)).avatar, null);
  await s.close();
});

test('api: production hides the demo helpers; the state account is created from ADMIN_PASSWORD and stored hashed', async () => {
  const secret = 'State#' + Math.random().toString(36).slice(2) + 'A1'; // made up for this test run only
  const s = await setupApi({ demo: false, env: { ADMIN_PASSWORD: secret, RATE_LIMIT: 'on' } });
  const users = await s.db.select().from(schema.users);
  assert.equal(users.length, 1, 'production starts with the state account only');
  assert.deepEqual([users[0].role, users[0].phone, users[0].phoneVerified], ['admin', '+9647713111325', true]);
  assert.match(users[0].passwordHash, /^\$argon2id\$/);
  assert.ok(!JSON.stringify(users).includes(secret), 'the password itself is nowhere in the database');
  assert.equal((await s.db.select().from(schema.cities)).length, 8, 'the governorates are there');
  assert.equal((await s.db.select().from(schema.tripRequests)).length, 0);
  // Sign in as the state: Iraq +964, 07713111325.
  const me = await s.ok('POST', '/auth/login', { phone: '+9647713111325', password: secret });
  assert.equal(me.user.role, 'admin');
  const meta = await s.ok('GET', '/meta');
  assert.equal(meta.demoLogins, null, 'no demo accounts without demo data');
  // Wrong passwords are limited per phone.
  for (let i = 0; i < 10; i++) assert.equal((await s.call('POST', '/auth/login', { phone: '+9647713111325', password: 'wrong' })).status, 401);
  const blocked = await s.call('POST', '/auth/login', { phone: '+9647713111325', password: secret });
  assert.deepEqual([blocked.status, blocked.body.error], [429, 'too_many_attempts']);
  s.advance(0.3);
  assert.equal((await s.call('POST', '/auth/login', { phone: '+9647713111325', password: secret })).status, 200, 'the limit lifts after 15 minutes');
  await s.close();
});

test('api: in production the reset code is never returned and no demo code verifies a phone', async () => {
  const s = await setupApi({ env: { APP_ENV: 'production', DATABASE_URL: 'memory', TOKEN_SECRET: 'x'.repeat(40), ADMIN_PASSWORD: 'Made#Up' + Math.random().toString(36).slice(2) + '9' } }).catch((e) => e);
  assert.match(String(s), /DATABASE_URL must point at PostgreSQL in production/, 'production refuses the embedded database');
  // Same switches, checked through the config a production start would use.
  const t = await setupApi();
  (t.cfg as any).demoHelpers = false;
  const f = await t.ok('POST', '/auth/forgot', { phone: DEMO_ACCOUNTS.tourist });
  assert.deepEqual(f, { sent: true }, 'no demoCode');
  assert.ok(t.smsCode(DEMO_ACCOUNTS.tourist), 'the code went by SMS');
  const tt = await t.login(DEMO_ACCOUNTS.guide);
  await t.ok('PUT', '/me', { phone: '+9647812345678' }, tt);
  assert.equal((await t.call('POST', '/me/verify-phone', { code: '123456' }, tt)).body.error, 'code_wrong', 'the demo code does not work');
  const meta = await t.ok('GET', '/meta');
  assert.deepEqual([meta.demoLogins, meta.demoPhoneCode], [null, null]);
  await t.close();
});
