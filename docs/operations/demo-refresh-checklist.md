# Demo Refresh Checklist

This runbook is the Milestone 3 operator checklist for taking an empty or uncertain database state to a usable public demo.

It is intentionally narrow:

- confirm which database target you are about to operate against
- apply schema
- run `demo:refresh`
- verify `/api/system/status`
- verify the public pages

## 0. Confirm the active database target first

Run:

```bash
npm run doctor:env
```

Interpret the result before doing anything destructive:

- `"target": "local"` means the active `DATABASE_URL` points to Postgres running on this machine, typically via `docker compose`.
- `"target": "remote"` means the active `DATABASE_URL` points to hosted Postgres, not a machine-local database.

Stop here if the reported target is not the database you intend to operate against.

Important:

- `.env.local` overrides `.env` for both Next.js and the local scripts.
- If the dev server and the scripts appear to disagree, run `npm run doctor:env` again and resolve that first.

## 1. Start from the intended database state

Choose the path that matches the target from `doctor:env`.

### Machine-local Postgres on this machine

Reset the local Docker-backed database and start clean:

```bash
docker compose down -v
docker compose up -d
npm run db:setup
```

### Hosted or other remote Postgres

Do not run `docker compose down -v` for this path. That only affects containers on this machine and does not reset a hosted database.

For a hosted or otherwise remote target, make sure the database is intentionally empty or in the state you want, then apply schema:

```bash
npm run db:setup
```

## 2. Run the end-to-end demo refresh

Run:

```bash
npm run demo:refresh
```

What this command does:

- applies the latest schema setup path
- attempts official ingestion first
- runs pricing refresh
- applies deterministic fallback seed automatically if ingestion fails or produces `0` verified transactions

What success looks like:

- the command finishes with `[demo-refresh] completed`
- the final summary includes `demoDataMode`
- the final summary includes `ingestion.success: true`

## 3. Start the app and verify system status

Run:

```bash
npm run dev
```

In another shell, check:

```bash
curl -sS http://localhost:3000/api/system/status
```

Minimum truthfulness checks:

- `demoData.mode` is not `empty`
- `latestIngestionRun` is present and `success` is `true`
- `latestPricingRefreshRun` is present and `success` is `true`
- `healthSignals.minutesSinceLastIngestion` is not unexpectedly stale right after refresh

Expected `demoData.mode` values:

- `official-ingestion`: only official verified data is present
- `deterministic-fallback`: fallback seed is active because official ingestion failed or produced no verified transactions
- `mixed`: both official and deterministic fallback data are present

## 4. Verify the public pages

Visit these pages in the browser:

- `/`
- `/assets`
- one member detail page
- one asset detail page

What to confirm:

- the homepage shows member rows rather than an empty state
- member detail pages show the member's real display name, not just the raw ID
- asset detail pages render activity data without server errors
- the app is not showing database setup guidance if the database is configured correctly

If `demoData.mode` is `deterministic-fallback`, these stable demo pages should work:

- `/members/demo-member-mitt-romney`
- `/members/demo-member-nancy-pelosi`
- `/assets/demo-asset-msft`
- `/assets/demo-asset-amzn`

## 5. Verify the fallback path explicitly

Force a year range with no official filings:

```bash
DEMO_FROM_YEAR=2100 DEMO_TO_YEAR=2100 npm run demo:refresh
curl -sS http://localhost:3000/api/system/status
```

Confirm:

- `demoData.mode` reports `deterministic-fallback`
- `latestIngestionRun.mode` reports `backfill`
- the public pages still render usable demo data

## 6. Fast recovery path if something breaks

Start with the smallest checks first:

1. Run `npm run doctor:env` and confirm the target database is the one you intended.
2. Re-run `npm run db:setup`.
3. Re-run `npm run demo:refresh`.
4. Re-check `curl -sS http://localhost:3000/api/system/status`.

If the app and scripts still disagree:

- inspect `.env.local` and `.env`
- remember `.env.local` wins
- confirm both the dev server and your shell are using the same `DATABASE_URL`
