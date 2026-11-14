# PLAN — Trip guide: from demo to production

Branch: `production` (from `main` @ `d923015`). Status: **all milestones M1–M7 done on the local `production` branch. Nothing is pushed, merged, released or deployed.** Results: `PARITY.md`. Deployment: `docs/DEPLOY.md`.

How M3 was built (a change from section 3, said plainly): instead of rewriting each rule in SQL, every marketplace call loads the
rows from PostgreSQL, runs the engine's own handler from `src/core/api.ts` inside one transaction, and saves exactly what it changed
(`src/api/world.ts`). Writers hold a write lock plus row locks on the booking, its days and the guide. This keeps the rules
identical by construction. The cost: each API process keeps a copy of the whole data set in memory per data version, and writes run
one at a time. Narrower per-route loading is the remaining scaling work. Because of this, the M4 and M5 endpoints already answer; M4 and M5
now mean verifying them, not writing them.

Decisions taken when the plan was approved (my recommended answers to section 10):
Q1 build fix committed · Q2 phone sign-in added to `src/core` too, the engine frozen at `main` is the parity baseline ·
Q3 demo data has its own demo admin (`+9647700001000`, `Demo@1234`), the real state account `+9647713111325` comes from `ADMIN_PASSWORD` ·
Q4 SMS goes to the log until a provider is chosen · Q5 phone verification sends a real SMS code (new `POST /me/phone-code`), the demo code works on staging only, no SMS at sign-up ·
Q7 a failed call saves nothing · Q8 the state account's email is empty unless `ADMIN_EMAIL` is set · Q9 sessions last 30 days and are extended by use ·
Q10 new error `too_many_attempts` · Q12 the branch stays local until you ask · Q13 no existing users to migrate.
Still open: Q4 (SMS provider), Q6 (payment provider), Q11 (staging URL and storage).

Rule 0 applies to everything below: the app must look and behave exactly like the demo. The only user-facing
change is sign-in / sign-up by phone number. Anything else I think should change goes to `IMPROVEMENTS.md`, not into code.

---

## 1. Baseline (before any change)

Machine: Windows 11, Node 24.22.1 (the project targets Node 22; Docker and CI will pin 22), Chrome as `CHROMIUM_PATH`.

| Step | Result |
|---|---|
| `npm install` | OK |
| `npm run check` | OK — `tsc` clean, `1237 keys used, 0 problems` |
| `npm test` | OK — 50 tests, 50 pass, 0 fail |
| `npm run build` | **Fails on Windows only**, see below. Passes with a one-line fix |
| `CHROMIUM_PATH=… npm run e2e` | OK — 30 tests, 30 pass, 0 fail (107 s, Chrome, after the build fix) |

**Windows build bug (not user-facing).** `scripts/build.mjs` line 6 uses `new URL(import.meta.url).pathname`, which on
Windows gives `/C:/…` and resolves to `C:\C:\…` (`ENOENT … src\config\brand.ts`). Linux/macOS/CI are not affected.
Fix: `fileURLToPath(import.meta.url)`. It is applied in my working tree so I could build, but **not committed** — see question Q1.

Also noted while cloning: the iOS splash file names plus a deep folder exceed Windows' 260-character path limit;
`git config core.longpaths true` (local to the clone) solves it. Nothing to change in the repo.

---

## 2. What the code does today (source of truth: code + e2e, not the README)

- `src/core/api.ts` holds **80 routes**; `src/server/assistant.ts` adds **2** (`/assistant/status`, `/assistant/trip`). Total 82.
- The engine is synchronous over one in-memory `Data` object. Every call: resolve the session → run `sweep()`
  (expire hires past `confirmBy`) → run the handler → return `200` + body, or `{error, params}` with the status.
- Ids come from per-table counters (`data.seq`), except passport pages, withdrawals, media, events and places, which use `max(id)+1`.
- "Today" is the Iraq date (UTC+3) of `Platform.now()`. Timestamps are ISO strings with milliseconds, `Z`.
- Money is plain JS numbers; `money()` rounds to 2 decimals. Offer prices and budgets are **not** rounded on input.
- Transport-level answers in `src/server/index.ts`: body over 3 MB → `413 too_large`; bad JSON → `400 bad_json`;
  unknown path → `404 not_found`; known path, wrong method → `405 method_not_allowed`; crash → `500 server_error`.

Places where the README and the code disagree (code wins, the new API follows the code):

