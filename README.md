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
- Data layer: Postgres via `pg` (`src/lib/db/repository.ts`), with in-memory fallback seed data when `DATABASE_URL` is missing.
- Ingestion: official source connector/parsing scaffolds in `src/lib/ingestion/*` and `scripts/run-ingestion.js`.
- Pricing refresh: `scripts/run-pricing-refresh.js` and `src/lib/scheduling/*`.
- Alerts: subscription endpoints + worker dispatch (`scripts/run-alert-worker.js`).

## Local setup

1. Install dependencies:
	- `npm install`
2. Optional environment variables:
	- `DATABASE_URL` for Postgres-backed mode
	- `APPLICATION_BASE_URL` for verification links (default `http://localhost:3000`)
	- `EMAIL_FROM_ADDRESS`
	- `EMAIL_PROVIDER_API_KEY` (when omitted, alerts run in dry-run log mode)
3. Apply schema:
	- `npm run db:setup`
4. Start web app:
	- `npm run dev`

## Worker runs

- Ingestion: `npm run worker:ingestion`
- Pricing refresh: `npm run worker:pricing-refresh`
- Alert worker: `npm run worker:alerts`

## Test run

- `npm test`

## Important v1 notes

- Public data is intended to be verified-only; unresolved rows should be quarantined.
- Official data connectors are scaffolded with representative records and need production fetch/parsing hardening for live filings.
- Email provider integration is currently dry-run logging unless `EMAIL_PROVIDER_API_KEY` wiring is completed to a specific provider API.
