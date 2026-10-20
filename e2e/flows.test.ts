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
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
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
  await page.evaluate((l) => {
    localStorage.setItem('tg.lang', l);
    sessionStorage.setItem('tg.splash.shown', '1'); // skip the 3-second launch screen in tests
  }, lang);
  await page.reload();
  return page;
}

async function login(page: Page, email: string) {
  await page.goto(BASE + '#/login');
  await page.locator('form input[type=email]').fill(email);
  await page.locator('form input[type=password]').fill('Demo@1234');
  await page.locator('form button.btn.lg').click();
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
  // Step 1 of 4: name and cities. Next refuses to move on while the step has a problem.
  await tourist.getByRole('heading', { name: 'Where do you want to go?' }).waitFor();
  await tourist.getByRole('button', { name: 'Next' }).click();
  await tourist.getByText('Give your trip a title.').waitFor();
  await tourist.getByLabel('Title').fill('Weekend in Samarra and Baghdad');
  await tourist.getByRole('button', { name: 'Samarra', exact: true }).click();
  await tourist.getByRole('button', { name: 'Baghdad', exact: true }).click();
  await tourist.getByRole('button', { name: '+ Malwiya Minaret' }).click();
  await shot(tourist, 'e2e-post-1');
  await tourist.getByRole('button', { name: 'Next' }).click();
  // Step 2: people and dates (the brand date picker).
  await tourist.getByRole('heading', { name: "Who's coming, and when?" }).waitFor();
  await tourist.locator('#pf-dates').click();
  await tourist.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await tourist.getByRole('button', { name: 'Next' }).click();
  // Step 3: guide language, the tourist's own day plan, interests.
  await tourist.getByRole('heading', { name: 'Your guide and your plan' }).waitFor();
  await tourist.getByLabel('Add my own day plan').check();
  await tourist.getByLabel('Day 1', { exact: true }).fill('Malwiya at sunrise');
  await tourist.getByRole('button', { name: 'Photography' }).click();
  await tourist.getByRole('button', { name: 'Next' }).click();
  // Step 4: budget, a summary, then post. Back keeps what was typed.
  await tourist.getByRole('heading', { name: 'Set your budget' }).waitFor();
  await tourist.getByRole('button', { name: 'Back', exact: true }).last().click();
  assert.equal(await tourist.getByLabel('Day 1', { exact: true }).inputValue(), 'Malwiya at sunrise');
  await tourist.getByRole('button', { name: 'Next' }).click();
  await tourist.getByLabel('From (USD)').fill('80');
  await tourist.getByLabel('To (USD)').fill('150');
  await tourist.getByText('Your day plan is included').waitFor();
  await shot(tourist, 'e2e-post');
  await tourist.getByRole('button', { name: 'Post request' }).click();
  await tourist.getByRole('heading', { name: 'Weekend in Samarra and Baghdad' }).waitFor();
  await tourist.getByRole('region', { name: "The tourist's day plan" }).getByText('Malwiya at sunrise').waitFor();
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
  // Card is the default payment method; the card form runs in test mode.
  await tourist.getByLabel('Card number').fill('4242 4242 4242 4242');
  await tourist.getByLabel('Name on card').fill('Test Tourist');
  await tourist.getByLabel('Expiry (MM/YY)').fill('1230');
  await tourist.getByLabel('CVC').fill('123');
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
  await tourist.getByText('Hire Layla').first().waitFor();
  await tourist.getByLabel('Title').fill('Marshes at sunrise');
  for (let i = 0; i < 3; i++) await tourist.getByRole('button', { name: 'Next' }).click();
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
  // The password must have a capital, a small letter, a number and a symbol.
  await g.getByLabel('Password', { exact: true }).fill('a-long-password');
  await g.getByLabel('Gender').selectOption('m');
  await g.getByRole('button', { name: 'Create account' }).click();
  await g.getByText('Your password needs a capital letter, a small letter, a number and a symbol.').waitFor();
  await g.getByLabel('Password', { exact: true }).fill('Kufa#Ride24');
  assert.equal(await g.locator('.pw-rules li.ok').count(), 5);
  await g.getByRole('button', { name: 'Create account' }).click();
  // Three set-up steps, each with a photo banner and a Next button.
  await g.getByRole('heading', { name: 'About you' }).waitFor();
  await g.getByRole('button', { name: 'Next' }).click();
  await g.getByText('Write a headline of at least 5 characters.').waitFor();
  await g.getByLabel('Headline', { exact: true }).fill('Kufa and Najaf by bicycle');
  await g.getByLabel('About you', { exact: true }).fill('I run small cycling tours between Kufa and Najaf, with tea stops at the river.');
  await g.getByRole('button', { name: 'Next' }).click();
  await g.getByRole('heading', { name: 'Where you guide' }).waitFor();
  await g.getByRole('button', { name: 'Najaf', exact: true }).click();
  await g.getByRole('button', { name: 'Next' }).click();
  await g.getByRole('heading', { name: 'Languages and price' }).waitFor();
  await g.getByLabel('Add a language').selectOption('en');
  await g.getByLabel('Price per day (USD)').fill('35');
  await shot(g, 'e2e-guide-setup');
  await g.getByRole('button', { name: 'Finish' }).click();
  // Home shows the verify alert, which opens the verification page.
  await g.getByText('Your profile is ready').first().waitFor();
  await g.getByRole('link', { name: /Verify your account/ }).click();
  await g.waitForFunction(() => location.hash === '#/verify');
  await g.getByRole('heading', { name: 'Verify your account' }).waitFor();
  await g.locator('main input[type=file]').setInputFiles({ name: 'id-card.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') });
  await g.getByRole('button', { name: 'Send for review' }).click();
  await g.locator('.note.warn').getByText('Verification is done within 24 hours.').waitFor();
  await go(g, '/');
  await g.locator('.note.warn').getByText('Sent for review').waitFor();
  // "Edit profile" opens the same steps, filled in; changes are optional.
  await go(g, '/profile');
  await g.getByRole('link', { name: 'Edit profile' }).click();
  await g.getByText('Edit your guide profile').waitFor();
  assert.equal(await g.getByLabel('Headline', { exact: true }).inputValue(), 'Kufa and Najaf by bicycle');
  await g.getByRole('button', { name: 'Next' }).click();
  await g.getByRole('button', { name: 'Great Mosque of Kufa' }).click();
  await g.getByRole('button', { name: 'Next' }).click();
  assert.equal(await g.getByLabel('Price per day (USD)').inputValue(), '35');
  await g.getByRole('button', { name: 'Save changes' }).click();
  await g.getByText('Saved').first().waitFor();
  await g.waitForFunction(() => location.hash === '#/profile');

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
  await card.getByText('Refund tourist').click();
  await card.getByRole('button', { name: 'Resolve report' }).click();
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
  // The request is pinned in notifications, not on the home screen.
  assert.equal(await hannah.getByText('A guide asked you to release a payment').count(), 0);
  await go(hannah, '/notifications');
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
  await go(p, '/'); // a fresh launch opens on sign-in; the guest home is one step away
  await p.getByRole('heading', { name: 'أفضل المرشدين' }).waitFor();
  await shot(p, 'e2e-home-ar');
});

