# Congress Portfolio Tracker

Verified congressional portfolio tracking with a public website and supporting ingestion/notification services.

## What is implemented

- `Next.js` App Router website with:
	- Member holdings list and filter controls
	- Member transaction detail page
	- Asset activity page
	- Admin quarantine page
- API endpoints:
	- `GET /api/members`
	- `GET /api/members/:memberId/transactions`
	- `GET /api/assets/:assetId/activity`
	- `POST /api/alerts/subscribe`
	- `GET /api/alerts/subscribe?token=...`
	- `POST /api/alerts/unsubscribe`
	- `GET /api/system/status`
- Postgres schema and indexes under `sql/`.
- Worker scripts for ingestion, pricing refresh, and alert dispatch.
- Baseline tests and official filing fixtures.

## Architecture summary

- Public UI + API: Next.js (`src/app` + route handlers).
- Data layer: Postgres via `pg` (`src/lib/db/repository.ts`).
- Ingestion: official source connector/parsing scaffolds in `src/lib/ingestion/*` and `scripts/run-ingestion.js`.
- Pricing refresh: `scripts/run-pricing-refresh.js` and `src/lib/scheduling/*`.
- Alerts: subscription endpoints + worker dispatch (`scripts/run-alert-worker.js`).

## Local setup

1. Install dependencies:
	- `npm install`
2. Start local Postgres:
	- `docker compose up -d`
3. Configure environment:
	- `cp .env.example .env`
4. Apply schema:
	- `npm run db:setup`
5. Start web app:
	- `npm run dev`

## Worker runs

- Ingestion: `npm run worker:ingestion`
- Pricing refresh: `npm run worker:pricing-refresh`
- Alert worker: `npm run worker:alerts`

## Test run

- `npm test`

## Important v1 notes

- Public data is verified-only; unresolved rows are quarantined.
- Senate ingestion is operated in strict non-commercial mode with explicit source attribution requirements.
- Email provider integration is currently dry-run logging unless `EMAIL_PROVIDER_API_KEY` wiring is completed to a specific provider API.
- The app and API are database-backed only. If `DATABASE_URL` is missing, pages and APIs return explicit setup-required responses.

## Ingestion runbook

1. Boot Postgres and migrate
	- `docker compose up -d`
	- `npm run db:setup`
2. Smoke ingestion run (current year only)
	- `npm run worker:ingestion -- --mode=backfill --from-year=2026 --to-year=2026`
3. Smoke verification queries
	- `psql "$DATABASE_URL" -c "select count(*) as filing_documents from filing_documents;"`
	- `psql "$DATABASE_URL" -c "select count(*) as normalized_transactions from normalized_transactions;"`
	- `psql "$DATABASE_URL" -c "select count(*) as source_attributions from source_attributions;"`
	- `psql "$DATABASE_URL" -c "select source_system,cursor_key,last_seen_filed_at,last_run_at from ingestion_checkpoints order by last_run_at desc limit 5;"`
4. Full backfill (2019 to current year)
	- `npm run worker:ingestion -- --mode=backfill --from-year=2019 --to-year=2026`
5. Start incremental hourly polling
	- `npm run worker:ingestion -- --mode=hourly --from-year=2019 --to-year=2026`

## Troubleshooting

- Empty UI with setup-required message:
	- `DATABASE_URL` is missing or invalid.
- Empty UI with no setup-required message:
	- DB is connected but ingest may not have run yet.
	- Run smoke ingestion and recheck counts in the runbook.
