# Congress Portfolio Tracker

Verified congressional portfolio tracking with a public website and supporting ingestion/notification services.

## Working contract

Future ChatGPT 5.4 and Codex work for this repository should follow the AI-first MVP operating contract in [AGENTS.md](/Users/mattbrown/Development/AI/Platforms/Web/OpenAI/Codex/Projects/stock-portfolios-of-congress/AGENTS.md).

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
	- Review worker and ingestion tuning vars:
		- `INGESTION_RETRY_MAX_RETRIES`
		- `INGESTION_RETRY_DELAY_MS`
		- `INGESTION_RATE_LIMIT_PAUSE_MS`
		- `WORKER_ALLOW_DRY_RUN` (set to `0` in production)
4. Apply schema:
	- `npm run db:setup`
5. Start web app:
	- `npm run dev`

## Hosted deployment (Milestone 4)

- Render blueprint:
	- `render.yaml`
- First hosted MVP runbook:
	- [docs/operations/first-hosted-mvp-render.md](/Users/mattbrown/Development/AI/Platforms/Web/OpenAI/Codex/Projects/stock-portfolios-of-congress/docs/operations/first-hosted-mvp-render.md)

## Worker runs

- Ingestion: `npm run worker:ingestion`
- Pricing refresh: `npm run worker:pricing-refresh`
- Alert worker: `npm run worker:alerts`
- Demo fallback seed only: `npm run demo:seed`
- Demo refresh (migrate + ingest + pricing): `npm run demo:refresh`

## Test run

- `npm test`

## Important v1 notes

- Public data is verified-only; unresolved rows are quarantined.
- Senate ingestion is operated in strict non-commercial mode with explicit source attribution requirements.
- Ingestion now rebuilds derived holdings and realized P/L state from verified transactions for demo-ready pages.
- Pricing refresh updates `holding_snapshots.last_market_price` and `holding_snapshots.unrealized_profit_loss` for open positions with resolved tickers.
- Pricing data source defaults to Stooq CSV fallback; set `MARKET_DATA_BASE_URL` and optional `MARKET_DATA_API_KEY` to use a provider endpoint.
- Email provider integration is currently dry-run logging unless `EMAIL_PROVIDER_API_KEY` wiring is completed to a specific provider API.
- Alerts APIs and `GET /api/system/status` explicitly label alert delivery as non-MVP dry-run until provider-backed delivery is implemented.
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

## Demo refresh checklist (Milestone 3)

1. Reset to an empty local DB and apply schema
	- `docker compose down -v`
	- `docker compose up -d`
	- `npm run db:setup`
2. Run the end-to-end demo refresh
	- `npm run demo:refresh`
	- Behavior:
		- Official ingestion is attempted first.
		- Deterministic fallback seed is applied automatically when ingestion fails or yields `0` verified transactions.
3. Verify demo usability
	- `npm run dev`
	- Check `GET /api/system/status` and confirm `demoData.mode`.
	- Visit `/`, `/members/<member-id>`, `/assets/<asset-id>`.
4. Verify fallback path explicitly
	- `DEMO_FROM_YEAR=2100 DEMO_TO_YEAR=2100 npm run demo:refresh`
	- Re-check `GET /api/system/status` and confirm `demoData.mode` reports fallback.

## Worker behavior

- Workers now fail fast when `DATABASE_URL` is missing unless `WORKER_ALLOW_DRY_RUN=1`.
- Worker scripts are thin entrypoints over shared service modules in `scripts/lib/`.

## Troubleshooting

- Empty UI with setup-required message:
	- `DATABASE_URL` is missing or invalid.
- Empty UI with no setup-required message:
	- DB is connected but ingest may not have run yet.
	- Run `npm run demo:refresh` and recheck counts in the runbook.
- Ingestion appears stale:
	- Check `GET /api/system/status` for `healthSignals.minutesSinceLastIngestion`.
	- Query latest run summary:
		- `psql "$DATABASE_URL" -c "select run_id,mode,started_at,finished_at,success,failure_reason,warnings_json from ingestion_run_summaries order by started_at desc limit 5;"`
- Need to replay hourly window:
	- Remove only the relevant checkpoint key, then rerun ingestion:
		- `psql "$DATABASE_URL" -c "delete from ingestion_checkpoints where source_system='official-ptr' and cursor_key='hourly:2019-2026';"`
		- `npm run worker:ingestion -- --mode=hourly --from-year=2019 --to-year=2026`
- Need to inspect quarantined rows:
	- `psql "$DATABASE_URL" -c "select source_document_id,reason,created_at from ingestion_quarantine_events order by created_at desc limit 50;"`
- Switching Senate mode temporarily:
	- Set `SENATE_COMPLIANCE_MODE=manual` to disable automated Senate fetches.