| README says | Code does |
|---|---|
| `GET /admin/users` query `query` | query **`q`** |
| `GET /guides` filters | also `promoted=1` |
| `GET /admin/reports` | also `status=resolved` |
| "Release a day's payment" rules (section 13) | card bookings answer `409 admin_pays`; the three day endpoints only reach their logic for **cash** bookings |
| "reset demo data" UI | `window.__TG_DEMO.reset()` exists but no screen calls it (nothing to hide; I will keep it out of production builds anyway) |

Behaviours I will reproduce on purpose because the demo has them:

- `POST /auth/forgot` answers `{sent:true}` whether or not the account exists, and never sends a code to an admin.
- `POST /auth/reset`: 5 wrong tries lock the code; a wrong try is counted even though the call fails.
- `GET /threads/:id` marks the thread read (a GET that writes).
- `sweep()` runs on every request, so an expired hire flips the moment anyone calls the API.
- A suspended user keeps read access; `needActive` routes answer `403 account_suspended`. Suspending deletes their sessions.
- Tourists are shown as "First L." everywhere except to themselves and the admin user list.

---

## 3. Target architecture

**Stack (the recommended one, no deviation):** Node 22 + TypeScript, Fastify 5, PostgreSQL 16, Drizzle ORM + SQL migrations,
Redis (rate limits), S3-compatible storage (MinIO in dev, local disk option), argon2id (`@node-rs/argon2`), `libphonenumber-js` (front and back),
pino structured logs.

**One deliberate nuance about Zod.** The current validators (`str`, `num`, `strList`, `optStr` in `src/core/util.ts`) decide
*which* error code and params come back and *in which order* fields are checked. Zod reports differently, so for request
bodies I reuse those helpers unchanged. Zod is used for environment config and for the transport envelope only. This is the safest way to keep error parity.

**Layout (new code only; `src/core` and `src/web` stay where they are):**

```
src/api/            Fastify app
  app.ts            routes, error mapping, CORS, body limit, health
  routes/*.ts       one file per area, same order as src/core/api.ts
  services/*.ts     database-backed rules (auth, requests, offers, bookings, payments, wallet, …)
  slices.ts         loads only the rows a view needs into a partial `Data` object
  clock.ts          injectable clock (same shape as Platform.now)
  phone.ts          E.164 parsing/validation shared with the web
  sms/              SmsSender interface: LogSender (dev/test), provider stub (prod)
  payments/         PaymentProvider interface: SimulatedProvider (default), Iraqi provider stub
  storage/          MediaStore interface: disk (dev), S3 (prod), signed URLs
  audit.ts          admin (state) action log
src/db/             schema.ts (Drizzle), migrations/, seed.ts (`seed --demo` / production)
test/               ported rule tests, contract diff, screenshot diff
```

**How parity is kept without loading the whole database.** `src/core/views.ts` (`publicUser`, `guideCard`, `guideStats`,
`bookingMoney`, `reviewView`, …) takes a `Data` object. Each service loads a *scoped slice* (for example: the guides on
this page plus their bookings, reviews, threads and messages) into a partial `Data` and calls the **same view functions**.
Shapes, rounding and ordering therefore come from the existing code, not from a rewrite. Writes are explicit SQL.

**Transactions and locks.**

| Action | Lock |
|---|---|
| Hire (`POST /offers/:id/hire`) | tx; `FOR UPDATE` on the request, the offer and the guide profile row; availability re-checked inside; charge → booking → milestones in one tx |
| Confirm / decline / cancel | tx; `FOR UPDATE` on the booking and the guide profile row |
| Admin payout, report resolution (refund/release) | tx; `FOR UPDATE` on the booking and its milestones; only `held`/`release_requested` rows move, so a second call finds nothing (`409 nothing_to_pay`) |
| Cash received | tx; `FOR UPDATE` on the milestone |
| Wallet withdraw | tx; `FOR UPDATE` on the user row; balance recomputed inside |
| Subscription / promotion purchase | tx; `FOR UPDATE` on the guide profile |
| Lapse sweep | tx; `FOR UPDATE SKIP LOCKED` on expired `awaiting_guide` bookings |

Extra guard against double booking: a Postgres exclusion constraint (`btree_gist`) on `(guide_id, daterange)` for bookings in
`awaiting_guide | confirmed | disputed`. The rules already prevent it; the constraint makes it impossible even under a race.

**Clock.** One `Clock` (`now(): Date`) injected into the app; tests and the contract runner move it. Production uses the system clock.

