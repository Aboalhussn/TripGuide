# Trip guide

**Post your trip. Iraqi guides send you offers.**

A marketplace that connects tourists in Iraq with local guides, built for the Iraq Culture & Tourism Hackathon. It works like a freelancing marketplace: the tourist is the client and the guide is the freelancer. Tourists post a trip, guides send offers with a day-by-day plan, the tourist compares, chats and hires, and the payment is held by the platform and released to the guide one tour day at a time.

English and Arabic (full right-to-left), phone-first, one command to run.

> Trip guide is an independent platform. It is not run by, or affiliated with, any government body.

The earlier, broader version of the app (heritage passport, stamps, rewards, groups) is saved on the [`full-app-v1`](../../tree/full-app-v1) branch.

## Contents
- [How it works](#how-it-works)
- [Run it](#run-it)
- [Demo accounts](#demo-accounts)
- [Tests](#tests)
- [Fonts](#fonts)
- [Rename the app](#rename-the-app)
- [Settings](#settings)
- [Deploy](#deploy)
- [Project structure](#project-structure)
- [Rules the app enforces](#rules-the-app-enforces)
- [Known limits](#known-limits)

## How it works

| Freelancing marketplace | Trip guide |
|---|---|
| Post a project | **Post a trip request**: cities and places, dates, group size, languages, interests, budget, "urgent", "female guide preferred" |
| Browse projects | **Requests feed for guides**, filtered to the guide's cities and languages, with offer count and average |
| Place a bid with suggested milestones | **Send an offer**: total price, a plan for each day, what's included, a message. Shows the 10% fee and what the guide receives. Editable or withdrawable until someone is hired |
| Compare bids | **Offers on a request**: sort, shortlist with a star, compare shortlisted offers side by side |
| Invite to bid | **Invite guides** who cover the trip's cities and languages and are free on its dates |
| Award, freelancer accepts | **Hire**: the tourist pays into holding; the guide has 48 hours to confirm or decline, otherwise the hire lapses and the money returns |
| Hire me | **Hire directly** from a guide's profile: a private request only that guide can see and answer |
| Milestone payments | **Held payments, one per tour day**. The guide asks for a day's payment once it has come; the tourist releases it. The guide can refund a day. All days settled means the tour is complete |
| Freelancer profile | **Guide profile**: bio in English and Arabic, languages with levels, specialities, cities and places, price per day, availability calendar, photos from past tours, badges, track record (tours done, completion rate, repeat hires, reply rate and time), reviews with sub-ratings |
| Verification, preferred freelancer | **ID verified** (checked by the team), **phone verified** (code), **payment verified**, and **Top guide** (verified, 8+ tours, rating 4.7+) |
| Search freelancers | **Find guides**: search by name, city or place; filter by city, language, speciality, price, rating, dates available, verified, female guides; sort by match, rating, price, tours |
| Messages | **Chat** per tourist, guide and request, with unread counts and the offer and booking shown at the top |
| Two-way feedback | **Reviews both ways** after the tour. Each side's review stays hidden until both are written, or 14 days pass |
| Dispute resolution | **Report a problem** on a booking. Held money stays held; the admin refunds the tourist, pays the guide, or dismisses, and can suspend the account |
| Dashboards, notifications | **Tourist and guide dashboards**, a **wallet** with held, released and refunded money and fees, and **notifications** for every step |
| Trust and safety | **Admin**: verify guides, resolve reports, search and suspend users |

Payments are simulated. No payment provider is connected and no real money moves.

## Run it

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm start
```

Open **http://localhost:3000**. The first start creates `data/db.json` with demo data: 8 cities, 28 places, 10 guides, 20 tourists, open requests with offers, a tour in progress, a hire waiting for the guide, an open report and a guide waiting for verification. All dates are relative to today, so the demo always looks current.

| Command | What it does |
|---|---|
| `npm start` | Build, then serve the app and API on one port (`PORT`, default 3000) |
| `npm run dev` | Rebuild the web app and restart the server on every change |
| `npm run reset` | Delete the saved data; the next start creates fresh demo data |
| `npm run build:demo` | Build `dist/demo/index.html`: the whole app in one file that runs in the browser with no server, saving to that browser only |
| `npm test` | Marketplace rules tests |
| `npm run e2e` | Browser tests (run `npm run build` first; needs `npx playwright install chromium` once) |
| `npm run check` | Type check, and check that every text exists in English and Arabic |

## Demo accounts

The sign-in screen has one-tap buttons for these. All passwords are `Demo@1234`.

| Who | Email | What to try |
|---|---|---|
| Hannah, tourist | `tourist@tripguide.demo` | Compare the 4 offers on her Babylon trip, chat, hire. Release day 2 of her Karbala tour. Review her Baghdad food walk |
| Zainab, guide | `guide@tripguide.demo` | Confirm Marco's hire, answer Lena's invite, edit her profile and availability, see her wallet |
| Admin | `admin@tripguide.demo` | Verify Noor, resolve Reza's no-show report |

Other guides: `ali@`, `omar@`, `noor@`, `hussein@`, `sara@`, `yousif@`, `layla@`, `ahmed@`, `hamid@` (all `@tripguide.demo`). Other tourists: `marco@`, `lena@`, `yousef@`, `fatima@`, `james@`, `aiko@`, `reza@`.

## Tests

- **Rules** (`src/core/api.test.ts`): the full flow from post to reviews, direct hire, the 48-hour lapse, declines, reports and refunds, guide verification, validation, and availability search. A test clock moves time forward.
- **Browser** (`e2e/flows.test.ts`): starts a real server with fresh data and drives Chromium at phone size: post, offer, chat, hire, confirm, release each day, review both ways; direct hire; guide sign-up and verification; report and refund; withdrawing an offer; releasing a requested day. It also opens every main screen in Arabic at phone and desktop width and fails on sideways scrolling, untranslated text or any JavaScript error.

## Fonts

The design uses **Thmanyah Sans** throughout, as the brand guide does: Black and Bold for headings, Regular and Medium for text. Their licence does not allow redistributing the files, so they are **not in this repository**. Download them from [font.thmanyah.com](https://font.thmanyah.com) and copy these files into `public/fonts/`:

```
thmanyahsans-Regular.woff2   thmanyahsans-Medium.woff2   thmanyahsans-Bold.woff2   thmanyahsans-Black.woff2
```

Without them the app falls back to system fonts. Check the licence terms before hosting the fonts on a public website.

## Rename the app

The name is set in one place: `src/config/brand.ts` (`name`, `nameAr`, `tagline`). The logo files are in `public/img`: `tg-logo-horizontal.svg` (header), `tg-logo-stacked.svg` (sign-in), `tg-mark.svg` (the bird alone), and `-white` versions for dark backgrounds. Icons are `public/favicon.png`, `public/apple-touch-icon.png` and `public/icon-512.png`.

## Settings

In `src/config/brand.ts`:

| Setting | Default | Meaning |
|---|---|---|
| `feeRate` | `0.1` | Service fee taken from the guide when a payment is released |
| `iqdPerUsd` | `1310` | Rate used to show approximate dinar prices |
| `confirmWindowHours` | `48` | Time a guide has to confirm a hire |
| `reviewRevealDays` | `14` | When a one-sided review becomes visible |
| `demoPhoneCode` | `123456` | Simulated phone verification code |
| `showDemoLogins` | `true` | One-tap demo sign-in buttons. Turn off for a real launch |

Environment variables: `PORT`, `DATA_FILE` (path of the JSON data file), `RESET=1` (start with fresh demo data).

## Deploy

Any host that runs Node 22 works. The build has no native modules.

**Render (free):** create a Web Service from this repository with build command `npm install && npm run build` and start command `node dist/server.mjs`. Free instances lose their disk when they restart, which suits a demo: the app recreates fresh demo data on each start. For data that must last, attach a persistent disk and set `DATA_FILE` to a path on it. `render.yaml` sets this up.

**No server at all:** run `npm run build:demo` and host `dist/demo/index.html` anywhere (GitHub Pages, Netlify). Each visitor gets their own copy of the demo in their browser.

## Project structure

```
src/
├── config/brand.ts     name, colours, fee and other settings
├── core/               the marketplace: runs on the server and in the browser demo
│   ├── api.ts          every route and rule
│   ├── views.ts        stats (rating, completion, repeat hires, reply time) and public shapes
│   ├── seed.ts         demo data, relative to today
│   ├── catalog.ts      cities, places, languages, interests
│   └── api.test.ts     rules tests
├── server/index.ts     Node web server and JSON file storage (no dependencies)
└── web/                React app
    ├── pages/          one file per area: Home, Guides, Requests, Bookings, Messages, Account, Admin
    ├── strings.ts      every interface text in English and Arabic
    ├── styles.css      design tokens and components (logical properties for right-to-left)
    ├── ui.tsx          shared components
    └── demo.tsx        entry for the single-file browser demo
e2e/flows.test.ts       browser tests
scripts/                build, dev, reset, translation check
public/                 index.html, images, logo, fonts (fonts not committed)
```

## Rules the app enforces

| Who | Can | When |
|---|---|---|
| Tourist | Post a request | Dates from today, up to 30 days, at least one city and language |
| Guide | Send one offer per request, with a plan for each day | While the request is open; edit or withdraw until someone is hired |
| Tourist | Hire an offer | Request open, offer waiting, guide free on those dates. Money is held at once |
| Guide | Confirm or decline a hire | Within 48 hours. Confirming closes the other offers; declining or lapsing refunds the tourist and reopens the request |
| Guide | Ask for a day's payment | From that day on |
| Tourist | Release a day's payment | Any time while the booking is confirmed |
| Guide | Refund a day | While it is held |
| Either | Cancel a confirmed booking | Before the first day; all held money returns to the tourist |
| Either | Report a problem | While a hire is waiting or confirmed; held money stays held until the admin decides |
| Either | Review the other | After the tour is complete, once |
| Guide | Message a tourist first | Only about a request they offered on, or a booking they share |

Prices are always calculated on the server, and a guide can't be booked on days that overlap another booking or a day they blocked.

## Known limits

- **Payments are simulated.** Connecting a real provider (for example Qi Card or ZainCash) means replacing the hire, release and refund steps with real calls.
- **Storage is one JSON file**, written after each change. It is fine for a demo and a single server; for real use, move `src/core` onto a database.
- **Messages and notifications refresh by polling** (every 5 and 15 seconds). Push notifications would need a service worker.
- **Verification uploads** record file names only; the files are not stored. Guide photos are resized in the browser and stored inline.
- **Sign-in tokens live in `localStorage`.** Use httpOnly cookies before a public launch, and add password reset and rate limiting.
