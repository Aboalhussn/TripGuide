// End-to-end tests: a real server with fresh demo data, driven through Chromium at phone size.
// Run: npm run build && npm run e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const PORT = 3200 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}/`;
const DATA = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-e2e-')), 'db.json');
const SHOTS = process.env.SHOTS || '';
let server: ChildProcess;
let browser: Browser;
const pageErrors: string[] = [];

before(async () => {
  server = spawn('node', ['dist/server.mjs'], { env: { ...process.env, PORT: String(PORT), DATA_FILE: DATA }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + 'api/meta')).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
  assert.deepEqual(pageErrors, [], 'no JavaScript errors in the browser');
});

async function open(lang: 'en' | 'ar' = 'en', width = 390): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE);
  await page.evaluate((l) => localStorage.setItem('tg.lang', l), lang);
  await page.reload();
  return page;
}

async function login(page: Page, email: string) {
  await page.goto(BASE + '#/login');
  await page.locator('form input[type=email]').fill(email);
  await page.locator('form input[type=password]').fill('Demo@1234');
  await page.locator('form button').first().click();
  await page.waitForURL((u) => !u.hash.includes('login'));
}

const go = (page: Page, hash: string) => page.goto(BASE + '#' + hash);
const shot = async (page: Page, name: string) => SHOTS && page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
async function noSideScroll(page: Page, where: string) {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= w + 1, `${where}: page is ${sw}px wide on a ${w}px screen`);
}

test('tourist posts a trip, a guide offers, the tourist chats, hires, pays day by day and both review', async () => {
  const tourist = await open();
  await login(tourist, 'james@tripguide.demo');
  await go(tourist, '/post');
  await tourist.getByLabel('Title').fill('Weekend in Samarra and Baghdad');
  await tourist.getByRole('button', { name: 'Samarra', exact: true }).click();
  await tourist.getByRole('button', { name: 'Baghdad', exact: true }).click();
  await tourist.getByRole('button', { name: '+ Malwiya Minaret' }).click();
  await tourist.getByRole('button', { name: 'Photography' }).click();
  await tourist.getByLabel('From (USD)').fill('80');
  await tourist.getByLabel('To (USD)').fill('150');
  await shot(tourist, 'e2e-post');
  await tourist.getByRole('button', { name: 'Post request' }).click();
  await tourist.getByRole('heading', { name: 'Weekend in Samarra and Baghdad' }).waitFor();
  const requestUrl = tourist.url();
  const requestId = requestUrl.split('/requests/')[1];

  // Ahmed covers Samarra and Baghdad, so the request is in his matching feed.
  const guide = await open();
  await login(guide, 'ahmed@tripguide.demo');
  await go(guide, '/requests');
  await guide.getByRole('link', { name: 'Weekend in Samarra and Baghdad' }).click();
  await guide.getByRole('heading', { name: 'Send an offer' }).waitFor();
  await guide.getByLabel('Total price in US dollars').fill('120');
  const titles = guide.getByLabel('Title');
  const dayTitles = ['Malwiya at golden hour', 'Old Baghdad photo walk', 'Al-Mutanabbi on Friday'];
  for (let i = 0; i < (await titles.count()); i++) await titles.nth(i).fill(dayTitles[i]);
  await guide.getByLabel(/Message to/).fill('I lead photo trips to Samarra every month and know the best light.');
  await guide.getByRole('button', { name: 'Send offer' }).click();
  await guide.getByRole('heading', { name: 'Your offer' }).waitFor();

  // The tourist sees the offer, shortlists it, chats and hires.
  await tourist.reload();
  await tourist.getByText('I lead photo trips to Samarra').waitFor();
  await tourist.getByRole('button', { name: 'Add to shortlist' }).click();
  await tourist.getByRole('button', { name: 'Remove from shortlist' }).waitFor();
  await tourist.getByRole('button', { name: 'Chat' }).click();
  await tourist.getByRole('log', { name: 'Conversation' }).waitFor();
  await tourist.getByPlaceholder('Write a message').fill('Can we start at 6 am for the light?');
  await tourist.getByRole('button', { name: 'Send' }).click();
  await tourist.getByText('Can we start at 6 am for the light?').waitFor();

  await go(guide, '/messages');
  await guide.getByRole('link', { name: /James C\./ }).click();
  await guide.getByText('Can we start at 6 am for the light?').waitFor();
  await guide.getByPlaceholder('Write a message').fill('Yes, 6 am works.');
  await guide.keyboard.press('Enter');
  await guide.getByText('Yes, 6 am works.').waitFor();

  await tourist.getByText('Yes, 6 am works.').waitFor({ timeout: 8000 });
  await tourist.goto(requestUrl);
  await tourist.getByRole('button', { name: 'Hire for $120' }).click();
  await tourist.getByLabel('Card number').fill('4242 4242 4242 4242');
  await tourist.getByLabel(/I understand the money is held/).check();
  await tourist.getByRole('button', { name: 'Pay $120 into holding' }).click();
  await tourist.getByText(/has 48 hours to confirm/).waitFor();
  await shot(tourist, 'e2e-booking-awaiting');

  // Guide confirms from the dashboard.
  await go(guide, '/');
  await guide.getByText("You've been hired").first().waitFor();
  await guide.getByRole('link', { name: /Weekend in Samarra and Baghdad/ }).first().click();
  await guide.getByRole('button', { name: 'Confirm booking' }).click();
  await guide.getByText('Booking confirmed').waitFor();

  // Tourist releases both days; the booking completes.
  await tourist.reload();
  // $120 over 3 days is $40 a day.
  for (let i = 0; i < 3; i++) {
    await tourist.getByRole('button', { name: /Release \$40 to Ahmed/ }).first().click();
    await tourist.getByRole('dialog').getByRole('button', { name: /Release \$40 to Ahmed/ }).click();
    await tourist.getByRole('dialog').waitFor({ state: 'detached' });
    await tourist.getByText('$40 released').first().waitFor();
  }
  await tourist.getByText('Tour complete. Thank you!').waitFor();

  // Reviews in both directions, hidden until both are in.
  await tourist.getByRole('button', { name: 'Write a review' }).click();
  const dialog = tourist.getByRole('dialog');
  for (const label of ['Knowledge', 'Communication', 'On time', 'Value for money']) await dialog.getByRole('radiogroup', { name: label }).getByRole('radio', { name: '5 stars' }).click();
  await dialog.getByLabel('Your review').fill('Perfect light at the Malwiya, great company.');
  await dialog.getByRole('button', { name: 'Post review' }).click();
  await tourist.getByText('Your review').waitFor();

  await guide.reload();
  await guide.getByRole('button', { name: 'Write a review' }).click();
  const gd = guide.getByRole('dialog');
  for (const label of ['Communication', 'On time', 'Respectful']) await gd.getByRole('radiogroup', { name: label }).getByRole('radio', { name: '5 stars' }).click();
  await gd.getByLabel('Your review').fill('Punctual and kind. Welcome back.');
  await gd.getByRole('button', { name: 'Post review' }).click();
  await guide.getByText('Perfect light at the Malwiya, great company.').waitFor();

  await go(guide, '/wallet');
  await guide.getByText('Paid to you, day 1').first().waitFor();
  await noSideScroll(guide, 'guide wallet');
  assert.ok(requestId);
});