test('cash: a subscribed guide takes cash, the tourist books paying cash', async () => {
  // Zainab subscribes (the demo seeds some guides already subscribed; renewing works the same way).
  const z = await open();
  await login(z, 'guide@tripguide.demo');
  await go(z, '/profile');
  await z.getByRole('heading', { name: 'Profile' }).waitFor();
  await z.getByText('Cash payments').first().waitFor();
  await z.getByRole('button', { name: /^(Subscribe|Renew) for/ }).click();
  await z.getByRole('button', { name: 'Use test card' }).click();
  await z.getByRole('button', { name: /^Pay \$/ }).click();
  await z.getByText('Subscribed. Tourists can now pay you in cash.').waitFor();
  await noSideScroll(z, 'guide account');

  const t = await open();
  await login(t, 'tourist@tripguide.demo');
  await go(t, '/requests/74');
  const offer = t.locator('article', { hasText: 'Zainab' }).first();
  await offer.getByRole('button', { name: /^Hire/ }).click();
  await t.getByText('Cash', { exact: true }).click();
  await t.getByText('How cash works').waitFor();
  await t.getByLabel('I will pay the guide in cash at the end of each day.').check();
  await t.getByRole('button', { name: 'Book and pay cash' }).click();
  await t.getByText('Cash to the guide').waitFor();
  await noSideScroll(t, 'cash booking');
});

test('a guide opens "Send offer" from the dashboard and gets the offer form (not an error page)', async () => {
  const g = await open();
  await login(g, 'ali@tripguide.demo');
  await go(g, '/requests');
  await g.getByRole('link', { name: 'Send offer' }).first().click();
  await g.getByRole('heading', { name: 'Send an offer' }).waitFor();
  assert.ok(g.url().includes('#offer'));
  await g.getByRole('button', { name: 'Send offer' }).click();
  await g.getByText('Give this day a short title.').first().waitFor();
});