**Sweep.** Runs at the start of each request exactly as today (one indexed query), so behaviour and notification
timestamps are identical under the same clock. A background timer can be added later without changing results.

**Old engine stays.** `src/core` keeps working for the offline demo build. See Q2 for the one unavoidable conflict.

---

## 4. Database schema (PostgreSQL 16)

Conventions: `bigint` ids that reproduce today's numbering (so seeds and the contract diff line up); `timestamptz(3)` serialised
with `toISOString()`; dates as `date` returned `YYYY-MM-DD`; amounts as unconstrained `numeric` (exact round trip of today's JS
numbers, no rounding changes); string lists as `text[]`; structured lists as `jsonb` where today's shape is a nested list.

| Table | Columns (key ones) | Notes |
|---|---|---|
| `users` | id, role, name, email (unique, lower), **phone (E.164, unique, not null)**, password_hash, country, gender, avatar_color, avatar_media_id, cover_media_id, phone_verified, payment_verified, status, created_at | |
| `saved_cards` | user_id PK, brand, last4, name, expiry | never number or CVC |
| `guide_profiles` | user_id PK, headline(+ar), bio(+ar), price_per_day, cities text[], languages jsonb, specialities text[], places bigint[], blocked_dates date[], verification, verification_note, verification_docs text[], verification_requested_at, accepts_cash, subscription_until, promoted_until | |
| `guide_photos` | id, guide_id, position, img (`lib:<name>` or media id), caption, caption_ar | order kept |
| `verification_photos` | guide_id PK, id_front_media, id_back_media, residence_media | private bucket, admin only, signed URLs |
| `cities` | slug PK, name, name_ar, position | governorates |
| `city_covers` | city_slug, position, ref (`file.jpg` or `m:<id>`) | |
| `places` | id, city_slug, name, name_ar, kind | id = max+1 like today |
| `media` | id, kind (cover/avatar/guide/passport/event/id), storage_key, content_type, bytes, private, created_at | API keeps `m:<id>` |
| `special_events` | id, title(+ar), description(+ar), city_slug, venue(+ar), start_date, end_date, img ref, created_at | |
| `platform_settings` | single row: guide_subscription_price, subscription_days, promotion_price, promotion_days, iqd_per_usd | prices + USD→IQD |
| `trip_requests` | id, tourist_id, title, description, cities text[], places bigint[], start_date, end_date, group_size, languages text[], interests text[], budget_min, budget_max, urgent, female_guide, status, direct_guide_id, cover, invited bigint[], created_at | |
| `request_plan_days` | request_id, idx, title, details | tourist's optional plan |
| `offers` | id, request_id, guide_id, price, includes text[], message, status, shortlisted, created_at, updated_at | |
| `offer_plan_days` | offer_id, idx, title, details | |
| `bookings` | id, request_id, offer_id, tourist_id, guide_id, title, start_date, end_date, group_size, total, fee_rate, payment_method, card_last4, status, status_before_dispute, created_at, confirm_by, confirmed_at, completed_at, cancelled_at, cancelled_by, cancel_reason | + exclusion constraint |
| `milestones` | id, booking_id, idx, date, title, amount, status, funded_at, settled_at | |
| `payments` | id, user_id, purpose, ref_id, amount, brand, last4, status, provider, provider_ref, created_at | `CardPayment` today + provider fields |
| `wallet_transactions` | id, user_id, kind, booking_id, milestone_id, amount, fee, at | ledger written in the same tx as each money move; `GET /wallet` output still equals today's computed list |
| `withdrawals` | id, user_id, amount, brand, last4, provider_ref, created_at | |
| `threads` | id, tourist_id, guide_id, request_id, created_at, last_at; unique (tourist, guide, request) | |
| `thread_reads` | thread_id, user_id, last_message_id | today's `readAt` map |
| `messages` | id, thread_id, sender_id, body, created_at | |
| `notifications` | id, user_id, type, params jsonb, link, read, created_at | |
| `reviews` | id, booking_id, author_id, subject_id, author_role, overall, ratings jsonb, hire_again, comment, created_at; unique (booking, author) | |
| `reports` | id, booking_id, reporter_id, against_id, reason, details, status, resolution, admin_note, created_at, resolved_at | |
| `passport_pages` | (user_id, id) PK, media_id, place, city_slug, date, note, created_at | id per user = max+1 like today |
| `sessions` | token_hash PK (sha256), user_id, created_at, expires_at, revoked_at | raw token never stored |
| `password_resets` | user_id PK, code_hash, expires_at, tries | 15 minutes, 5 tries |
| `phone_codes` | user_id, phone, code_hash, expires_at, tries | only if Q5 = real SMS verification |
| `audit_log` | id, admin_id, action, target_type, target_id, details jsonb, ip, at | every state action |