test('a tourist hires a guide directly from the profile, and only that guide sees it', async () => {
  const tourist = await open();
  await login(tourist, 'aiko@tripguide.demo');
  await go(tourist, '/guides?city=basra');
  await tourist.getByRole('link', { name: /Layla Jasim/ }).click();
  await tourist.getByRole('link', { name: 'Hire Layla' }).click();
  await tourist.getByRole('heading', { name: 'Hire Layla' }).waitFor();
  await tourist.getByLabel('Title').fill('Marshes at sunrise');
  await tourist.getByRole('button', { name: 'Use this' }).click();
  await tourist.getByRole('button', { name: 'Send to Layla' }).click();
  await tourist.getByText('Sent to Layla').first().waitFor();

  const layla = await open();
  await login(layla, 'layla@tripguide.demo');
  await layla.getByText('Marshes at sunrise').first().waitFor();
  await layla.getByText('Sent to you only').first().waitFor();

  const other = await open();
  await login(other, 'ali@tripguide.demo');
  await go(other, '/requests?matching=0');
  await other.getByRole('heading', { name: 'Trip requests' }).waitFor();
  assert.equal(await other.getByText('Marshes at sunrise').count(), 0);
});

test('a new guide signs up, fills the profile, asks for verification and the admin approves', async () => {
  const g = await open();
  await go(g, '/register?role=guide');
  await g.getByLabel('Full name').fill('Karim Nasser');
  await g.getByLabel('Email').fill('karim@example.com');
  await g.getByLabel('Password').fill('a-long-password');
  await g.getByLabel('Gender').selectOption('m');
  await g.getByRole('button', { name: 'Create account' }).click();
  await g.getByRole('heading', { name: 'Your guide profile' }).waitFor();
  await g.getByLabel('Headline', { exact: true }).fill('Kufa and Najaf by bicycle');
  await g.getByLabel('About you', { exact: true }).fill('I run small cycling tours between Kufa and Najaf, with tea stops at the river.');
  await g.getByLabel('Price per day (USD)').fill('35');
  await g.getByRole('button', { name: 'Najaf', exact: true }).click();
  await g.getByRole('button', { name: 'Great Mosque of Kufa' }).click();
  await g.getByLabel('Add a language').selectOption('en');
  await g.getByRole('button', { name: 'Save profile' }).click();
  await g.getByText('Saved').first().waitFor();
  await g.locator('#verify input[type=file]').setInputFiles({ name: 'id-card.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') });
  await g.getByRole('button', { name: 'Send for review' }).click();
  await g.getByText('Our team is checking your documents').waitFor();

  const admin = await open();
  await login(admin, 'admin@tripguide.demo');
  await go(admin, '/admin/verify');
  const card = admin.locator('article', { hasText: 'Karim Nasser' });
  await card.getByText('id-card.jpg').waitFor();
  await card.getByRole('button', { name: 'Verify guide' }).click();
  await admin.getByText('Karim Nasser is verified').waitFor();

  await go(g, '/notifications');
  await g.getByText("You're verified").waitFor();
  await go(g, '/guides?q=Karim');
  await g.getByRole('link', { name: /Karim Nasser/ }).getByRole('img', { name: 'Verified' }).waitFor();
});

