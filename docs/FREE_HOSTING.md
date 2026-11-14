# Free hosting for a trial (Render + Supabase)

This puts the real API online at no cost, so several phones share the same data.
It is a **trial setup**, not a launch setup: read "What free means" at the end.

| Piece | Where | Free plan |
|---|---|---|
| The API and the website | [Render](https://render.com), from `render.yaml` | Sleeps after 15 minutes without visitors; the next call takes about a minute |
| PostgreSQL | [Supabase](https://supabase.com) | 500 MB; the project is paused after a week without use |
| Photos | Supabase Storage (S3 protocol) | 1 GB |
| Rate limits | Counted in the API's memory (no Redis) | Fine for one process |

You create the two accounts and type the secrets yourself. Nothing secret goes into the repository.

## 1. Supabase: database and photo storage

1. Sign up at <https://supabase.com> and create a **new project**. Choose a database password and keep it.
2. **Storage → New bucket**, twice:
   - `tripguide-public` with **Public bucket** switched **on**;
   - `tripguide-private` with it switched **off** (ID and residence photos).
3. **Storage → Settings (S3 connection)**: enable the S3 protocol, note the **endpoint** and **region**, and create an **access key** (an id and a secret).
4. **Connect** (top of the project page) → **Session pooler**: copy the connection string and put your database password in it. It looks like
   `postgresql://postgres.<project-ref>:<password>@aws-…pooler.supabase.com:5432/postgres`.

## 2. Render: the API

1. Sign up at <https://render.com> (signing in with GitHub is the simplest) and allow it to see the `TripGuide` repository.
2. **New → Blueprint**, pick the repository and the branch **`production`**. Render reads `render.yaml`.
3. Fill in the values it asks for:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | Your own password for the state account (8+ characters with a capital, a small letter, a number and a symbol) |
| `DATABASE_URL` | The Session pooler string from step 1.4 |
| `S3_ENDPOINT` | `https://<project-ref>.storage.supabase.co/storage/v1/s3` |
| `S3_REGION` | The region shown next to the endpoint |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | The access key from step 1.3 |
| `S3_PUBLIC_URL` | `https://<project-ref>.supabase.co/storage/v1/object/public/tripguide-public` |

4. Deploy. When it is live, open `https://<your-service>.onrender.com/readyz`: it should answer `{"ok":true,"database":"postgres",…}`.
   The website is at the same address.

## 3. The phone app

1. GitHub → the repository → **Settings → Secrets and variables → Actions → Variables** → new variable `API_URL` = `https://<your-service>.onrender.com`.
2. Run the workflow again (Actions → Tests and mobile apps → Run workflow, branch `production`), or push any change.
3. Download the new `trip-guide-android` artifact. Every phone that installs it shares the same data.

## 4. Sign in

- The state account: Iraq +964, `07713111325`, with your `ADMIN_PASSWORD`.
- The demo accounts (password `Demo@1234`) are listed in the README, section 8.

## What free means

- **Slow first call.** After 15 quiet minutes the API sleeps; the app may say it cannot reach the server for up to a minute.
- **Supabase pauses** a project nobody has used for a week; you wake it from its dashboard.
- **Demo data and demo passwords are public.** This setup runs as `staging` with the demo accounts, whose password is in the README. Anyone with the address can sign in as them, including the demo admin. Do not put real people's data here.
- **No SMS.** Reset and verification codes are shown on screen (staging) and written to Render's log.
- **Payments are simulated.**
- For a real launch: `APP_ENV=production`, no demo data, a paid always-on host, daily backups (docs/DEPLOY.md).