test('post page: problems show while typing, before pressing the button', async () => {
  const t = await open();
  await login(t, 'tourist@tripguide.demo');
  await go(t, '/post');
  await t.getByLabel('Title').fill('Bab');
  await t.getByLabel('Title').blur();
  await t.getByText('Add 2 more characters.').waitFor();
  await t.getByLabel('Title').fill('Babylon weekend');
  await t.getByRole('button', { name: 'Basra', exact: true }).click();
  await t.getByRole('button', { name: 'Next' }).click();
  await t.getByRole('button', { name: 'Next' }).click();
  await t.getByRole('button', { name: /More languages/ }).click();
  await t.getByRole('button', { name: 'Kurdish', exact: true }).click();
  await t.getByRole('button', { name: 'Next' }).click();
  await t.locator('#pf-budgetMin').fill('200');
  await t.locator('#pf-budgetMax').fill('90');
  await t.getByText("The budget's upper value must be at least the lower one.").waitFor();
  await noSideScroll(t, 'post page');
});

test('launch: the loading screen shows, then sign-in, which leads to create account and guest', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('tg.lang', 'en'));
  await page.reload();
  await page.locator('.splash').waitFor();
  await page.locator('.splash').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForURL((u) => u.hash.startsWith('#/login'));
  await page.locator('.login-brand').waitFor();
  await page.getByRole('button', { name: 'Login' }).waitFor();
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await page.getByRole('heading', { name: 'Top guides' }).waitFor();
});