test('a report goes to the admin, who refunds the tourist', async () => {
  const marco = await open();
  await login(marco, 'marco@tripguide.demo');
  await go(marco, '/bookings');
  await marco.getByRole('link', { name: /Babylon and Kish in 2 days/ }).click();
  await marco.getByRole('button', { name: 'Report a problem' }).click();
  await marco.getByLabel('Asked to pay outside the app').check();
  await marco.getByLabel('What happened, in your words').fill('The guide asked me to send cash by transfer instead.');
  await marco.getByRole('button', { name: 'Send report' }).click();
  await marco.getByText('Report open: Asked to pay outside the app.').waitFor();

  const admin = await open();
  await login(admin, 'admin@tripguide.demo');
  await go(admin, '/admin/reports');
  const card = admin.locator('article', { hasText: 'cash by transfer' });
  await card.getByRole('button', { name: 'Refund tourist' }).click();
  await admin.getByText('Report resolved').waitFor();

  await marco.reload();
  await marco.getByText('Refunded $130').waitFor();
  await go(marco, '/notifications');
  await marco.getByText(/refunded to the tourist/).waitFor();
});

test('a guide withdraws an offer after confirming in the page dialog', async () => {
  const z = await open();
  await login(z, 'ahmed@tripguide.demo');
  await go(z, '/offers');
  await z.getByRole('link', { name: /3 days of ancient Babylon and Baghdad/ }).click();
  await z.getByRole('button', { name: 'Withdraw' }).click();
  const dlg = z.getByRole('alertdialog');
  await dlg.getByText('Withdraw your offer?').waitFor();
  await dlg.getByRole('button', { name: 'Withdraw' }).click();
  await z.getByText('Offer withdrawn').waitFor();
  await z.getByRole('heading', { name: 'Send an offer' }).waitFor();
});

test('on tour: the tourist releases the day the guide asked for', async () => {
  const hannah = await open();
  await login(hannah, 'tourist@tripguide.demo');
  await hannah.getByText('A guide asked you to release a payment').click();
  await hannah.getByText('Omar asked you to release it').waitFor();
  await hannah.getByRole('button', { name: /Release \$45 to Omar/ }).first().click();
  await hannah.getByRole('dialog').getByRole('button', { name: /Release \$45 to Omar/ }).click();
  await hannah.getByText('Tour complete. Thank you!').waitFor();
});

test('every main screen works in Arabic, right to left, on a phone and on a desktop', async () => {
  const screens: Record<string, string[]> = {
    'tourist@tripguide.demo': ['/', '/guides', '/guides/2', '/post', '/requests', '/bookings', '/messages', '/notifications', '/wallet', '/profile'],
    'guide@tripguide.demo': ['/', '/requests', '/offers', '/bookings', '/profile/guide', '/wallet'],
    'admin@tripguide.demo': ['/', '/admin/verify', '/admin/reports', '/admin/users'],
  };
  for (const width of [390, 1280]) {
    for (const [email, hashes] of Object.entries(screens)) {
      const p = await open('ar', width);
      await login(p, email);
      assert.equal(await p.evaluate(() => document.documentElement.dir), 'rtl');
      for (const h of hashes) {
        await go(p, h);
        await p.waitForTimeout(250);
        await noSideScroll(p, `${email} ${h} at ${width}px`);
        const missing = await p.evaluate(() => (document.body.innerText.match(/\b[a-z]+\.[a-z_]+\.?[a-z_]*\b/g) || []).filter((x) => /^(nav|common|guide|guides|request|offer|booking|dash|home|err|field|admin|wallet|post|auth|account|editor|verify|notif|messages)\./.test(x)));
        assert.deepEqual(missing, [], `untranslated keys on ${h}`);
      }
      await p.context().close();
    }
  }
  const p = await open('ar');
  await p.getByRole('heading', { name: 'انشر رحلتك، ودَع المرشدين العراقيين يرسلون عروضهم.' }).waitFor();
  await shot(p, 'e2e-home-ar');
});