Media rule: the API keeps `m:<id>` keys. `meta.media` maps them to URLs. Fields that today carry a data URL (`avatar`,
`cover`, guide photo `img`, passport `img`) carry a URL instead. `PUT /guide/profile` re-sends the existing photo list, so
the server accepts back the values it issued. ID / residence photos live in a private bucket and are returned only by
`GET /admin/verifications` as short-lived signed URLs.

---

## 5. Endpoint inventory (generated from `src/core/api.ts`, 80 routes, + 2 assistant routes)

Legend — Who: `any` no token · `in` signed in · `in*` signed in and not suspended · `T`/`G`/`A` tourist/guide/admin · `party` tourist or guide on that booking (admin may read).
All errors are `{error, params}`. Every route can also answer `401 login_required` (when a token is needed) and `403 forbidden` (wrong role); `in*` routes add `403 account_suspended`. Field helpers answer `400 field_required | field_too_short | field_too_long | field_invalid | field_range` with `params.field`. `MeView` = `GET /me` shape. `BookingView` = booking + milestones + money + tourist + guide + request + offer + report + review flags + today.

### Meta, auth, account

| # | Method Path | Who | Request | Response | Specific errors |
|---|---|---|---|---|---|
| 1 | GET /meta | any | – | cities, cityCovers, generalCovers, media, places, placeKinds, languages, levels, interests, includes, guideRatingKeys, touristRatingKeys, photoLibrary, feeRate, payments{methods, cardSandbox, testCards, guideSubscriptionPrice, subscriptionDays}, iqdPerUsd, confirmWindowHours, demoPhoneCode, demoLogins, today | – |
| 2 | GET /assistant/context | T* | – | today, tourist, cities, places, languages, interests, limits, guidePrices | – |
| 3 | POST /auth/register | any | role, name, email, password, country, gender **+ phone (E.164)** | {token, user: MeView} | 400 email_invalid, password_short, password_weak; 409 email_taken; **new: 400 phone_invalid, country_code_required; 409 phone_taken** |
| 4 | POST /auth/login | any | **phone**, password (today: email) | {token, user} | 401 login_failed |
| 5 | POST /auth/forgot | any | **phone** (today: email) | {sent:true, demoCode? (staging only)} | **400 phone_invalid** (today email_invalid) |
| 6 | POST /auth/reset | any | **phone**, code, password | {token, user} | 400 reset_code_invalid, password_short, password_weak |
| 7 | POST /me/password | in | current, password | {ok:true} | 400 password_wrong, password_same, password_short, password_weak |
| 8 | POST /auth/logout | any | – | {ok:true} | – |
| 9 | GET /me | in | – | MeView | – |
| 10 | POST /me/passport | T* | img, place, city, date, note? | PassportView {number, pages, cities} | 400 passport_full, photo_invalid, photo_too_big, date_future |
| 11 | DELETE /me/passport/:id | T | – | PassportView | 404 not_found |
| 12 | PUT /me | in | any of name, country, email, phone, avatar, cover | MeView | 400 email_invalid, phone_invalid, photo_invalid, photo_too_big; 409 email_taken; **new: 409 phone_taken, 400 country_code_required** |
| 13 | PUT /me/card | T*, G* | number, name, expiry, cvc | MeView | 400 card_invalid, card_name_required, card_expiry_invalid, card_expired, card_cvc_invalid; 402 card_declined |
| 14 | DELETE /me/card | in | – | MeView | – |
| 15 | POST /guide/photos | G* | img, caption?, captionAr? | MeView | 400 photos_full, photo_invalid, photo_too_big |
| 16 | POST /me/verify-phone | in | code | MeView | 400 phone_missing, code_wrong |
| 17 | POST /me/verify-payment | T | card | MeView | 400 card_invalid |

### Guides

