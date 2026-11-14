# Deploying Trip guide (the production API)

The production app is one Node process (`dist/api.mjs`) that serves `/api` and, if you want, the built website.
It needs **PostgreSQL 16**, and for a real launch **Redis** (rate limits) and **S3-compatible storage** (photos).

> Nothing here has been deployed anywhere. These are the steps for when you decide to.

## 1. What runs where

| Piece | What it is | Notes |
|---|---|---|
| API | `Dockerfile` in this repository (Node 22) | Applies database migrations on start. Stateless: sessions and data are in PostgreSQL |
| PostgreSQL 16 | Your managed database or a server | Needs the `btree_gist` extension (the first start creates it; the database user must be allowed to) |
| Redis 7 | Rate limits for sign-in, sign-up, forgot password | Without `REDIS_URL` limits are counted in memory, which is only right for a single process |
| Storage | Two buckets: one public (photos), one private (ID and residence cards) | Private files are only ever reached through signed links that last five minutes, given to the state account |
| Website | `dist/public`, served by the API process or by any static host | Build with `TG_API_BASE=https://your-api` when it is hosted somewhere else |
| Phone apps | Built by GitHub Actions with `API_URL` | See README section 9 |

## 2. Try the whole stack on your computer

```bash
# .env next to docker-compose.yml, with one line (your own value, never committed):
#   ADMIN_PASSWORD=...
docker compose up --build
```

Open <http://localhost:3000>. This starts the API, PostgreSQL 16 (on port 5433 of your machine), Redis and MinIO, with the demo data.
`docker compose down -v` removes it all again.

## 3. Environment variables

`.env.example` lists every variable with a comment. The ones a real environment must set:

| Variable | Staging | Production |
|---|---|---|
| `APP_ENV` | `staging` | `production` |
| `DATABASE_URL` | `postgres://…` | `postgres://…` (required; the embedded database is refused) |
| `REDIS_URL` | `redis://…` | `redis://…` |
| `TOKEN_SECRET` | 32+ random characters | 32+ random characters, different from staging |
| `ADMIN_PASSWORD` | the state account's password | the state account's password. Only needed until the account exists; you can remove it afterwards |
| `ADMIN_PHONE` | `+9647713111325` (default) | same |
| `SEED_DEMO` | `1` for demo data | never (the API refuses to start) |
| `WEB_ORIGIN` | the website's address | the website's address |
| `PUBLIC_URL` | this API's public address | this API's public address |
| `TRUST_PROXY` | `1` behind a proxy or load balancer | `1` |
| `MEDIA_DRIVER`, `S3_*` | `s3` and the bucket settings | `s3` and the bucket settings |
| `SMS_PROVIDER` | `log` | the real provider, once chosen (not built yet) |
| `PAYMENT_PROVIDER` | `simulated` | `simulated` until a real provider is connected |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | see `docs/AI_ASSISTANT.md` | see `docs/AI_ASSISTANT.md` |

Build flag for the screens: `TG_ENV=production npm run build` (or the Docker build argument `TG_ENV=production`) hides the demo
account picker, the shown reset code, the "demo mode" label on the card form and the demo phone-code hint.

## 4. First start

1. Create the database and the two buckets (the public one readable by anyone, the private one not).
2. Set the variables above and start the container. The log says `data ready` with `"seeded":"production","admin":"created"`.
3. Sign in on the website as the state: country Iraq (+964), number `07713111325`, with the password you set.
4. Change the password from the profile if you wish. The stored hash is what counts from then on; `ADMIN_PASSWORD` is not read again while the account exists.

Production starts with the state account and the eight governorates and their places. Nothing else.

## 5. HTTPS, CORS and limits

- Put the API behind a proxy that ends HTTPS and set `TRUST_PROXY=1`. In production, plain-HTTP calls to `/api` are refused and HSTS is sent.
- CORS allows only `WEB_ORIGIN` and the phone apps' own origins (`capacitor://localhost`, `https://localhost`, `http://localhost`).
- Request bodies are limited to 3 MB, and each photo to the same size the app already enforces.
- Sign-in: 10 wrong passwords for one phone in 15 minutes, then `429 too_many_attempts`. Sign-up, forgot password and reset have their own limits per address.

## 6. Health checks and logs

- `GET /healthz`: the process is up. `GET /readyz`: PostgreSQL (and Redis, when set) answer. The Docker image's health check uses `/readyz`.
- Logs are one JSON object per line on standard output (request id, method, path, status, time). Tokens and cookies are never logged.
  SMS texts appear in the log only with `SMS_PROVIDER=log`.
- Every action of the state account is also written to the `audit_log` table (who, what, on what, when, from which address).

## 7. Daily database backups

A managed PostgreSQL usually does this for you: turn on daily backups with at least 7 days kept, and point-in-time recovery if offered.

On your own server, a daily dump is enough to start with:

```bash
# /etc/cron.d/tripguide-backup — every night at 02:30 server time
30 2 * * * postgres pg_dump --format=custom --file=/var/backups/tripguide/$(date +\%F).dump "$DATABASE_URL" && find /var/backups/tripguide -name '*.dump' -mtime +14 -delete
```

- Copy the dumps off the server (an S3 bucket with versioning, or another machine). A backup on the same disk is not a backup.
- Back up the two storage buckets as well (bucket versioning or replication): the database only holds the photos' names.
- Test a restore every month: `createdb tripguide_restore && pg_restore --dbname=tripguide_restore 2026-11-14.dump`, then start an API against it and sign in.
- The database holds phone numbers, emails and password hashes: keep the dumps as private as the database itself.

## 8. Updating

Deploy the new image; migrations run on start, each in its own transaction. Roll back by deploying the previous image
(migrations so far only add things). Take a backup before a release that changes the database.

## 9. Limits to know before real traffic

- **Memory and write speed.** Each API process keeps a copy of the marketplace data in memory per data version and reloads it after
  every change; changes run one at a time. This is correct and simple, and fine for a launch, but it does not scale to very large
  data. Loading only what each call needs is the planned next step (PLAN.md).
- **SMS** is not connected: codes go to the log. Forgot-password and phone verification cannot work for real users until a provider is added.
- **Payments** are simulated: no real money moves.
- **More than one API process** works (sessions and data are in PostgreSQL, rate limits in Redis), but the trip assistant's own
  limiter is per process.
