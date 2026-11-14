# Trip guide

**Post your trip. Iraqi guides send you offers.**

Trip guide is a mobile app that connects tourists visiting Iraq with local, verified tour guides. It works like a freelancing marketplace: the **tourist** is the client, the **guide** is the freelancer, and the **admin** keeps the platform safe. A tourist posts a trip, guides answer with offers and a day-by-day plan, the tourist compares, chats and hires, and the money is held by the platform and released to the guide one tour day at a time.

It runs on **Android and iOS** (one shared code base, wrapped with Capacitor), and as a website. Every screen is in **English and Arabic** (Arabic is fully right to left).

> Payments in this version are simulated: no real money moves. SMS codes are written to the server log until an SMS provider is connected.

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

Why it is useful: a tourist gets several offers to compare instead of searching guide by guide, and both sides are protected because the whole trip is paid in one payment that the platform holds, and the admin transfers it to the guide.

## 2. Who uses it and what they can do

### Tourist (السائح)
- **Post a trip** in four short steps: title and governorates (with a cover photo picked from that governorate's photos), dates and group size (up to 10 people), languages and an optional day-by-day plan, then a budget **per day**.
- **Hire a guide directly** from the guide's page: the request goes only to that guide.
- **Compare offers**: sort, star a shortlist, compare side by side, chat with any guide.
- **Hire and pay**: by card (a saved card can be reused) in **one full payment**, or in cash with guides who accept cash. The platform holds a card payment and the **admin transfers it to the guide**.
- **Home page sections**: *Your offers* (offers waiting for an answer) and *Special events* added by the admin (for example a coffee and tea festival or the Baghdad fair). An event opens with a "Post a trip for this event" button that fills in the governorate and dates.
- **Travel passport**: a passport-shaped button above the tab bar adds a photo from a trip (place, governorate, date, short note). The passport opens like a real notebook with turning pages, and anyone who opens the tourist's profile can see it.
- **Profile menu**: your info, your passport, requests and trips, wallet (saved card), settings (language), sign out.

### Guide (المرشد)
- **Sign up** with a strong password, then fill the profile in three steps: about you, where you guide, languages and price per day. Then **ask for verification** (the team checks within 24 hours).
- **Requests feed**: trip cards that match the guide's cities and languages, with "Send offer".
- **Send an offer**: total price, a plan per day, what is included, a message. Shows the fee and what the guide receives. Editable or withdrawable until someone is hired.
- **Verify the account first**: right after sign-up the guide uploads three photos in three steps (ID front, ID back, residence card). The profile, price and bio open only after the admin approves.
- **Confirm or decline a hire** within 48 hours. Card bookings are paid by the admin in one transfer; in cash bookings the guide marks each day's cash as received.
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
        │                         Tourist hires one offer and pays once (money is held)
        │                                              │
        │                       Guide confirms within 48 hours ── or declines / lapses → money returns, request reopens
        │                                              │
        │                         Tour days happen. The admin transfers the whole
        │                         payment to the guide (cash trips: paid by hand each day)
        │                                              │
        └──────────────────────────────► Payment transferred → tour complete → both review each other
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

Plain language first: the **whole marketplace logic** (every rule, price and check) is written once in `src/core`. That same code runs in three places:

1. **In the production API** (`src/api`, Fastify + PostgreSQL). For every call it loads the rows from the database, runs the rule from `src/core` inside one transaction, and saves exactly what changed. This is what a real launch uses.
2. **Inside the app itself** (`src/web/demo.tsx`), with the data saved in the phone's browser storage. This is the **offline demo**: no server needed.
3. **On the small demo server** (`src/server/index.ts`), which saves the data in one JSON file. Kept for quick demos and as the reference the tests compare against.

The screens (`src/web`) are a React app. They call the API through `src/web/lib/api.ts`, which talks to the server if there is one, or to the built-in engine if not. Because every path uses the same `src/core/api.ts`, the app behaves the same everywhere. `PARITY.md` shows how that is proved.

| Part | Technology | Why |
|---|---|---|
| Screens | React 19 + TypeScript | One code base for phone and web |
| Styling | One CSS file with design tokens, logical properties | Right-to-left Arabic for free, no CSS framework needed |
| Rules | `src/core` (TypeScript) | Runs in the API, on the demo server and on the phone |
| Production API | Fastify 5, PostgreSQL 16, Drizzle ORM and SQL migrations | Transactions and locks for money and availability |
| Passwords and sign-in | argon2id; random tokens stored hashed, with an expiry | Nothing reusable is stored |
| Phone numbers | libphonenumber-js, on the screens and on the server | Any mobile number in the world, kept in E.164 form |
| Rate limits | Redis (memory when there is no Redis) | Sign-in, sign-up, forgot password, the assistant |
| Photos | S3-compatible storage (a folder on disk in development) | ID photos are private: signed links, state account only |
| Build | esbuild (`scripts/build.mjs`) | Builds everything in about a second |
| Phone apps | Capacitor 7 | Wraps the web app as real Android and iOS apps |
| Tests | Node's test runner + Playwright | Rules, money safety, contract diff, real-browser tests |
| Releases | GitHub Actions | Tests on every push; the APK and a release from `main` |

Routing uses the address hash (`#/requests/12`), so it works inside the phone apps without server setup.

**How people sign in.** With their **phone number** and a password. The phone field has a country picker (Iraq +964 first) and accepts any valid mobile number, typed with or without the leading 0, with spaces, dashes or Arabic digits. Numbers are stored as `+9647713111325`. An email is still asked for at sign-up.

**The state account.** The admin side is the state (the government authority). Its account is created the first time the API starts, with the phone in `ADMIN_PHONE` (`+9647713111325`) and the password in `ADMIN_PASSWORD`, which is stored hashed only and lives in your `.env` file, never in this repository.

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
│   │   ├── phone.ts           phone numbers: validation per country, E.164, the country list
│   │   ├── util.ts            small helpers: validation, dates, money, errors
│   │   └── api.test.ts        rules tests
│   │
│   ├── api/                   THE PRODUCTION API (Fastify + PostgreSQL)
│   │   ├── index.ts, app.ts   start-up; HTTP server: /api, /media, health checks, CORS, limits
│   │   ├── kernel.ts          one call = one transaction: sign-in tokens, roles, media links, audit log
│   │   ├── world.ts           loads rows, runs the rule from src/core, saves what changed; the write lock
│   │   ├── routes/account.ts  meta, sign-up, sign-in by phone, passwords, your info, phone verification
│   │   ├── routes/marketplace.ts  every other endpoint, with row locks for money and availability
│   │   ├── payments.ts        PaymentProvider: the simulated provider and a stub for a real Iraqi one
│   │   ├── services.ts        clock, SMS sender, media storage (disk / S3), rate limits
│   │   ├── config.ts          environment variables
│   │   └── *.test.ts          account, rules, money and contract tests (twin.ts: engine vs API)
│   │
│   ├── db/                    THE DATABASE
│   │   ├── schema.ts          every table (Drizzle)
│   │   ├── migrations/        SQL migrations, applied on start
│   │   ├── seed.ts, cli.ts    first data: production (governorates + the state account) or the demo data
│   │   └── client.ts          PostgreSQL, or an embedded one for development and tests
│   │
│   ├── server/
│   │   ├── index.ts           the small demo server: serves the app and /api, saves data/db.json
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
│       ├── PhoneField.tsx     the phone field: country code picker + number
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
│           ├── Bookings.tsx   bookings, the single payment, cash days, reports, reviews
│           ├── Extras.tsx     ID verification steps, special events, admin payouts, the admin's "what to add" sheet
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
├── docs/                      AI_ASSISTANT.md (the trip assistant), DEPLOY.md (production, backups)
├── PLAN.md, PARITY.md, IMPROVEMENTS.md   the plan, the proof nothing else changed, ideas not done
├── Dockerfile, docker-compose.yml, .env.example
│
├── scripts/
│   ├── build.mjs              builds the website, the API, the demo server, the offline demo and the phone app files
│   ├── baseline.mjs           extracts the app as it is on main, for the parity checks
│   ├── parity-contract.ts, parity-screens.ts, e2e-api.ts   the parity checks
│   ├── dev.mjs                rebuilds and restarts on every change
│   ├── reset.mjs              deletes saved data so the next start has fresh demo data
│   └── check-strings.ts       fails if a text is missing in English or Arabic
│
├── android/  ios/             the native phone projects (made by Capacitor)
├── assets/                    app icon and splash source images
└── .github/workflows/
    └── mobile.yml             every push: tests and the APK; pushes to main: iOS app and a release
```

## 7. Run it on your computer

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
```

**The production API with demo data** (an embedded PostgreSQL in `data/pg`, photos in `data/media`, nothing else to install):

```bash
# .env (never committed):  SEED_DEMO=1
npm run api
```

**The same with PostgreSQL 16, Redis and MinIO in Docker:**

```bash
# .env (never committed):  ADMIN_PASSWORD=your-own-strong-password
docker compose up --build
```

**The small demo server** (data in `data/db.json`):

```bash
npm start
```

All three open at **http://localhost:3000**. The demo data has 8 governorates and their places, 10 guides, 20 tourists, open requests with offers, a tour in progress, a hire waiting for the guide, an open report and a guide waiting for verification. Dates are relative to today, so the demo always looks current. Codes "sent by SMS" appear in the server log.

| Command | What it does |
|---|---|
| `npm run api` | Build, then run the production API (`PORT`, default 3000). Settings come from `.env`: see `.env.example` |
| `npm run api:dev` | The API from source, restarting on every change |
| `npm run db:migrate` / `npm run db:seed` / `npm run db:seed -- --demo` | Apply migrations / first data for production / the demo data |
| `npm run db:generate` | Make a new SQL migration after changing `src/db/schema.ts` |
| `npm start` | The small demo server |
| `npm run dev` | The demo server, rebuilding and restarting on every change |
| `npm run reset` | Delete the demo server's saved data |
| `npm run build:demo` | Build `dist/demo/index.html`: the whole app in one file that runs in any browser with no server. Add `DEMO_AI=mock` to include the trip assistant with its pretend AI |
| `npm run build:app` | Build the files the phone apps use (`dist/app`). `API_URL=https://your-server` points them at a server |
| `npm test` | Rules, phone, account, money and contract tests. `TEST_DATABASE_URL=postgres://…` runs them on a real PostgreSQL |
| `npm run e2e` / `npm run e2e:api` | Browser tests against the demo server / against the production API (run `npm run build` first; needs `npx playwright install chromium` once) |
| `npm run parity:contract` / `npm run parity:screens` | Compare the new API, and the screens, with the app as it is on `main` |
| `npm run check` | Type check, and check every text exists in English and Arabic |

Build flags: `TG_ENV=production` hides the demo-only parts of the screens; `TG_API_BASE=https://your-api` makes the website call an API on another address.

## 8. Demo accounts

On the sign-in screen tap **Try the demo**, pick an account and tap **Enter as…** (staging builds only). Or sign in with a phone number below. All demo passwords are `Demo@1234`.

| Who | Phone | What to try |
|---|---|---|
| Hannah, tourist | `+964 770 000 1011` | Compare the offers on her Babylon trip, chat, hire. Open her passport and turn the pages, or add a photo with the passport button |
| Zainab, guide | `+964 770 000 1001` | Send an offer from the requests feed, confirm a hire, add a tour photo with the + button, edit her profile |
| Demo admin (the state) | `+964 770 000 1000` | Verify a guide, transfer a payment, resolve a report, add a governorate with the + button, change prices |

Every demo account and its phone number:

| Name | Role | Phone | Email |
|---|---|---|---|
| Trip guide team | admin | `+964 770 000 1000` | `admin@tripguide.demo` |
| Zainab Al-Rubaie | guide | `+964 770 000 1001` | `guide@tripguide.demo` |
| Ali Hassan | guide | `+964 770 000 1002` | `ali@tripguide.demo` |
| Omar Saad | guide | `+964 770 000 1003` | `omar@tripguide.demo` |
| Noor Kareem | guide | `+964 770 000 1004` | `noor@tripguide.demo` |
| Hussein Al-Musawi | guide | `+964 770 000 1005` | `hussein@tripguide.demo` |
| Sara Mahmoud | guide | `+964 770 000 1006` | `sara@tripguide.demo` |
| Yousif Aziz | guide | `+964 770 000 1007` | `yousif@tripguide.demo` |
| Layla Jasim | guide | `+964 770 000 1008` | `layla@tripguide.demo` |
| Ahmed Kadhim | guide | `+964 770 000 1009` | `ahmed@tripguide.demo` |
| Hamid Jaber | guide | `+964 770 000 1010` | `hamid@tripguide.demo` |
| Hannah Weber | tourist | `+964 770 000 1011` | `tourist@tripguide.demo` |
| Marco Rossi | tourist | `+964 770 000 1012` | `marco@tripguide.demo` |
| Lena de Vries | tourist | `+964 770 000 1013` | `lena@tripguide.demo` |
| Yousef Al-Sabah | tourist | `+964 770 000 1014` | `yousef@tripguide.demo` |
| Fatima Raza | tourist | `+964 770 000 1015` | `fatima@tripguide.demo` |
| James Carter | tourist | `+964 770 000 1016` | `james@tripguide.demo` |
| Aiko Tanaka | tourist | `+964 770 000 1017` | `aiko@tripguide.demo` |
| Reza Karimi | tourist | `+964 770 000 1018` | `reza@tripguide.demo` |
| Sophie Martin | tourist | `+964 770 000 1019` | `sophie@tripguide.demo` |
| Daniel Kim | tourist | `+964 770 000 1020` | `daniel@tripguide.demo` |
| Emma Johansson | tourist | `+964 770 000 1021` | `emma@tripguide.demo` |
| Carlos Mendes | tourist | `+964 770 000 1022` | `carlos@tripguide.demo` |
| Mariam Khan | tourist | `+964 770 000 1023` | `mariam@tripguide.demo` |
| Thomas Becker | tourist | `+964 770 000 1024` | `thomas@tripguide.demo` |
| Olivia Brown | tourist | `+964 770 000 1025` | `olivia@tripguide.demo` |
| Mehmet Yilmaz | tourist | `+964 770 000 1026` | `mehmet@tripguide.demo` |
| Ana Petrova | tourist | `+964 770 000 1027` | `ana@tripguide.demo` |
| Ali Rezaei | tourist | `+964 770 000 1028` | `alirezaei@tripguide.demo` |
| Grace Lee | tourist | `+964 770 000 1029` | `grace@tripguide.demo` |
| Pierre Dubois | tourist | `+964 770 000 1030` | `pierre@tripguide.demo` |

The demo admin exists only in the demo data. The real state account (`+964 771 311 1325`) is created from `ADMIN_PASSWORD` and is the only account a production database starts with.

### The trip assistant (AI)

The assistant runs on the server, because the AI key must never ship inside the app. So **the server must be running** (`npm run api` or `npm start`) and the app must be using it: the website does, and phone apps built with `API_URL` do. The offline phone app has no server, so it hides the assistant and keeps the normal form.

```bash
AI_PROVIDER=mock npm start      # try it with no key (a simple pretend AI)
AI_PROVIDER=openai AI_BASE_URL=https://openrouter.ai/api/v1 AI_API_KEY=... AI_MODEL=... npm start   # a free model
AI_PROVIDER=anthropic AI_API_KEY=... AI_MODEL=claude-haiku-5-5 npm start                          # Claude
```

Everything about it (how it works, settings, the endpoint, limits, tests) is in [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md).

## 9. Phone apps and automatic releases

The phone apps are the same web app wrapped by Capacitor (`android/`, `ios/`). Without a server address they carry the demo engine inside and work offline.

On **every push**, GitHub Actions (`.github/workflows/mobile.yml`):

1. type-checks, runs the rules, money and contract tests on PostgreSQL 16, and the browser tests against both servers;
2. builds the Android APK (kept with the run).

On pushes to **`main`** it also builds an unsigned iOS app and publishes both as a new release (`v1.0.<run number>`), marked as the latest.

So this link always downloads the newest Android build: <https://github.com/Aboalhussn/TripGuide/releases/latest/download/trip-guide.apk>

The offline APK includes the trip assistant with the pretend AI (it understands simple English and everyday Arabic, and answers with demo data). Set the repository variable `DEMO_AI` to `off` to hide it. To point the apps at a real server (staging), set the repository variable `API_URL`; set `TG_ENV` to `production` to hide the demo-only parts. Building by hand with Android Studio or Xcode is described in [MOBILE.md](MOBILE.md).

## 10. Tests

- **Rules** (`src/core/api.test.ts`): the full flow from posting to reviews, direct hire, the 48-hour lapse, declines, reports and refunds, verification, validation and limits, covers, governorates, the travel passport, saved cards and more. A test clock moves time forward. The same scenarios run against the production API in `src/api/rules.test.ts`.
- **Phone numbers** (`src/core/phone.test.ts`): validation per country, E.164, the leading 0, spaces, dashes, Arabic digits, a pasted `+` number, the country search.
- **Accounts** (`src/api/account.test.ts`): sign-up and sign-in by phone, uniqueness, SMS reset, hashed tokens with expiry, the state account from `ADMIN_PASSWORD`, production switches.
- **Money** (`src/api/money.test.ts`): two hires at the same moment, a double payout, a double withdrawal, a refused card, a lapsed hire, the audit log, private ID photos.
- **Contract** (`src/api/contract.test.ts`): every endpoint called on the old engine and on the new API, with the answers compared.
- **Trip assistant** (`src/core/draft.test.ts`, `src/server/assistant.test.ts`): the draft rules, the mock AI in English and Arabic, broken AI answers, limits.
- **Browser** (`e2e/flows.test.ts`): drives Chromium at phone size through the real screens, in English and Arabic, against the demo server (`npm run e2e`) and the production API (`npm run e2e:api`). It fails on sideways scrolling, missing translations or any JavaScript error.

`PARITY.md` has the results and what they do and do not prove.

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
| `demoPhoneCode` | `123456` | Phone verification code that works in the demo and on staging (production sends a real code by SMS) |
| `showDemoLogins` | `true` | The "Try the demo" button. Turn off for a real launch |

**Environment variables of the production API.** Every one is listed with a comment in `.env.example`; [docs/DEPLOY.md](docs/DEPLOY.md) says which ones staging and production must set.

| Variable | Meaning |
|---|---|
| `APP_ENV` | `development`, `staging` (demo helpers on) or `production` (demo helpers off) |
| `PORT` | Port to listen on (3000) |
| `DATABASE_URL` | PostgreSQL address. Empty in development = an embedded database in `data/pg` |
| `REDIS_URL` | Redis for rate limits. Empty = counted in memory |
| `WEB_ORIGIN`, `PUBLIC_URL`, `TRUST_PROXY` | The website's address (CORS), this API's public address, and whether a proxy ends HTTPS |
| `TOKEN_SECRET` | 32+ random characters; signs SMS codes and private photo links |
| `SESSION_DAYS` | How long a sign-in lasts without being used (30) |
| `ADMIN_PHONE`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_NAME` | The state account, created on first start. The password is stored hashed only |
| `SEED_DEMO` | `1` fills an empty database with the demo data (never in production) |
| `MEDIA_DRIVER`, `MEDIA_DIR`, `S3_*` | Where photos are kept: a folder, or S3-compatible storage with a public and a private bucket |
| `SMS_PROVIDER` | `log` (codes go to the server log). A real provider is not connected yet |
| `PAYMENT_PROVIDER` | `simulated` (behaves like the demo) |
| `RATE_LIMIT`, `LOG_LEVEL` | `on`/`off`; log detail |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | The trip assistant ([docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md#6-ai-providers-and-settings)) |

The small demo server has its own few: `PORT`, `DATA_FILE`, `RESET=1`, `ALLOWED_ORIGINS`, and the `AI_*` ones.

**Fonts.**
- **Thmanyah Sans** is the app's main font. Its licence does not allow redistributing the files, so they are not in this repository. Download them from [font.thmanyah.com](https://font.thmanyah.com) and copy `thmanyahsans-Regular/Medium/Bold/Black.woff2` into `public/fonts/`. Without them the app uses system fonts.
- The passport fonts (**Great Vibes**, **Aref Ruqaa**, **Reem Kufi**) are under the SIL Open Font Licence and are included.

## 12. The API

Every action in the app is one HTTP endpoint. The screens call these, and an agent or an MCP server can call the same ones to do the same things. This section lists them all: where they live, who may call them, what to send, and what they do.

### Where the code lives

| What | Where |
|---|---|
| Every endpoint and rule | `src/core/api.ts`. Each one is a single `route('METHOD', '/path', handler)` call; search for the path to find it (for example `route('POST', '/requests'`). Routes are grouped in the file in the same order as the tables below. |
| The production API around those rules (database, transactions, locks, tokens, media, audit log) | `src/api` (`routes/account.ts` for sign-in and your info, `routes/marketplace.ts` + `world.ts` for everything else) |
| Tables | `src/db/schema.ts` |
| Phone number rules | `src/core/phone.ts` |
| Record shapes (User, TripRequest, Offer, Booking, Milestone…) | `src/core/types.ts` |
| What other people may see of a record | `src/core/views.ts` (`publicUser`, `guideCard`, `bookingView`…) |
| Allowed values (governorates, languages, interests, includes, rating keys) | `src/core/catalog.ts`, and live from `GET /meta` |
| The small demo server (adds `/api`, reads the token, saves one JSON file) | `src/server/index.ts` |
| The same API inside the offline phone app | `src/web/demo.tsx` (no HTTP: `window.__TG_LOCAL_API`) |
| How the screens call it | `src/web/lib/api.ts` (`api(method, path, body)`) |

### How to call it

- **Base URL:** `https://<your-server>/api` (for example `POST http://localhost:3000/api/auth/login`). The phone apps use the server set in `API_URL`, or the built-in engine when none is set.
- **Format:** JSON in, JSON out. Dates are `YYYY-MM-DD`; money is US dollars as numbers.
- **Sign in:** `POST /auth/login` with `{ phone, password }` returns `{ token, user }`. The phone is the full number with its country code (`+9647713111325`). Send `Authorization: Bearer <token>` on every other call. Tokens end on sign-out, on a password change, and after 30 days without use. Demo accounts are in [section 8](#8-demo-accounts).
- **Errors:** a non-2xx status with `{ "error": "code", "params": { … } }`, for example `400 {"error":"field_invalid","params":{"field":"cities"}}`. `401` means not signed in, `403` means the wrong role, `404` means not found or not yours, `409` means the record is in the wrong state (for example `request_not_open`), `429` means too many tries (`too_many_attempts`). A call that fails changes nothing.
- **Who:** the "Who" column below is the role the token must have. "Anyone" needs no token; "Signed in" is any role; "Party" means the tourist or guide on that booking.
- **Photos:** send them as `data:image/...;base64` text. Answers carry a link instead (`https://…/media/…`); governorate and event photos keep their `m:<id>` names, and `GET /meta` maps those to links.
- **Rules are on the server:** limits, prices, dates and money are always checked by `src/core/api.ts`, so an agent cannot do anything the app itself would refuse.

### Start and accounts

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `GET /meta` | Anyone | – | Everything needed to fill forms: governorates (`cities`), heritage places, cover photos per governorate, languages, interests, includes, rating keys, fee, prices, dollar-to-dinar rate, `today`, demo logins |
| `POST /auth/register` | Anyone | `role` (`tourist`/`guide`), `name`, `phone` (full number, e.g. `+9647713111325`; must be a valid mobile number and not used by another account), `email`, `password` (8+ with upper, lower, number, symbol), `country`, `gender` (`f`/`m`) | Creates an account and signs in; returns `{ token, user }`. Phone errors: `country_code_required`, `phone_invalid`, `phone_taken` |
| `POST /auth/login` | Anyone | `phone`, `password` | Signs in; returns `{ token, user }` |
| `POST /auth/logout` | Signed in | – | Ends this session |
| `POST /auth/forgot` | Anyone | `phone` | Sends a 6-digit reset code by SMS (valid 15 minutes, 5 tries; on staging it is also returned as `demoCode`). Same answer whether or not the phone has an account |
| `POST /auth/reset` | Anyone | `phone`, `code`, `password` | Sets a new password with the code, signs out other sessions, and signs in; returns `{ token, user }` |
| `POST /me/password` | Signed in | `current`, `password` | Changes the password; other sessions are signed out |
| `GET /me` | Signed in | – | The signed-in user: profile, saved card (brand and last 4 only), unread counts, guide profile, travel passport |
| `PUT /me` | Signed in | any of `name`, `email`, `country`, `phone` (same rules as at sign-up; a new number is not verified), `avatar`, `cover` (images as `data:image/...;base64`, or `null` to remove) | Edits your info and photos |
| `PUT /me/card` | Tourist, Guide | `number`, `name`, `expiry` (`MM/YY`), `cvc` | Saves a payment card (only brand, last 4, name and expiry are kept) |
| `DELETE /me/card` | Tourist, Guide | – | Removes the saved card |
| `POST /me/phone-code` | Signed in | – | Sends a verification code by SMS to your phone |
| `POST /me/verify-phone` | Signed in | `code` | Marks the phone verified (the SMS code; on staging the demo code also works) |
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
| `GET /guides` | Anyone | query: `q`, `city`, `lang`, `spec`, `maxPrice`, `minRating`, `from`, `to` (free on those dates), `verified=1`, `female=1`, `promoted=1`, `sort` (`best`/`rating`/`price_low`/`price_high`/`tours`) | Searches guides |
| `GET /guides/:id` | Anyone | – | A guide's full page: bio, languages, places, price, calendar, photos, track record, reviews. For a signed-in tourist, `forMe` shows their booking, pending offer and open requests with this guide |
| `PUT /guide/profile` | Guide | any of `headline`, `headlineAr`, `bio`, `bioAr`, `pricePerDay`, `cities`, `languages` (`[{code, level}]`), `specialities`, `places`, `blockedDates`, `photos`, `acceptsCash` | Edits the guide profile |
| `POST /guide/photos` | Guide | `img`, `caption`, `captionAr` | Adds a tour photo (up to 12) |
| `POST /guide/verification` | Guide | `idFront`, `idBack`, `residence` (image data URLs) | Sends the ID front, ID back and residence card to the team. Needed before `PUT /guide/profile` (otherwise `verify_first`) |
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

### Bookings and payments

A card booking is **one full payment**. The platform holds it and the admin moves it with `POST /admin/bookings/:id/payout`. The per-day endpoints below answer `admin_pays` for card bookings; only `cash-received` is used, for cash bookings.

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `GET /bookings` | Signed in | – | Your bookings |
| `GET /bookings/:id` | Party | – | One booking with its days (milestones), money held, released and refunded |
| `POST /bookings/:id/confirm` | Guide | – | Confirms a hire; the other offers close |
| `POST /bookings/:id/decline` | Guide | – | Declines; the tourist is refunded and the request reopens |
| `POST /bookings/:id/cancel` | Party | `reason` | Cancels (free before the first day; held money returns) |
| `POST /milestones/:id/request-release` | Guide | – | Card bookings: `admin_pays` |
| `POST /milestones/:id/release` | Tourist | – | Card bookings: `admin_pays` |
| `POST /milestones/:id/refund` | Guide | – | Card bookings: `admin_pays` |
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
| `GET /dashboard` | Signed in | – | The home screen data for the signed-in role. Tourists also get `offers` (waiting for an answer) and `events` (upcoming special events) |
| `GET /events` | Anyone | `all=1` (admin: include past ones) | Upcoming special events |
| `GET /events/:id` | Anyone | – | One special event |

### Admin

| Endpoint | Who | Send | What it does |
|---|---|---|---|
| `GET /admin/stats` | Admin | – | Platform numbers and statistics per governorate |
| `GET /admin/settings` / `PUT /admin/settings` | Admin | `guideSubscriptionPrice`, `subscriptionDays`, `promotionPrice`, `promotionDays`, `iqdPerUsd` | Reads / changes prices and the dinar rate |
| `GET /admin/verifications` | Admin | – | Guides waiting for verification, with their three `photos` (`idFront`, `idBack`, `residence`) as private links that work for five minutes |
| `GET /admin/payouts` | Admin | – | Card bookings whose payment is waiting: `held`, `fee`, `toGuide`, `ended` |
| `POST /admin/bookings/:id/payout` | Admin | – | Transfers the booking's whole held payment to the guide (minus the service fee) |
| `POST /admin/events` | Admin | `title`, `titleAr`, `city`, `startDate`, `endDate`, `img` (data URL or photo name), optional `venue`, `venueAr`, `description`, `descriptionAr` | Adds a special event |
| `PUT /admin/events/:id` / `DELETE /admin/events/:id` | Admin | same as above / – | Edits or deletes a special event |
| `POST /admin/guides/:id/verify` | Admin | `approve` (true/false), `note` (reason when rejecting) | Verifies or rejects a guide |
| `GET /admin/reports` | Admin | query: `status=resolved` for the decided ones | Reports to decide |
| `POST /admin/reports/:id/resolve` | Admin | `action` (`refund`/`release`/`dismiss`), `note`, `suspend` | Refunds the tourist, pays the guide, or dismisses; can suspend |
| `GET /admin/users` | Admin | query: `q` (name or email) | Searches users |
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

Every change the state account makes (verify or reject, payout, report decision, governorates, events, prices, suspending a user) is written to the audit log, and so is each time it opens the identity photos.

### Using it from an agent or an MCP server

Each endpoint above maps to one tool. A thin MCP server only needs to:

1. Keep a token per user: call `POST /auth/login` once, then send `Authorization: Bearer <token>`.
2. Expose each endpoint as a tool named after it (for example `post_trip` → `POST /requests`, `send_offer` → `POST /requests/:id/offers`, `hire_offer` → `POST /offers/:id/hire`, `pay_guide` → `POST /admin/bookings/:id/payout`, `withdraw` → `POST /wallet/withdraw`), with the "Send" column as its input.
3. Call `GET /meta` first to learn the allowed values (governorate slugs, languages, rating keys), and pass errors back as they come (the `error` code says exactly what to fix).

Typical flows:

- **Tourist books a guide:** `GET /meta` → `POST /requests` → wait for offers (`GET /requests/:id`) → `POST /offers/:id/hire` → `POST /bookings/:id/review`.
- **Guide finds work:** `POST /guide/verification` (once, then wait for the admin) → `PUT /guide/profile` → `GET /requests` → `POST /requests/:id/offers` → `POST /bookings/:id/confirm` → the admin pays → `POST /wallet/withdraw`.
- **Admin's daily check:** `GET /admin/verifications` → `POST /admin/guides/:id/verify`; `GET /admin/payouts` → `POST /admin/bookings/:id/payout`; `GET /admin/reports` → `POST /admin/reports/:id/resolve`; `POST /admin/events` for a new special event.

To add an endpoint, add one `route(...)` call in `src/core/api.ts`, a test in `src/core/api.test.ts`, a step in `src/api/contract.test.ts` (its last test fails if an endpoint is never compared), and a row in this table.

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

- **Production:** [docs/DEPLOY.md](docs/DEPLOY.md) has the steps: the Docker image, PostgreSQL 16, Redis, storage buckets, environment variables, HTTPS, health checks, logs and daily backups.
- **The whole stack on your computer:** `docker compose up --build` (API, PostgreSQL, Redis, MinIO, demo data).
- **A quick demo with no database:** the small demo server on any host that runs Node 22 (`npm install && npm run build`, then `node dist/server.mjs`; `render.yaml` sets this up on Render).
- **No server at all:** `npm run build:demo` and host `dist/demo/index.html` anywhere. Each visitor gets their own copy of the demo.

## 15. Known limits

- **Payments are simulated.** They sit behind a `PaymentProvider` interface (`src/api/payments.ts`) with a stub for a real Iraqi provider. A real provider will need its own card form: card numbers must not pass through this server.
- **SMS is not connected.** Codes are written to the server log. Forgot-password and phone verification need a provider that delivers internationally before real users can use them.
- **Each API process keeps the marketplace data in memory** per data version, and changes run one at a time. Correct and fine for a launch; loading only what each call needs is the next step before large data.
- **The trip assistant's own limit is per process**, and the assistant needs a server (it holds the AI key), so the offline phone app shows it only with the pretend AI.
- **Messages and notifications refresh by polling.** Push notifications would need a push service.
- **Sign-in tokens live in the app's local storage.** They are random, stored hashed on the server, expire, and end on sign-out and password change.
- **Country flags** in the phone field are emoji: Windows browsers show two letters instead.

More ideas that were noticed but not done are in [IMPROVEMENTS.md](IMPROVEMENTS.md).