test('home has no search bar or shortcut row; signing out asks first; admin opens a user profile', async () => {
  const p = await open();
  await go(p, '/');
  await p.getByRole('heading', { name: 'Top guides' }).waitFor();
  assert.equal(await p.locator('.search-pill, .quick-actions').count(), 0);
  assert.equal(await p.getByRole('heading', { name: 'Featured guides' }).count(), 0);
  await login(p, 'tourist@tripguide.demo');
  await go(p, '/profile');
  await p.getByRole('button', { name: 'Sign out' }).click();
  const confirm = p.getByRole('alertdialog');
  await confirm.getByText('Sign out of your account?').waitFor();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  assert.ok(await p.evaluate(() => !!localStorage.getItem('tg.token')));
  await p.getByRole('button', { name: 'Sign out' }).click();
  await p.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
  await p.waitForFunction(() => !localStorage.getItem('tg.token'));
  await p.waitForFunction(() => location.hash === '#/login');
  await p.locator('.login-brand').waitFor();
  await p.context().close();

  const a = await open();
  await login(a, 'admin@tripguide.demo');
  await go(a, '/admin/users');
  await a.locator('.user-link', { hasText: 'Omar' }).first().click();
  await a.waitForFunction(() => /^#\/(guides|users)\/\d+/.test(location.hash));
  await a.getByRole('heading', { name: /Omar/ }).first().waitFor();
  // The Users tab stays highlighted inside the profile, and the admin can suspend from here.
  assert.equal(await a.locator('.tabbar a[aria-current="page"]').innerText(), 'Users');
  await a.getByRole('region', { name: 'Account' }).getByRole('button', { name: 'Suspend' }).click();
  await a.getByRole('alertdialog').getByRole('button', { name: 'Suspend' }).click();
  await a.getByRole('region', { name: 'Account' }).getByText('Suspended').waitFor();
  await a.getByRole('region', { name: 'Account' }).getByRole('button', { name: 'Reactivate' }).click();
  await a.getByRole('region', { name: 'Account' }).getByText('Active').waitFor();
  await a.context().close();

  // A tourist opening a request from home keeps the Home tab highlighted.
  const h = await open();
  await login(h, 'tourist@tripguide.demo');
  await go(h, '/');
  await h.locator('a.card.link[href*="#/requests/"]').first().click();
  await h.waitForFunction(() => /^#\/requests\/\d+/.test(location.hash));
  assert.equal(await h.locator('.tabbar a[aria-current="page"]').innerText(), 'Home');
  await h.context().close();
});

test('an open chat fills the phone screen: no tab bar, header pinned on top, message box pinned at the bottom', async () => {
  const p = await open();
  await login(p, 'tourist@tripguide.demo');
  await go(p, '/messages');
  await p.locator('a[href*="#/messages/"]').first().click();
  await p.waitForFunction(() => /^#\/messages\/\d+/.test(location.hash));
  await p.locator('.chat-form textarea').waitFor();
  assert.equal(await p.locator('.tabbar').count(), 0);
  const edges = () =>
    p.evaluate(() => ({
      head: Math.round(document.querySelector('.chat-head')!.getBoundingClientRect().top),
      form: Math.round(document.querySelector('.chat-form')!.getBoundingClientRect().bottom),
      h: window.innerHeight,
    }));
  let e = await edges();
  assert.equal(e.head, 0);
  assert.equal(e.form, e.h);
  // Scrolling the messages moves neither the header nor the message box.
  await p.locator('.chat-log').evaluate((el) => (el.scrollTop = 0));
  await p.mouse.wheel(0, 2000);
  e = await edges();
  assert.equal(e.head, 0);
  assert.equal(e.form, e.h);
  // The keyboard opening (the screen getting shorter) lifts the message box right above it.
  await p.setViewportSize({ width: 390, height: 520 });
  await p.waitForTimeout(200);
  e = await edges();
  assert.equal(e.head, 0);
  assert.equal(e.form, 520);
  // Leaving the chat brings the tab bar back.
  await p.setViewportSize({ width: 390, height: 844 });
  await go(p, '/messages');
  await p.locator('.tabbar').waitFor();
  await p.context().close();
});

test('admin: home sections, city statistics, prices page, and Users on its own', async () => {
  const a = await open();
  await login(a, 'admin@tripguide.demo');
  await go(a, '/');
  const order = await a.locator('main h2').allInnerTexts();
  assert.deepEqual(order.slice(0, 3), ['Needs you', 'The platform', 'Governorates and visitors']);
  await a.locator('.stat-tile').nth(3).waitFor();
  assert.equal(await a.locator('.stat-tile').count(), 4);
  await a.locator('.cs-row').nth(4).waitFor();
  assert.equal(await a.locator('.cs-row').count(), 5);
  assert.equal(await a.getByRole('heading', { name: 'Guide subscription' }).count(), 0);
  // Stats replaces Reports in the bottom bar.
  assert.deepEqual((await a.locator('.tabbar a').allInnerTexts()).map((x) => x.split('\n')[0]), ['Admin', 'Verify', 'Stats', 'Users', 'Profile']);
  await a.locator('.tabbar a', { hasText: 'Stats' }).click();
  await a.getByRole('heading', { name: 'City statistics' }).waitFor();
  await a.locator('.cs-row').nth(7).waitFor();
  assert.equal(await a.locator('.cs-row').count(), 8);
  await a.getByRole('heading', { name: 'Languages tourists ask for' }).waitFor();
  await noSideScroll(a, 'admin stats');
  await go(a, '/admin/pricing');
  await a.getByRole('heading', { name: 'Guide subscription' }).waitFor();
  await a.getByRole('heading', { name: 'Featured guides' }).waitFor();
  await go(a, '/admin/users');
  await a.getByRole('heading', { name: 'Users', exact: true }).waitFor();
  assert.equal(await a.locator('nav.tabs').count(), 0);
  // Reports are still one tap away next to Verify.
  await go(a, '/admin/verify');
  await a.locator('nav.tabs').getByRole('link', { name: 'Reports' }).click();
  await a.waitForFunction(() => location.hash === '#/admin/reports');
  await a.context().close();
});

test('profile and cover photos, and the guide + button adds a tour photo tourists can see', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHElEQVR4nGNk+M9AEmBkYGBgYGBg+P+fgQEAJ/QD/WUX9CIAAAAASUVORK5CYII=', 'base64');
  const g = await open();
  await login(g, 'guide@tripguide.demo');
  await go(g, '/profile');
  await g.locator('.ph-cam input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await g.getByText('Profile photo updated').first().waitFor();
  await g.locator('.ph-avatar img.avatar-img').waitFor();
  await g.locator('.ph-cover-actions input[type=file]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });
  await g.getByText('Cover photo updated').first().waitFor();
  assert.match(await g.locator('.ph-cover').getAttribute('style') || '', /data:image/);
  // The + above the tab bar.
  await go(g, '/');
  await g.locator('label.photo-fab input[type=file]').setInputFiles({ name: 'tour.png', mimeType: 'image/png', buffer: png });
  await g.getByRole('dialog').getByLabel('Caption').fill('Sunrise at the gate');
  await g.getByRole('dialog').getByRole('button', { name: 'Add to my profile' }).click();
  await g.getByText('Added. Tourists can see it on your profile.').first().waitFor();
  await g.context().close();

  // A tourist sees the photo and the profile photo on the guide's page.
  const tt = await open();
  await login(tt, 'tourist@tripguide.demo');
  await go(tt, '/guides?q=Zainab');
  await tt.getByRole('link', { name: /Zainab Al-Rubaie/ }).first().click();
  await tt.getByText('Sunrise at the gate').waitFor();
  await tt.locator('.guide-head img.avatar-img').waitFor();
  await tt.context().close();
});