| # | Method Path | Who | Request | Response | Specific errors |
|---|---|---|---|---|---|
| 18 | GET /guides | any | q, city, lang, spec, maxPrice, promoted, verified, female, from, to, minRating, sort | {guides: GuideCard[], total} | – |
| 19 | GET /guides/:id | any | – | GuideCard + bio, bioAr, places, photos, blockedDates, booked, stats, reviews, forMe | 404 not_found |
| 20 | PUT /guide/profile | G* | any of headline(+Ar), bio(+Ar), pricePerDay, acceptsCash, cities, languages, specialities, places, blockedDates, photos | MeView | 409 verify_first; 400 photo_invalid |
| 21 | GET /guide/promotion | G | – | {price, days, until, active} | – |
| 22 | POST /guide/promotion | G* | card | {price, days, until, active:true} | 409 profile_incomplete; card errors (as #13) |
| 23 | GET /guide/subscription | G | – | {price, days, until, active, acceptsCash, history} | – |
| 24 | POST /guide/subscription | G* | card, acceptCash? | {price, days, until, active:true, acceptsCash} | card errors |
| 25 | POST /guide/verification | G* | idFront, idBack, residence | MeView | 409 already_verified, verification_pending; 400 photo_invalid, photo_too_big |
| 26 | GET /users/:id | in | – | PublicUser + stats, reviews, passport — or {redirect} for a guide | 404 not_found |

### Requests and offers

| # | Method Path | Who | Request | Response | Specific errors |
|---|---|---|---|---|---|
| 27 | POST /requests | T* | title, description?, cities, places?, startDate, endDate, groupSize, languages, interests?, budgetMin, budgetMax, urgent?, femaleGuide?, plan?, cover?, directGuideId? | RequestSummary | 400 dates_required, date_past, dates_order, trip_too_long, budget_order, plan_days, guide_unavailable |
| 28 | GET /requests | G, A | q, city, lang, interest, matching | {requests: RequestSummary + invitedMe, myOffer} | – |
| 29 | GET /requests/mine | T | – | {requests: RequestSummary + booking} | – |
| 30 | GET /requests/:id | in | – | RequestSummary + booking + offers (+ invitedGuides or invitedMe) | 404 not_found |
| 31 | POST /requests/:id/close | T | – | RequestSummary | 404; 409 request_not_open |
| 32 | GET /requests/:id/suggested-guides | T | – | {guides: GuideCard + invited} (top 8) | 404 |
| 33 | POST /requests/:id/invite | T* | guideId | {invited} | 404; 409 request_not_open; 400 guide_unavailable |
| 34 | POST /requests/:id/offers | G* | price, plan, includes?, message | OfferView | 400 profile_incomplete, plan_days; 404; 409 request_not_open, offer_exists, busy_those_days |
| 35 | PUT /offers/:id | G* | price, plan, includes?, message | OfferView | 404; 409 offer_locked; 400 plan_days |
| 36 | POST /offers/:id/withdraw | G | – | {ok:true} | 404; 409 offer_locked |
| 37 | POST /offers/:id/shortlist | T | on | {shortlisted} | 404 |
| 38 | GET /offers/mine | G | – | {offers: Offer + request + booking} | – |
| 39 | POST /offers/:id/hire | T* | confirmPayment:true, method, card | BookingView | 404; 409 cannot_hire, guide_unavailable, guide_busy, cash_not_accepted; 400 payment_confirm_required; card errors; 402 card_declined |

### Bookings, payments, reports, reviews

| # | Method Path | Who | Request | Response | Specific errors |
|---|---|---|---|---|---|
| 40 | GET /bookings | in | – | {bookings: BookingView[]} | – |
| 41 | GET /bookings/:id | party | – | BookingView | 404 |
| 42 | POST /bookings/:id/confirm | G* | – | BookingView | 404; 409 booking_state, guide_busy |
| 43 | POST /bookings/:id/decline | G | – | BookingView | 404; 409 booking_state |
| 44 | POST /bookings/:id/cancel | party (not A) | reason? | BookingView | 404; 409 use_decline, tour_started, booking_state |
| 45 | POST /milestones/:id/release | T* | – | BookingView | 404; 409 admin_pays, booking_state, milestone_state |
| 46 | POST /milestones/:id/request-release | G* | – | BookingView | 404; 409 admin_pays, booking_state, milestone_state, day_not_reached |
| 47 | POST /milestones/:id/refund | G | – | BookingView | 404; 409 admin_pays, booking_state, milestone_state |
| 48 | POST /milestones/:id/cash-received | G* | – | BookingView | 404; 409 not_cash_booking, booking_state, milestone_state, day_not_reached |
| 49 | POST /bookings/:id/report | party (not A) | reason, details | BookingView | 404; 409 booking_state, report_exists |
| 50 | POST /bookings/:id/review | party (not A) | ratings, comment, hireAgain? | BookingView | 404; 409 booking_state, review_exists |

### Messages, notifications, wallet, dashboard, events

| # | Method Path | Who | Request | Response | Specific errors |
|---|---|---|---|---|---|
| 51 | GET /threads | in | – | {threads: ThreadView[]} | – |
| 52 | POST /threads | T*, G* | guideId or touristId, requestId? | ThreadView | 400 guide_unavailable; 404; 403 cannot_message |
| 53 | GET /threads/:id | party, A | – | ThreadView + messages, guideId, touristId, request, offer, booking, responseMinutes (marks read) | 404 |
| 54 | POST /threads/:id/messages | T*, G* | body | Message | 404 |
| 55 | GET /notifications | in | – | {notifications (60), unread} | – |
| 56 | POST /notifications/read-all | in | – | {ok:true} | – |
| 57 | POST /notifications/:id/read | in | – | {ok:true} | 404 |
| 58 | POST /wallet/withdraw | T*, G* | amount? | {withdrawal, available, withdrawn} | 409 card_required, nothing_to_withdraw; 400 withdraw_too_much |
| 59 | GET /wallet | T, G | – | role, held, released, refunded, fees, cashPaid, cashDue, thisMonth, transactions (80), available, withdrawn, card | – |
| 60 | GET /dashboard | in | – | per role: tourist / guide / admin shapes | – |
| 61 | GET /events | any | all=1 (admin) | SpecialEvent[] | – |
| 62 | GET /events/:id | any | – | SpecialEvent | 404 |

### Admin (the state)

| # | Method Path | Who | Request | Response | Specific errors | Audit |
|---|---|---|---|---|---|---|
| 63 | GET /admin/stats | A | – | {cities, totals, languages} | – | – |
| 64 | GET /admin/settings | A | – | settings + activeSubscriptions | – | – |
| 65 | PUT /admin/settings | A | any of the 5 prices/rates | same | 400 field_range | price_change |
| 66 | GET /admin/verifications | A | – | {guides: GuideCard + email, phone, docs, photos, requestedAt, bio} | – | view of ID photos logged |
| 67 | POST /admin/guides/:id/verify | A | approve, note | {verification} | 404; 409 verification_state | guide_verify / guide_reject |
| 68 | GET /admin/reports | A | status | {reports + reporter, against, booking, messages(12), threadParticipants} | – | – |
| 69 | POST /admin/reports/:id/resolve | A | action, note?, suspend? | {ok:true} | 404; 409 report_resolved | report_resolve (+ refund/release, suspend) |
| 70 | GET /admin/cities | A | – | AdminCity[] | – | – |
| 71 | GET /admin/cities/:slug | A | – | AdminCity | 404 | – |
| 72 | POST /admin/cities | A | name, nameAr, places, covers | AdminCity | 409 city_exists; 400 photo_invalid | city_create |
| 73 | PUT /admin/cities/:slug | A | same | AdminCity | 404; 409 city_exists | city_update |
| 74 | GET /admin/payouts | A | – | {waiting, total} | – | – |
| 75 | POST /admin/bookings/:id/payout | A | – | BookingView | 404; 409 not_card_booking, booking_state, nothing_to_pay | payout |
| 76 | POST /admin/events | A | title, titleAr, city, startDate, endDate, img, venue?, venueAr?, description?, descriptionAr? | SpecialEvent | 400 date_past, photo_invalid, photo_too_big | event_create |
| 77 | PUT /admin/events/:id | A | same | SpecialEvent | 404 | event_update |
| 78 | DELETE /admin/events/:id | A | – | {ok:true} | 404 | event_delete |
| 79 | GET /admin/users | A | q | {users (100)} | – | – |
| 80 | POST /admin/users/:id/status | A | status | {status} | 404 | user_suspend / user_reactivate |

### Trip assistant (`src/server/assistant.ts`, behaviour kept exactly)

| # | Method Path | Who | Request | Response | Specific errors |
|---|---|---|---|---|---|
| 81 | GET /assistant/status | any | – | {enabled} | – |
| 82 | POST /assistant/trip | T* | messages, draft, lang | reply, draft, missing, problems, suggestions, ready | 400 field_required(messages); 429 too_many_requests; 503 assistant_off, ai_unavailable; 504 ai_timeout |

New, outside `/api` business routes: `GET /healthz` (process up) and `GET /readyz` (database + Redis reachable).

---

## 6. Phone sign-in (the only feature change)

- **Shared module** `phone.ts` (web and API): strip spaces/dashes, convert Arabic-Indic and Persian digits, drop a leading
  national `0`, accept a pasted `+…` number and switch the picker to its country, validate for the chosen country with
  `libphonenumber-js` (max metadata, so "mobile" can be checked; in countries where mobile and landline cannot be told apart, e.g. the US, valid numbers are accepted), output E.164.
- **Sign-in screen:** the email field becomes the two-part phone field (country picker + number, `inputMode="tel"`, LTR),
  same position and style. Demo sheet shows the demo phone numbers instead of emails (staging only).
- **Create account:** required phone field right after full name; email field unchanged.
- **Country picker:** a sheet built from the existing `Modal`, searchable by Arabic name, English name or dial code; 🇮🇶 +964 preselected.
  Country names come from `Intl.DisplayNames` (no new translation table to maintain), with the ISO code as fallback.
- **Forgot password:** same two steps; the code goes by SMS. Link carries `?phone=` instead of `?email=`.
- **Your info:** the phone row becomes the same two-part field; changing it re-validates, checks uniqueness and clears "verified".
- **Strings (both languages, `npm run check` must pass):** `err.phone_taken`, `err.country_code_required`,
  `field.countryCode`, picker search/title strings, a rate-limit message for sign-in (see Q10). Two existing strings must
  change wording because they mention email: `err.login_failed` ("That email and password don't match") and the forgot-password helper text.
- **API:** `POST /auth/login {phone, password}`, `POST /auth/register {…, phone}`, `POST /auth/forgot {phone}`,
  `POST /auth/reset {phone, code, password}`, `PUT /me {phone}`. Server re-validates with the same library; the client's E.164 is never trusted.
- **Production flag** `TG_ENV=production|staging` (build-time): production hides the demo account picker, the shown reset
  code, the "demo mode" pill and "use test card" button on the card form, and the demo phone-code note. The API mirrors it:
  in production `demoLogins` is `null`, `demoCode` is never returned.

---

## 7. Security, payments, SMS, assistant

- **Passwords** argon2id. **Tokens** 32 random bytes, stored as SHA-256, with expiry (Q9), revoked on sign-out and on password change/reset (other sessions, as today).
- **Rate limits** (Redis; in-memory fallback for tests): sign-in, register, forgot, reset — per IP and per phone; assistant — per token, same numbers as `RateLimiter` today.
- **CORS** limited to `WEB_ORIGIN` + `capacitor://localhost`, `https://localhost`. HTTPS enforced behind the proxy (HSTS, `x-forwarded-proto` check). Body limit 3 MB; per-field image limits identical to today.
- **SMS** `SmsSender { send(to, text) }`. `LogSender` in dev/tests. Production provider: **I need it from you** (Q4).
- **Payments** `PaymentProvider { charge, refund, payout }`. `SimulatedProvider` reproduces today exactly (Luhn, test cards, `402 card_declined`) and is the default. `IraqiProviderStub` with TODOs. Needs from you: Q6.
- **Assistant** `ai.ts`, `assistant.ts`, `mock-ai.ts` reused as they are; the handler is mounted on Fastify; only the limiter storage moves to Redis.
- **Audit log** on every admin write (table above).
- **Admin (state) account** created on first start from `ADMIN_PASSWORD`, phone `+9647713111325`, hash only. `.env` is gitignored; `.env.example` has `ADMIN_PASSWORD=` empty. The value never appears in code, seeds, tests, logs, commits or docs.

---

## 8. Proof of parity (section 8 of the brief)

1. **Ported rule tests**: `src/core/api.test.ts` (31 tests) and `src/server/assistant.test.ts` run against the new API through
   `fastify.inject` with a test clock and a throw-away Postgres schema. Only sign-in/sign-up calls change. Plus new phone tests.
2. **Existing Playwright suite** against the built web app + new API + demo seed. Only `login()` and the sign-up steps change. New e2e for the picker and a non-Iraqi sign-up.
3. **Contract diff**: the *frozen* engine from `main` and the new API get the same seed and clock; a scripted scenario touches all
   82 endpoints (success and main error paths); JSON is diffed after masking media URLs, tokens and `phone`. Target: zero differences.
4. **Screenshot diff** at 390×844, Arabic and English, all three roles, old demo vs new app (pixelmatch). Allowed to differ: sign-in, sign-up, Your info.
5. `npm run check` passes and the APK builds (in CI; I have no Android SDK on this machine — I will say so plainly if I cannot build it locally).

---

## 9. Milestones

| | Delivers | How you try it |
|---|---|---|
| **M1** | This plan | Read it, answer section 10 |
| **M2** | Schema + migrations, seed (`--demo` / production), phone auth (API + screens), admin from `ADMIN_PASSWORD`, `/meta`, media store, docker-compose (api, postgres, redis, minio) | `docker compose up`, sign up with a phone, sign in, forgot password (code in the API log) |
| **M3** | Requests, offers, hiring, bookings, payments, wallet, subscription/promotion | Post → offer → hire → confirm → withdraw in the app |
| **M4** | Messages, notifications, passport, events, reviews, reports | Chat, passport, report and review flows |
| **M5** | Admin (state) with audit log, governorates, payouts, assistant | Sign in as the state, verify, pay out, resolve; chat with the mock assistant |
| **M6** | Parity proof (section 8), report of results | Run the four commands; read the diff reports |
| **M7** | Production Dockerfile, `.env.example`, health checks, logs, backup doc, GitHub Actions, README | Build the image; read the README |

I stop after each milestone. No merge into `main`, no release, no deployment until you say so.

---

## 10. Open questions (I need your answers)

**Blocking for M2**

- **Q1 — Windows build fix.** May I commit the one-line `scripts/build.mjs` fix (`fileURLToPath`)? Not user-facing; without it nobody can build on Windows.
- **Q2 — Offline demo vs phone sign-in.** The brief says "keep `src/core` working as it is", but the offline demo uses the same
  screens. Once the sign-in screen asks for a phone, the offline engine must accept a phone too, or the offline APK cannot sign in.
  *My recommendation:* add phone sign-in to `src/core` as well (small, mirrored change), and use the engine frozen at `main` as the
  baseline for the contract and screenshot tests. Alternative: retire the offline build. Which one?
- **Q3 — Demo admin on staging.** The real state account is `+9647713111325` with `ADMIN_PASSWORD`. The staging demo picker signs
  in with `Demo@1234`. *Recommendation:* `seed --demo` creates a separate demo admin with its own demo phone and `Demo@1234`
  (staging only); the real state account exists in both and is the only account in production. OK?
- **Q4 — SMS provider.** Which provider (must send internationally), and its credentials/sender ID when ready? Until then everything runs on the log sender.
- **Q5 — Phone verification.** Today `POST /me/verify-phone` accepts the fixed demo code `123456`. In production should it send a
  real SMS code (*recommended*; same screen, only the demo hint hidden)? And should sign-up itself require an SMS code? (You did not ask for that, so my default is no.)
- **Q8 — Admin email.** `users.email` is required and unique today. What email should the state account have, or may it be empty for the admin only?

**Needed later**

- **Q6 — Payment provider (M3 stub only).** Which Iraqi provider (Qi Card, ZainCash, FIB, …)? I will need: API docs, sandbox
  credentials, whether it supports holds/refunds/payouts to guides, saved-card tokens, and webhooks. Note: real gateways
  normally require their own hosted card form, which would change the card screen — that goes to `IMPROVEMENTS.md`, not into this work.
- **Q7 — Atomic errors.** Today a failed call can leave half its changes in memory (e.g. `PUT /me` with a good name and a bad
  email keeps the new name). With database transactions a failed call changes nothing (except the wrong-reset-code counter).
  I consider this the correct reading of "same behaviour"; tell me if you want the old quirk reproduced.
- **Q9 — Session length.** Tokens never expire today. Proposed: 30 days, extended while in use. OK?
- **Q10 — Rate-limit message.** The only existing text (`err.too_many_requests`) says "You sent a lot of messages". For sign-in
  I propose a new code `too_many_attempts` with its own text in both languages. OK?
- **Q11 — Staging and storage.** Staging server URL for `API_URL` in GitHub Actions, the web origin for CORS, and which S3-compatible storage you want in production (all config only; no paid service will be added without asking).
- **Q12 — Pushing.** Should I push the `production` branch to GitHub after each milestone, or keep it local until you ask?
- **Q13 — Existing data.** I assume there are no real users to migrate (demo data only). Correct?
