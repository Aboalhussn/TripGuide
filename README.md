# Trip guide

**Post your trip. Iraqi guides send you offers.**

Trip guide is a mobile app that connects tourists visiting Iraq with local, verified tour guides. It works like a freelancing marketplace: the **tourist** is the client, the **guide** is the freelancer, and the **admin** keeps the platform safe. A tourist posts a trip, guides answer with offers and a day-by-day plan, the tourist compares, chats and hires, and the money is held by the platform and released to the guide one tour day at a time.

It runs on **Android and iOS** (one shared code base, wrapped with Capacitor), and as a website. Every screen is in **English and Arabic** (Arabic is fully right to left).

> Trip guide is an independent platform. It is not run by, or affiliated with, any government body. Payments in this version are simulated: no real money moves.

**Download the latest Android build:** <https://github.com/Aboalhussn/TripGuide/releases/latest/download/trip-guide.apk>

### نبذة بالعربي

تطبيق Trip guide يربط السائح اللي يزور العراق بمرشدين سياحيين محليين موثّقين. السائح ينشر رحلته (المحافظات، التواريخ، عدد الأشخاص، اللغة، الميزانية لليوم)، والمرشدين يرسلون عروض بيها خطة لكل يوم. السائح يقارن ويحچي وياهم ويوظّف واحد، والفلوس تنحجز بالمنصة وتنطي للمرشد يوم بيوم. الأدمن يوثّق المرشدين، ويحسم البلاغات، ويضيف المحافظات وأماكنها التراثية وصورها، ويحدد الأسعار. السائح عنده **جواز رحلات** يرفع بيه صور من رحلاته، ويشوفه أي واحد يفتح ملفه. التطبيق يشتغل على أندرويد وآيفون وكموقع، بالعربي والإنجليزي.

---

## Contents

