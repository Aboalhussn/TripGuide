// Screenshot comparison: the demo as it is on `main` next to the new app on the database API.
// The main screens of the three roles, in English and Arabic, at 390x844, compared pixel by pixel.
// Only sign-in, sign-up and "Your info" may differ (the phone field).
//   npm run parity:screens        (needs: npm run build, and Chromium: CHROMIUM_PATH=...)
// Pictures and a report are written to .parity/screens.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { seed } from '../src/core/seed';

const OUT = path.join(process.cwd(), '.parity', 'screens');
const OLD_PORT = 4100 + Math.floor(Math.random() * 300);
const NEW_PORT = OLD_PORT + 400;
const PHONES = new Map(seed({ now: () => new Date(), hashPassword: () => '', verifyPassword: () => false, randomToken: () => '' }).users.map((u) => [u.email, u.phone]));

// Signed-out screens, then each role's main screens (the same list the browser tests walk through).
const GUEST = ['/login', '/register', '/forgot', '/'];
const SCREENS: Record<string, string[]> = {
  'tourist@tripguide.demo': ['/', '/guides', '/guides/2', '/post', '/requests', '/bookings', '/messages', '/notifications', '/wallet', '/profile', '/profile/info', '/profile/settings', '/profile/trips', '/passport', '/events'],
  'guide@tripguide.demo': ['/', '/requests', '/offers', '/bookings', '/messages', '/notifications', '/profile', '/profile/guide', '/profile/info', '/wallet'],
  'admin@tripguide.demo': ['/', '/admin/verify', '/admin/reports', '/admin/users', '/admin/payouts', '/admin/pricing', '/admin/stats', '/admin/cities', '/admin/events', '/notifications', '/profile', '/profile/info'],
};
// The only screens allowed to look different: they carry the phone field.
const MAY_DIFFER = new Set(['/login', '/register', '/forgot', '/profile/info']);

async function waitFor(base: string) {
  for (let i = 0; i < 300; i++) {
    try {
      if ((await fetch(base + 'api/meta')).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start: ' + base);
}

async function signIn(page: Page, base: string, email: string, side: 'old' | 'new') {
  await page.goto(base + '#/login');
  if (side === 'old') await page.locator('form input[type=email]').fill(email);
  else await page.locator('form input[type=tel]').fill(PHONES.get(email)!);
  await page.locator('form input[type=password]').fill('Demo@1234');
  await page.locator('form button.btn.lg').click();
  await page.waitForFunction(() => !!localStorage.getItem('tg.token'));
}

async function capture(browser: Browser, base: string, side: 'old' | 'new', lang: 'en' | 'ar', email: string | null, screens: string[]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'Asia/Baghdad' });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate((l) => {
    localStorage.setItem('tg.lang', l);
    sessionStorage.setItem('tg.splash.shown', '1');
  }, lang);
  await page.reload();
  if (email) await signIn(page, base, email, side);
  const shots: Record<string, string> = {};
  for (const hash of screens) {
    await page.goto(base + '#' + hash);
    await page.waitForLoadState('networkidle');
    // Stillness: no animations, no caret, no "x minutes ago" drift between the two runs.
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}' });
    await page.waitForTimeout(350);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    const name = `${lang}-${email ? email.split('@')[0] : 'guest'}-${hash.replace(/\W+/g, '_') || 'home'}`;
    const file = path.join(OUT, side, name + '.png');
    await page.screenshot({ path: file, fullPage: true });
    shots[hash] = file;
  }
  await ctx.close();
  return shots;
}

function diff(a: string, b: string, out: string): { same: boolean; pixels: number; note: string } {
  const A = PNG.sync.read(fs.readFileSync(a));
  const B = PNG.sync.read(fs.readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return { same: false, pixels: -1, note: `size ${A.width}x${A.height} vs ${B.width}x${B.height}` };
  const D = new PNG({ width: A.width, height: A.height });
  const pixels = pixelmatch(A.data, B.data, D.data, A.width, A.height, { threshold: 0.1 });
  if (pixels) fs.writeFileSync(out, PNG.sync.write(D));
  return { same: pixels === 0, pixels, note: pixels ? `${pixels} pixels` : '' };
}

let oldServer: ChildProcess | undefined;
let newServer: ChildProcess | undefined;
let browser: Browser | undefined;
try {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const d of ['old', 'new', 'diff']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const baseline = path.join(process.cwd(), '.baseline', 'main');
  if (!fs.existsSync(path.join(baseline, 'dist', 'server.mjs'))) throw new Error('Run `node scripts/baseline.mjs` first.');
  if (!fs.existsSync(path.join(process.cwd(), 'dist', 'api.mjs'))) throw new Error('Run `npm run build` first.');
  const data = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-parity-')), 'db.json');
  // Both start at the same moment, so the demo data (which is dated from "now") is the same on both.
  oldServer = spawn(process.execPath, ['dist/server.mjs'], { cwd: baseline, env: { ...process.env, AI_PROVIDER: 'mock', PORT: String(OLD_PORT), DATA_FILE: data }, stdio: 'ignore' });
  newServer = spawn(process.execPath, ['dist/api.mjs'], { env: { ...process.env, AI_PROVIDER: 'mock', APP_ENV: 'test', SEED_DEMO: '1', DATABASE_URL: 'memory', MEDIA_DRIVER: 'memory', PUBLIC_URL: '', PORT: String(NEW_PORT) }, stdio: 'ignore' });
  const oldBase = `http://localhost:${OLD_PORT}/`;
  const newBase = `http://localhost:${NEW_PORT}/`;
  await Promise.all([waitFor(oldBase), waitFor(newBase)]);
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

  const rows: { screen: string; lang: string; who: string; result: string; note: string }[] = [];
  let unexpected = 0;
  for (const lang of ['en', 'ar'] as const) {
    for (const [email, screens] of [[null, GUEST] as const, ...Object.entries(SCREENS)] as [string | null, string[]][]) {
      const [was, now] = await Promise.all([capture(browser, oldBase, 'old', lang, email, screens), capture(browser, newBase, 'new', lang, email, screens)]);
      for (const hash of screens) {
        const d = diff(was[hash], now[hash], path.join(OUT, 'diff', path.basename(now[hash])));
        const allowed = MAY_DIFFER.has(hash);
        const result = d.same ? 'identical' : allowed ? 'differs (allowed: phone field)' : 'DIFFERS';
        if (!d.same && !allowed) unexpected++;
        rows.push({ screen: hash, lang, who: email ? email.split('@')[0] : 'guest', result, note: d.note });
      }
    }
  }
  const identical = rows.filter((r) => r.result === 'identical').length;
  const report = [
    '# Screenshot comparison: main vs the new app (390x844)',
    '',
    `${rows.length} screens compared: ${identical} identical, ${rows.filter((r) => r.result.startsWith('differs')).length} differ where allowed, ${unexpected} differ where they must not.`,
    '',
    '| Language | Who | Screen | Result | Note |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.lang} | ${r.who} | \`${r.screen}\` | ${r.result} | ${r.note} |`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'REPORT.md'), report);
  console.log(report);
  process.exitCode = unexpected ? 1 : 0;
} finally {
  await browser?.close();
  oldServer?.kill();
  newServer?.kill();
}
