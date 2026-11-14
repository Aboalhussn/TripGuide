# Parity proof (section 8 of the brief)

Run on 2026-11-14, branch `production`, Windows 11, Node 24, Chrome. The baseline is `main` @ `d923015`.
Every command below can be run again; each one fails loudly if something differs.

| # | What the brief asks | Command | Result |
|---|---|---|---|
| 1 | The rules tests, run against the new backend | `npm test` | 112 of 112 pass. That includes the 31 scenarios of `src/core/api.test.ts` ported to the API (`src/api/rules.test.ts`), and the new phone tests |
| 2 | The existing browser suite against the new API with the demo seed | `npm run build && npm run e2e:api` | 32 of 32 pass (the 30 original tests and the 2 new phone tests). The same suite on the demo server (`npm run e2e`): 32 of 32 |
| 3 | Contract test: old engine vs new API, same seed, same clock | `npm run parity:contract` | 8 of 8 scenarios pass against the engine exactly as it is on `main`. All 83 endpoints are called on both sides and the JSON is identical |
| 4 | Screenshots at 390x844, both languages, three roles | `npm run parity:screens` | 82 screens: 70 pixel-identical, 12 differ only by the phone field, 0 differ elsewhere |
| 5 | `npm run check` and the APK | `npm run check` | passes (1245 text keys). **The APK was not built here**: see below |

## 1. Rules tests

- `src/api/rules.test.ts` is generated from `src/core/api.test.ts`: same scenarios, same assertions. The differences are mechanical:
  calls are awaited, people sign in by phone, sessions are set long (the scenarios jump weeks ahead; the engine's sign-ins
  never expired), and three assertions that compared a photo to its inline data now compare the stored file's bytes.
- Phone tests: `src/core/phone.test.ts` (validation per country, E.164, leading 0, spaces, dashes, Arabic-Indic and Persian digits,
  pasted `+` number, country code required, the country search) and `src/api/account.test.ts` (uniqueness, phone sign-in,
  SMS reset, the state account from `ADMIN_PASSWORD`, argon2id, hashed tokens with expiry, production switches).
- `src/api/money.test.ts`: two hires at the same moment, a double payout, a double withdrawal, a refused card, a lapsed hire,
  the audit log, private ID photos.

## 2. Browser suite

Changes made to `e2e/flows.test.ts`, all of them listed here:

| Change | Why |
|---|---|
| `login()` fills the phone field; a small table maps the demo emails the tests use to their phones | allowed by the brief |
| Sign-up and forgot-password steps fill the phone | allowed by the brief |
| Two API calls made by a test (`/auth/register`, `/auth/login`) send a phone | they are sign-up / sign-in steps |
| The server start line accepts `E2E_SERVER=dist/api.mjs`, and waits longer for it to start | needed to run the suite against the new backend at all |
| Two photo assertions accept a media link as well as inline data | approved by you; the brief itself asks for links |
| The forgot-password step waits for the reset screen before filling the phone | approved by you; without it the step failed about half the time on Linux, because the sign-in screen has a Phone field too |
| Two new tests: the country picker, and a non-Iraqi sign-up | asked for by the brief |

No other test was touched.

## 3. Contract test

`src/api/twin.ts` runs each call on the old engine and on the new API and compares status and JSON.
Allowed to differ, and nothing else: sign-in tokens, one-time codes, pictures (inline data vs media links), and, against `main`,
the phone number itself and the demo sign-in list (emails on `main`, phones now).

- 83 endpoints: the 80 of the demo, `POST /me/phone-code` (new), and the 2 assistant routes. The last test fails if any is never compared.
- About 600 calls, success and error answers, across 7 scenarios.
- 11 calls exist only because of phone sign-in and have nothing to be compared with on `main`
  (phone required / invalid / taken on sign-up and in Your info, and sending the SMS code). The run prints them.
- **One intended difference**, with its own test: a call that fails saves nothing on the API, while the engine can keep half of it
  (rejecting a guide without a reason leaves the guide rejected in the engine). You approved this as question 7.

Differences the contract tests found on the way, all fixed in the API: a chat's read mark showing late; ids being reused after
a failed call; a suspension that came with a report decision signing the account out.

## 4. Screenshots

Both apps are started at the same moment with the demo data and photographed in Chrome with animations off.
Pictures and the full table are written to `.parity/screens` (not committed).

- Identical (70): every home, guides, guide page, post, requests, offers, bookings, messages, notifications, wallet, profile,
  settings, trips, passport, events and every state screen, in both languages.
- Different, allowed (12): sign-in, sign-up, forgot password, and Your info for each role, in both languages.
- One finding, fixed: the state's verification page showed the guide's phone as `+9647700001004` instead of `+964 770 000 1004`.
  Stored numbers are now shown with spaces there, and the page is pixel-identical again.

## 5. Check and APK

- `npm run check`: passes.
- `API_URL=<server> npm run build:app` and `npx cap sync android`: both work; the app files point at the server.
- `./gradlew assembleDebug`: **fails on this machine** with `invalid source release: 21`. The Android project needs Java 21;
  this machine has Java 8 and 17. The GitHub workflow uses Java 21, so the APK build has to be confirmed there (M7).

## Real PostgreSQL 16, Redis and storage (added in M7)

- `TEST_DATABASE_URL=postgres://… npm test`: **112 of 112 pass on PostgreSQL 16.15** (Docker), each test in its own fresh database.
  This includes the money tests where two calls arrive at the same moment (two hires of one guide, a double payout, a double
  withdrawal), now with real concurrent connections and real row locks.
- `docker compose up --build`: the API image builds and starts against PostgreSQL 16, Redis 7 and MinIO; `/readyz` answers
  `{"ok":true,"database":"postgres","redis":true}`; the demo data is seeded and the state account created; a restart finds both.
  Checked over HTTP: sign-in, a profile photo stored in the public bucket and served from it, an ID photo reachable only through
  its signed link (200 with the signature, 403 without), and the Redis rate limit (the 11th wrong password answers 429).
- The GitHub workflow runs the same tests against a PostgreSQL 16 service on every push.

## What this proof does not cover

- **The browser suite on PostgreSQL.** `npm run e2e:api` uses the embedded database; the rules, money and contract tests are the ones that ran on PostgreSQL 16.
- **The APK.** It needs Java 21, which this machine does not have. The workflow builds it; that run has not happened yet because nothing has been pushed.
- **The GitHub workflow itself** has been rewritten but never run, for the same reason.
- **Scale.** Each API process keeps a copy of the whole data set in memory per data version, and writes run one at a time (PLAN.md).
- **Real SMS and real payments.** Both are behind interfaces with a log sender and a simulated provider.