1. [The idea in one minute](#1-the-idea-in-one-minute)
2. [Who uses it and what they can do](#2-who-uses-it-and-what-they-can-do)
3. [A trip from start to finish](#3-a-trip-from-start-to-finish)
4. [Features in detail](#4-features-in-detail)
5. [How the app is built](#5-how-the-app-is-built)
6. [Project structure](#6-project-structure)
7. [Run it on your computer](#7-run-it-on-your-computer)
8. [Demo accounts](#8-demo-accounts)
9. [Phone apps and automatic releases](#9-phone-apps-and-automatic-releases)
   - [The trip assistant (AI)](#the-trip-assistant-ai)
10. [Tests](#10-tests)
11. [Settings, names and fonts](#11-settings-names-and-fonts)
12. [The API: every endpoint, for apps, agents and MCP](#12-the-api)
13. [Rules the app enforces](#13-rules-the-app-enforces)
14. [Deploy](#14-deploy)
15. [Known limits](#15-known-limits)

---

## 1. The idea in one minute

| A freelancing marketplace has… | Trip guide has… |
|---|---|
| A client posts a project | A **tourist posts a trip request** |
| Freelancers send bids | **Guides send offers** with a price and a plan for each day |
| The client compares and hires | The tourist **compares offers, chats, and hires** a guide |
| Milestone payments | **The money is held, then released one tour day at a time** |
| Ratings both ways | **Reviews both ways** after the tour |
| Support and disputes | **Reports** that the admin resolves (refund, pay, or dismiss) |

Why it is useful: a tourist gets several offers to compare instead of searching guide by guide, and both sides are protected because the money is held by the platform until each day of the tour has happened.

## 2. Who uses it and what they can do

### Tourist (السائح)
- **Post a trip** in four short steps: title and governorates (with a cover photo picked from that governorate's photos), dates and group size (up to 10 people), languages and an optional day-by-day plan, then a budget **per day**.
- **Hire a guide directly** from the guide's page: the request goes only to that guide.
- **Compare offers**: sort, star a shortlist, compare side by side, chat with any guide.
- **Hire and pay**: by card (a saved card can be reused) or in cash with guides who accept cash. The money is held, and the tourist releases each day after it has happened.
- **Travel passport**: a passport-shaped button above the tab bar adds a photo from a trip (place, governorate, date, short note). The passport opens like a real notebook with turning pages, and anyone who opens the tourist's profile can see it.
- **Profile menu**: your info, your passport, requests and trips, wallet (saved card), settings (language), sign out.

### Guide (المرشد)
- **Sign up** with a strong password, then fill the profile in three steps: about you, where you guide, languages and price per day. Then **ask for verification** (the team checks within 24 hours).
- **Requests feed**: trip cards that match the guide's cities and languages, with "Send offer".
- **Send an offer**: total price, a plan per day, what is included, a message. Shows the fee and what the guide receives. Editable or withdrawable until someone is hired.
- **Confirm or decline a hire** within 48 hours, ask for each day's payment, refund a day, or mark cash received.
- **Profile**: photos from past tours (the round + button above the tab bar adds one), days off, profile and cover photos.
- **Plans**: a subscription to accept cash bookings, and paid featuring on the home screen.

### Admin (الإدارة)
- **Home**: what needs attention first (guides waiting for verification, open reports), platform numbers, and governorate statistics.
- **Verify guides** and **resolve reports** (refund the tourist, pay the guide, or dismiss; suspend accounts).
- **Users**: search, open profiles, suspend or reactivate.
- **City statistics**: visitors, trips, requests, guides and money per governorate.
- **Governorates**: the round + button adds a governorate in three steps (name in Arabic and English, its heritage places, its photos). Tourists can pick it at once, and its photos become the trip cover choices. Existing governorates can be edited the same way.
- **Prices**: the guide subscription, featuring price and length, and the dollar-to-dinar rate shown next to prices.

### Guest (not signed in)
Can browse guides and the home screen, and is asked to sign in before posting or hiring.

## 3. A trip from start to finish

```
Tourist posts a trip ──► Guides send offers ──► Tourist compares, chats
        │                                              │
        │                         Tourist hires one offer (money is held)
        │                                              │
        │                       Guide confirms within 48 hours ── or declines / lapses → money returns, request reopens
        │                                              │
        │                         Tour days happen: guide asks for each day's payment,
        │                         tourist releases it (or the guide refunds it)
        │                                              │
        └──────────────────────────────► All days settled → tour complete → both review each other
```

If something goes wrong, either side can **report a problem**. The held money stays held until the admin decides.

## 4. Features in detail

- **Two languages.** Every text lives in `src/web/strings.ts` in English and Arabic. `npm run check` fails if any text is missing in either language. Layouts use logical CSS properties so Arabic mirrors correctly.
- **Strict, live validation.** Mistakes show while typing, not only on submit. When a limit is reached (for example 3 languages on a trip, or 10 people) the remaining options lock until one is removed. The server checks the same limits.
- **Per-day budget.** Tourists type a budget per day; the app shows the whole-trip total and stores totals, so guides and tourists see the same numbers.
- **Trip cards.** Requests show as cards with the governorate photo, the tourist's name and photo, title, dates, place, people, budget per day and an action ("Send offer" for guides, offers count for tourists). Tapping opens the trip.
- **Wallet and withdrawals.** A guide's released earnings (after the fee) and a tourist's refunds stay in the wallet; either can withdraw them to their saved card when they choose.
- **Saved card.** Only the brand, last four digits, name and expiry are kept, never the full number or the security code.
- **Travel passport.** Built from the passport kit (same look and page turning), with its own style apart from the rest of the app: ruled paper pages, a lapis-blue cover with gold and the Ishtar Gate emblem, binder rings, and calligraphy (Great Vibes; Aref Ruqaa for Arabic; Reem Kufi for Arabic titles).
  - Always an open two-page spread that scales as one piece on phones (CSS container queries).
  - The left page is the holder's page: name, nationality, passport number `TG-000123`, counts, photo and signature.
  - Each right page is one photo memory, framed as a perforated postage stamp with the place name in calligraphy and a round postmark with the place and date, in the governorate's ink colour.
  - Pages turn in 3D around the middle of the spine, by button, keyboard (arrows, PageUp/PageDown), or by dragging the page with a finger. The page follows the finger, and a quick flick finishes the turn.
  - Each turn plays a paper sound made with the Web Audio API (no audio files). It can be muted, and the choice is remembered.
  - Visitors first see the closed cover, and tap it to open.
- **Fixed controls.** Wizard step bars stay at the top; the step buttons, and the Message / Hire buttons on a guide's page, stay right above the tab bar while scrolling. The open chat fills the screen, with the header pinned and the message box pinned above the keyboard.
- **Pull to refresh** on the home screen, with the logo bird spinning.
- **Trip assistant (AI).** Instead of the form, a tourist can describe the trip in a chat. The assistant asks for anything missing, suggests heritage places, a budget from real guide prices and a day plan, then shows a review page before posting. See [The trip assistant (AI)](#the-trip-assistant-ai) and [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md).
- **Demo sign-in.** "Try the demo" opens a sheet: pick tourist, guide or admin (a check marks your choice), then "Enter as…".

## 5. How the app is built

Plain language first: the **whole marketplace logic** (every rule, price and check) is written once in `src/core`. That same code runs in two places:

1. **On a Node server** (`src/server/index.ts`), which saves the data in one JSON file. Used when the app is hosted as a website or the phone apps are pointed at a server.
2. **Inside the app itself** (`src/web/demo.tsx`), with the data saved in the phone's browser storage. This is how the phone apps and the demo page work today, **fully offline**, with no server needed.

The screens (`src/web`) are a React app. They call the API through `src/web/lib/api.ts`, which talks to the server if there is one, or to the built-in engine if not. Because both paths use the same `src/core/api.ts`, the app behaves the same either way.

| Part | Technology | Why |
|---|---|---|
| Screens | React 19 + TypeScript | One code base for phone and web |
| Styling | One CSS file with design tokens, logical properties | Right-to-left Arabic for free, no CSS framework needed |
| Logic and data | `src/core` (TypeScript, no dependencies) | Runs on the server and on the phone |
| Server | Node's built-in `http` module | No framework, nothing to install |
| Build | esbuild (`scripts/build.mjs`) | Builds everything in about a second |
| Phone apps | Capacitor 7 | Wraps the web app as real Android and iOS apps |
| Tests | Node's test runner + Playwright | Rules tests and real-browser tests |
| Releases | GitHub Actions | Every push to `main` builds and publishes the APK |

Routing uses the address hash (`#/requests/12`), so it works inside the phone apps without server setup.

## 6. Project structure

```
TripGuide/
├── README.md                  this guide
├── MOBILE.md                  building the phone apps by hand (Android Studio, Xcode)
├── package.json               commands (npm start, npm test, …) and dependencies
├── capacitor.config.ts        phone app id, name, keyboard and splash settings
├── render.yaml                one-click hosting on Render
├── tsconfig.json              TypeScript settings
│
├── src/
│   ├── config/
│   │   └── brand.ts           app name, colours and business settings (fee, rates, time limits)
│   │
│   ├── core/                  THE MARKETPLACE: every rule, shared by server and phone
│   │   ├── api.ts             all API routes: sign-in, trips, offers, hiring, payments, chat,
│   │   │                      reviews, reports, admin, governorates, travel passport
│   │   ├── types.ts           the shape of every record (User, TripRequest, Offer, Booking, …)
│   │   ├── views.ts           what each side may see; ratings, completion rate, reply time
│   │   ├── draft.ts           the trip assistant's draft: what is missing, cleaning AI output (docs/AI_ASSISTANT.md)
│   │   ├── catalog.ts         built-in governorates, places, languages, interests, cover photos
│   │   ├── seed.ts            demo data (guides, tourists, trips, chats), dated relative to today
│   │   ├── util.ts            small helpers: validation, dates, money, errors
│   │   └── api.test.ts        rules tests
│   │
│   ├── server/
│   │   ├── index.ts           Node web server: serves the app and /api, saves data/db.json
│   │   ├── ai.ts              talks to the AI (OpenAI-compatible APIs or Anthropic), set by AI_* variables
│   │   ├── assistant.ts       the trip assistant: prompt, one chat turn, suggestions, /api/assistant/*
│   │   └── mock-ai.ts         a pretend AI for tests and demos with no key
│   │
│   └── web/                   THE SCREENS (React)
│       ├── main.tsx           entry point and the list of screens (routes)
│       ├── demo.tsx           entry for the offline build: runs src/core inside the app
│       ├── Shell.tsx          frame of every screen: header, bottom tab bar, the + buttons
│       ├── Splash.tsx         launch screen
│       ├── PullToRefresh.tsx  pull down on home to refresh
│       ├── passport.tsx       the travel passport book, page turns, sound, closed cover
│       ├── ui.tsx             shared pieces: buttons, icons, fields, trip card, modal, …
│       ├── strings.ts         every text in English and Arabic
│       ├── styles.css         all styles and design tokens
│       ├── assets.ts          finds pictures (inlined in the offline build)
│       ├── lib/
│       │   ├── api.ts         calls the server or the built-in engine
│       │   ├── app.tsx        app state: signed-in user, language, toasts, dialogs
│       │   ├── router.tsx     hash routing (#/path)
│       │   ├── format.ts      dates, money, plurals, city names in both languages
│       │   ├── image.ts       shrinks photos in the phone before saving
│       │   ├── native.ts      phone-only behaviour (status bar, back button, keyboard)
│       │   └── sha256.ts      password hashing for the offline build
│       └── pages/             one file per area
│           ├── Home.tsx       home screens for guest, tourist, guide and admin
│           ├── Requests.tsx   post a trip (4 steps), trip page, offers, hire, my requests
│           ├── Guides.tsx     find guides, guide page, tourist profile
│           ├── Bookings.tsx   bookings, day-by-day payments, reports, reviews
│           ├── Messages.tsx   chat list and full-screen chat
│           ├── Account.tsx    sign-in, sign-up, profile menu, guide setup, wallet, settings
│           ├── Admin.tsx      verify guides, reports, users, statistics, prices, governorates
│           ├── Passport.tsx   the tourist's passport screen and "add to passport" sheet
│           └── Assistant.tsx  the trip assistant chat (#/post/chat) and review page (#/post/review)
│
├── public/                    files served as they are
│   ├── index.html             web page shell
│   ├── img/                   photos (Babylon, Ishtar Gate, Malwiya…) and logos
│   └── fonts/                 fonts (Thmanyah is not committed, see below)
│
├── e2e/
│   └── flows.test.ts          browser tests: real screens at phone size, English and Arabic
│
├── scripts/
│   ├── build.mjs              builds the website, the server, the offline demo and the phone app files
│   ├── dev.mjs                rebuilds and restarts on every change
│   ├── reset.mjs              deletes saved data so the next start has fresh demo data
│   └── check-strings.ts       fails if a text is missing in English or Arabic
│
├── android/  ios/             the native phone projects (made by Capacitor)
├── assets/                    app icon and splash source images
└── .github/workflows/
    └── mobile.yml             on every push: check, test, build APK and iOS app, publish a release
```

## 7. Run it on your computer

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm start
```

Open **http://localhost:3000**. The first start creates `data/db.json` with demo data: 8 governorates and their places, 10 guides, 20 tourists, open requests with offers, a tour in progress, a hire waiting for the guide, an open report and a guide waiting for verification. Dates are relative to today, so the demo always looks current.

| Command | What it does |
|---|---|
| `npm start` | Build, then serve the app and API on one port (`PORT`, default 3000) |
| `npm run dev` | Rebuild and restart on every change |
| `npm run reset` | Delete saved data; the next start creates fresh demo data |
| `npm run build:demo` | Build `dist/demo/index.html`: the whole app in one file that runs in any browser with no server |
| `npm run build:app` | Build the files the phone apps use (`dist/app`) |
| `npm test` | Rules tests |
| `npm run e2e` | Browser tests (run `npm run build` first; needs `npx playwright install chromium` once) |
| `npm run check` | Type check, and check every text exists in English and Arabic |

## 8. Demo accounts

On the sign-in screen tap **Try the demo**, pick an account and tap **Enter as…**. All passwords are `Demo@1234`.

| Who | Email | What to try |
|---|---|---|
| Hannah, tourist | `tourist@tripguide.demo` | Compare the offers on her Babylon trip, chat, hire. Release a day of her Karbala tour. Open her passport and turn the pages, or add a photo with the passport button |
| Zainab, guide | `guide@tripguide.demo` | Send an offer from the requests feed, confirm a hire, add a tour photo with the + button, edit her profile |
| Admin | `admin@tripguide.demo` | Verify a guide, resolve a report, add a governorate with the + button, change prices |

Other guides: `ali@`, `omar@`, `noor@`, `hussein@`, `sara@`, `yousif@`, `layla@`, `ahmed@`, `hamid@`. Other tourists: `marco@`, `lena@`, `yousef@`, `fatima@`, `james@`, `aiko@`, `reza@` (all `@tripguide.demo`).

### The trip assistant (AI)

The assistant runs on the server, because the AI key must never ship inside the app. So **the server must be running** (`npm start`) and the app must be using it: the website does, and phone apps built with `API_URL` do. The offline phone app has no server, so it hides the assistant and keeps the normal form.

```bash
AI_PROVIDER=mock npm start      # try it with no key (a simple pretend AI)
AI_PROVIDER=openai AI_BASE_URL=https://openrouter.ai/api/v1 AI_API_KEY=... AI_MODEL=... npm start   # a free model
AI_PROVIDER=anthropic AI_API_KEY=... AI_MODEL=claude-haiku-5-5 npm start                          # Claude
```

Everything about it (how it works, settings, the endpoint, limits, tests) is in [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md).

## 9. Phone apps and automatic releases

The phone apps are the same web app wrapped by Capacitor (`android/`, `ios/`). Without a server address they carry the demo engine inside and work offline.

On **every push to `main`**, GitHub Actions (`.github/workflows/mobile.yml`):

1. installs, type-checks and runs the rules tests;
2. builds the Android APK and an unsigned iOS app;
3. publishes them as a new release (`v1.0.<run number>`), marked as the latest.

So this link always downloads the newest Android build: <https://github.com/Aboalhussn/TripGuide/releases/latest/download/trip-guide.apk>

To point the apps at a real server, set the repository variable `API_URL`. Building by hand with Android Studio or Xcode is described in [MOBILE.md](MOBILE.md).

## 10. Tests

- **Trip assistant** (`src/core/draft.test.ts`, `src/server/assistant.test.ts`, part of `npm test`): the draft rules, cleaning what the AI says, the mock AI chat in English and Arabic, broken AI answers, who may use it and the limits. No key or internet needed.
- **Rules** (`src/core/api.test.ts`, `npm test`): the full flow from posting to reviews, direct hire, the 48-hour lapse, declines, reports and refunds, verification, validation and limits, trip covers, governorates added by the admin, the travel passport, saved cards and more. A test clock moves time forward.
- **Browser** (`e2e/flows.test.ts`, `npm run e2e`): starts a real server with fresh data and drives Chromium at phone size, for example:
  - post, offer, chat, hire, confirm, release each day, review both ways;
  - direct hire, guide sign-up and verification, reports and refunds;
  - strict limits, the hire flow, profile menus and photos, the fixed buttons;
  - the admin adding a governorate;
  - the passport turning by button, keyboard and drag.

  It also opens every main screen in Arabic at phone and desktop width, and fails on sideways scrolling, missing translations or any JavaScript error.

## 11. Settings, names and fonts

**Name and logo.** The name is set in `src/config/brand.ts` (`name`, `nameAr`, `tagline`). Logos are in `public/img` (`tg-logo-horizontal.svg`, `tg-logo-stacked.svg`, `tg-mark.svg`, plus `-white` versions). App icons come from `assets/` (`npm run assets` regenerates them).

**Business settings** in `src/config/brand.ts`:

| Setting | Default | Meaning |
|---|---|---|
| `feeRate` | `0.1` | Service fee taken from the guide when a card payment is released |
| `guideSubscriptionPrice`, `subscriptionDays` | `5`, `30` | Starting price of the cash subscription (the admin can change it) |
| `promotionPrice`, `promotionDays` | `10`, `7` | Starting price of being featured (the admin can change it) |
| `iqdPerUsd` | `1310` | Starting dollar-to-dinar rate (the admin can change it) |
| `confirmWindowHours` | `48` | Time a guide has to confirm a hire |
| `reviewRevealDays` | `14` | When a one-sided review becomes visible |
| `demoPhoneCode` | `123456` | Simulated phone verification code |
| `showDemoLogins` | `true` | The "Try the demo" button. Turn off for a real launch |

Server environment variables: `PORT`, `DATA_FILE` (path of the JSON data file), `RESET=1` (start with fresh demo data), `ALLOWED_ORIGINS`, and for the trip assistant `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` ([docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md#6-ai-providers-and-settings)).

**Fonts.**
- **Thmanyah Sans** is the app's main font. Its licence does not allow redistributing the files, so they are not in this repository. Download them from [font.thmanyah.com](https://font.thmanyah.com) and copy `thmanyahsans-Regular/Medium/Bold/Black.woff2` into `public/fonts/`. Without them the app uses system fonts.
- The passport fonts (**Great Vibes**, **Aref Ruqaa**, **Reem Kufi**) are under the SIL Open Font Licence and are included.

## 12. The API

Every action in the app is one HTTP endpoint. The screens call these, and an agent or an MCP server can call the same ones to do the same things. This section lists them all: where they live, who may call them, what to send, and what they do.

### Where the code lives

| What | Where |
|---|---|
| Every endpoint and rule | `src/core/api.ts`. Each one is a single `route('METHOD', '/path', handler)` call; search for the path to find it (for example `route('POST', '/requests'`). Routes are grouped in the file in the same order as the tables below. |
| Record shapes (User, TripRequest, Offer, Booking, Milestone…) | `src/core/types.ts` |
| What other people may see of a record | `src/core/views.ts` (`publicUser`, `guideCard`, `bookingView`…) |
| Allowed values (governorates, languages, interests, includes, rating keys) | `src/core/catalog.ts`, and live from `GET /meta` |
| HTTP server (adds `/api`, reads the token, saves data) | `src/server/index.ts` |
| The same API inside the offline phone app | `src/web/demo.tsx` (no HTTP: `window.__TG_LOCAL_API`) |
| How the screens call it | `src/web/lib/api.ts` (`api(method, path, body)`) |

### How to call it

- **Base URL:** `https://<your-server>/api` (for example `POST http://localhost:3000/api/auth/login`). The phone apps use the server set in `API_URL`, or the built-in engine when none is set.
- **Format:** JSON in, JSON out. Dates are `YYYY-MM-DD`; money is US dollars as numbers.
- **Sign in:** `POST /auth/login` returns `{ token, user }`. Send `Authorization: Bearer <token>` on every other call. Demo accounts are in [section 8](#8-demo-accounts).
- **Errors:** a non-2xx status with `{ "error": "code", "params": { … } }`, for example `400 {"error":"field_invalid","params":{"field":"cities"}}`. `401` means not signed in, `403` means the wrong role, `404` means not found or not yours, `409` means the record is in the wrong state (for example `request_not_open`).
- **Who:** the "Who" column below is the role the token must have. "Anyone" needs no token; "Signed in" is any role; "Party" means the tourist or guide on that booking.
- **Rules are on the server:** limits, prices, dates and money are always checked by `src/core/api.ts`, so an agent cannot do anything the app itself would refuse.

### Start and accounts

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `GET /meta` | Anyone | – | Everything needed to fill forms: governorates (`cities`), heritage places, cover photos per governorate, languages, interests, includes, rating keys, fee, prices, dollar-to-dinar rate, `today`, demo logins |
| `POST /auth/register` | Anyone | `role` (`tourist`/`guide`), `name`, `email`, `password` (8+ with upper, lower, number, symbol), `country`, `gender` (`f`/`m`) | Creates an account and signs in; returns `{ token, user }` |
| `POST /auth/login` | Anyone | `email`, `password` | Signs in; returns `{ token, user }` |
| `POST /auth/logout` | Signed in | – | Ends this session |
| `POST /auth/forgot` | Anyone | `email` | Sends a 6-digit reset code (valid 15 minutes; in the demo it is returned as `demoCode`). Same answer whether or not the email exists |
| `POST /auth/reset` | Anyone | `email`, `code`, `password` | Sets a new password with the code, signs out other sessions, and signs in; returns `{ token, user }` |
| `POST /me/password` | Signed in | `current`, `password` | Changes the password; other sessions are signed out |
| `GET /me` | Signed in | – | The signed-in user: profile, saved card (brand and last 4 only), unread counts, guide profile, travel passport |
| `PUT /me` | Signed in | any of `name`, `email`, `country`, `phone`, `avatar`, `cover` (images as `data:image/...;base64`) | Edits your info and photos |
| `PUT /me/card` | Tourist, Guide | `number`, `name`, `expiry` (`MM/YY`), `cvc` | Saves a payment card (only brand, last 4, name and expiry are kept) |
| `DELETE /me/card` | Tourist, Guide | – | Removes the saved card |
| `POST /me/verify-phone` | Signed in | `code` | Marks the phone verified (demo code in settings) |
| `POST /me/verify-payment` | Tourist | `card` | Marks the payment method verified |
| `GET /users/:id` | Signed in | – | A tourist's public profile: stats, reviews from guides, travel passport (a guide id redirects to the guide page) |

### Travel passport (tourists)

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `POST /me/passport` | Tourist | `img` (data URL), `place`, `city` (governorate slug), `date` (not in the future), `note` (optional) | Adds a photo page to your passport (up to 30) |
| `DELETE /me/passport/:id` | Tourist | – | Removes a page |

### Guides

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `GET /guides` | Anyone | query: `q`, `city`, `lang`, `spec`, `maxPrice`, `minRating`, `from`, `to` (free on those dates), `verified=1`, `female=1`, `sort` (`best`/`rating`/`price_low`/`price_high`/`tours`) | Searches guides |
| `GET /guides/:id` | Anyone | – | A guide's full page: bio, languages, places, price, calendar, photos, track record, reviews. For a signed-in tourist, `forMe` shows their booking, pending offer and open requests with this guide |
| `PUT /guide/profile` | Guide | any of `headline`, `headlineAr`, `bio`, `bioAr`, `pricePerDay`, `cities`, `languages` (`[{code, level}]`), `specialities`, `places`, `blockedDates`, `photos`, `acceptsCash` | Edits the guide profile |
| `POST /guide/photos` | Guide | `img`, `caption`, `captionAr` | Adds a tour photo (up to 12) |
| `POST /guide/verification` | Guide | `docs` (file names) | Asks the team to verify the guide |
| `GET /guide/subscription` / `POST /guide/subscription` | Guide | `card`, `acceptCash` | Shows / buys the subscription that allows cash bookings |
| `GET /guide/promotion` / `POST /guide/promotion` | Guide | `card` | Shows / buys being featured on the home screen |

### Trip requests

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `POST /requests` | Tourist | `title`, `description`, `cities` (1–4), `places`, `startDate`, `endDate` (up to 30 days), `groupSize` (1–10), `languages` (1–3), `interests`, `budgetMin`, `budgetMax` (whole-trip totals), `urgent`, `femaleGuide`, `plan` (`[{title, details}]` per day, optional), `cover` (one of the governorates' photos), `directGuideId` (send to one guide only) | Posts a trip; guides who match are notified |
| `GET /requests` | Guide, Admin | query: `q`, `city`, `lang`, `interest`, `urgent`, `matching` | The requests feed (for guides: open requests that fit them) |
| `GET /requests/mine` | Tourist | – | Your requests with offer counts |
| `GET /requests/:id` | Signed in | – | One request; the tourist also gets its offers, the guide gets their own offer |
| `POST /requests/:id/close` | Tourist | – | Closes the request; guides who offered are told |
| `GET /requests/:id/suggested-guides` | Tourist | – | Guides who fit and are free on those dates |
| `POST /requests/:id/invite` | Tourist | `guideId` | Invites a guide to send an offer |

### Offers and hiring

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `POST /requests/:id/offers` | Guide | `price` (whole trip), `plan` (one `{title, details}` per day), `includes`, `message` | Sends an offer |
| `PUT /offers/:id` | Guide | same as above | Edits a pending offer |
| `POST /offers/:id/withdraw` | Guide | – | Withdraws a pending offer |
| `POST /offers/:id/shortlist` | Tourist | `on` (true/false) | Stars an offer to compare |
| `GET /offers/mine` | Guide | – | The guide's offers and their status |
| `POST /offers/:id/hire` | Tourist | `confirmPayment: true`, `method` (`card`/`cash`), `card` (`{number, name, expiry, cvc}` or `{saved: true}`) | Hires the guide: the money is held and a booking waits for the guide to confirm within 48 hours |

### Bookings and day-by-day payments

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `GET /bookings` | Signed in | – | Your bookings |
| `GET /bookings/:id` | Party | – | One booking with its days (milestones), money held, released and refunded |
| `POST /bookings/:id/confirm` | Guide | – | Confirms a hire; the other offers close |
| `POST /bookings/:id/decline` | Guide | – | Declines; the tourist is refunded and the request reopens |
| `POST /bookings/:id/cancel` | Party | `reason` | Cancels (free before the first day; held money returns) |
| `POST /milestones/:id/request-release` | Guide | – | Asks the tourist to release that day's payment |
| `POST /milestones/:id/release` | Tourist | – | Releases that day's payment to the guide |
| `POST /milestones/:id/refund` | Guide | – | Refunds that day to the tourist |
| `POST /milestones/:id/cash-received` | Guide | – | Marks a cash day as paid |
| `POST /bookings/:id/report` | Party | `reason` (`no_show`/`not_as_agreed`/`safety`/`payment`/`other`), `details` | Reports a problem; held money stays held until the admin decides |
| `POST /bookings/:id/review` | Party | `ratings` (keys from `GET /meta`, 1–5 each), `comment`, `hireAgain` | Reviews the other side after the tour |

### Messages, notifications, wallet

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `GET /threads` | Signed in | – | Your chats with unread counts |
| `POST /threads` | Tourist, Guide | `guideId` or `touristId`, `requestId` (optional) | Opens (or finds) a chat |
| `GET /threads/:id` | Party | – | A chat's messages, with the offer and booking it is about |
| `POST /threads/:id/messages` | Tourist, Guide | `body` | Sends a message |
| `GET /notifications` | Signed in | – | Your notifications |
| `POST /notifications/read-all` / `POST /notifications/:id/read` | Signed in | – | Marks them read |
| `GET /wallet` | Tourist, Guide | – | Money held, released, refunded and fees; `available` (what can be withdrawn), `withdrawn`, the saved card, and the history |
| `POST /wallet/withdraw` | Tourist, Guide | `amount` (optional; default everything available) | Withdraws a guide's earnings, or a tourist's refunds, to the saved card |
| `GET /dashboard` | Signed in | – | The home screen data for the signed-in role |

### Admin

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `GET /admin/stats` | Admin | – | Platform numbers and statistics per governorate |
| `GET /admin/settings` / `PUT /admin/settings` | Admin | `guideSubscriptionPrice`, `subscriptionDays`, `promotionPrice`, `promotionDays`, `iqdPerUsd` | Reads / changes prices and the dinar rate |
| `GET /admin/verifications` | Admin | – | Guides waiting for verification |
| `POST /admin/guides/:id/verify` | Admin | `approve` (true/false), `note` (reason when rejecting) | Verifies or rejects a guide |
| `GET /admin/reports` | Admin | – | Reports to decide |
| `POST /admin/reports/:id/resolve` | Admin | `action` (`refund`/`release`/`dismiss`), `note`, `suspend` | Refunds the tourist, pays the guide, or dismisses; can suspend |
| `GET /admin/users` | Admin | query: `query` | Searches users |
| `POST /admin/users/:id/status` | Admin | `status` (`active`/`suspended`) | Suspends or reactivates an account |
| `GET /admin/cities` / `GET /admin/cities/:slug` | Admin | – | Governorates with their places and photos |
| `POST /admin/cities` | Admin | `name`, `nameAr`, `places` (`[{name, nameAr, kind}]`, 1–30), `covers` (1–12: data URLs or existing photo names) | Adds a governorate |
| `PUT /admin/cities/:slug` | Admin | same as above (keep a place's `id` to edit it) | Edits a governorate |

### Trip assistant

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `GET /assistant/context` | Tourist | – | What the assistant needs: allowed values, today, and real guide prices per governorate |
| `GET /assistant/status` | Anyone | – | `{ enabled }`: whether the server has an AI set up (server only, not in the offline app) |
| `POST /assistant/trip` | Tourist | `messages` (`[{role, content}]`), `draft`, `lang` (`en`/`ar`) | One chat turn: returns `reply`, the updated `draft`, `missing`, `problems`, `suggestions`, `ready`. Nothing is saved or posted; post with `POST /requests`. Details in [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md#7-the-endpoint) |

### Using it from an agent or an MCP server

Each endpoint above maps to one tool. A thin MCP server only needs to:

1. Keep a token per user: call `POST /auth/login` once, then send `Authorization: Bearer <token>`.
2. Expose each endpoint as a tool named after it (for example `post_trip` → `POST /requests`, `send_offer` → `POST /requests/:id/offers`, `hire_offer` → `POST /offers/:id/hire`, `release_day` → `POST /milestones/:id/release`, `withdraw` → `POST /wallet/withdraw`), with the "Send" column as its input.
3. Call `GET /meta` first to learn the allowed values (governorate slugs, languages, rating keys), and pass errors back as they come (the `error` code says exactly what to fix).

Typical flows:

- **Tourist books a guide:** `GET /meta` → `POST /requests` → wait for offers (`GET /requests/:id`) → `POST /offers/:id/hire` → after each tour day `POST /milestones/:id/release` → `POST /bookings/:id/review`.
- **Guide finds work:** `GET /requests` → `POST /requests/:id/offers` → `POST /bookings/:id/confirm` → `POST /milestones/:id/request-release` each day → `POST /wallet/withdraw`.
- **Admin's daily check:** `GET /admin/verifications` → `POST /admin/guides/:id/verify`; `GET /admin/reports` → `POST /admin/reports/:id/resolve`.

To add an endpoint, add one `route(...)` call in `src/core/api.ts`, a test in `src/core/api.test.ts`, and a row in this table.

## 13. Rules the app enforces

| Who | Can | When |
|---|---|---|
| Tourist | Post a request | Dates from today, up to 30 days, 1–4 governorates, up to 10 people, 1–3 languages |
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
| Tourist | Add a passport page | Up to 30 pages; a real photo, a place, a governorate and a date that is not in the future |
| Admin | Add or edit a governorate | Unique names in both languages, 1–30 places, 1–12 photos |

Prices are always calculated on the server, and a guide can't be booked on days that overlap another booking or a day off.

## 14. Deploy

Any host that runs Node 22 works; there are no native modules.

- **Render (free):** create a Web Service from this repository with build command `npm install && npm run build` and start command `node dist/server.mjs` (`render.yaml` sets this up). Free instances lose their disk on restart, which suits a demo. For data that must last, attach a disk and set `DATA_FILE`.
- **No server at all:** run `npm run build:demo` and host `dist/demo/index.html` anywhere (GitHub Pages, Netlify). Each visitor gets their own copy of the demo.

## 15. Known limits

- **Payments are simulated.** Connecting a real provider (for example Qi Card or ZainCash) means replacing the hire, release and refund steps with real calls.
- **Storage is one JSON file** on the server, or the phone's storage in the offline app. Fine for a demo; for real use, move `src/core` onto a database.
- **Photos are stored inline** (shrunk in the phone first). A real launch should move them to file storage.
- **The trip assistant needs the server** (it holds the AI key), so the offline phone app hides it. Its rate limit is kept in memory and resets when the server restarts.
- **Messages and notifications refresh by polling.** Push notifications would need a push service.
- **Sign-in tokens live in local storage.** Use httpOnly cookies on the web, and add password reset and rate limiting before a public launch.
