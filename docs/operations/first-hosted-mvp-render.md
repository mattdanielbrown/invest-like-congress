# First Hosted MVP Deployment (Render)

This runbook is the Milestone 4 bootstrap sequence for the first hosted MVP.

## Scope

- One Render web service for the Next.js app.
- One Render managed Postgres database.
- One-time hosted bootstrap using `db:setup` + `demo:refresh`.
- Verification of hosted API health and core pages.

## Prerequisites

- Repository is pushed to `main` and connected to Render.
- Render account can create services and managed Postgres.
- `render.yaml` exists at repository root.

## 1. Create infrastructure from blueprint

1. In Render, choose **New** -> **Blueprint**.
2. Select this repository and branch `main`.
3. Confirm creation of:
   - `congress-portfolio-web` (web service)
   - `congress-portfolio-db` (managed Postgres)
4. Wait for initial provision/build to finish.

## 2. Configure required environment variables

In Render, open the `congress-portfolio-web` service settings and confirm/set these values.

- `DATABASE_URL`
  - Source: `congress-portfolio-db` internal connection string.
- `APPLICATION_BASE_URL`
  - Value: deployed Render URL for the web service (for example `https://congress-portfolio-web.onrender.com`).
- `EMAIL_FROM_ADDRESS`
  - Value: `alerts@congress-portfolio.local`
- `EMAIL_PROVIDER_API_KEY`
  - Value: optional for MVP; keep empty for dry-run-only alerts truthfulness.
- `RAW_FILING_CACHE_DIRECTORY`
  - Value: `/tmp/invest-like-congress/raw-filings`
- `SENATE_COMPLIANCE_MODE`
  - Value: `strict-non-commercial`
- `SENATE_REPORT_DATA_PATH`
  - Value: `/search/report/data/`
- `INGESTION_USER_AGENT`
  - Value: `invest-like-congress/1.0 (non-commercial, transparency research)`
- `INGESTION_RETRY_MAX_RETRIES`
  - Value: `3`
- `INGESTION_RETRY_DELAY_MS`
  - Value: `800`
- `INGESTION_RATE_LIMIT_PAUSE_MS`
  - Value: `300`
- `MARKET_DATA_BASE_URL`
  - Optional: leave empty for default Stooq fallback.
- `MARKET_DATA_API_KEY`
  - Optional.
- `WORKER_ALLOW_DRY_RUN`
  - Value: `0`

After any edits, trigger a manual deploy so the service starts with the finalized environment.

## 3. Run one-time hosted bootstrap

Open a shell for `congress-portfolio-web` and run:

```bash
npm run db:setup
npm run demo:refresh
```

Expected behavior:

- `db:setup` applies all `sql/*.sql` migrations.
- `demo:refresh` attempts official ingestion first.
- If ingestion fails or yields zero verified rows, deterministic fallback seed is applied.
- Pricing refresh runs after ingest/fallback.

## 4. Verify hosted health and core pages

Use the deployed web service URL (replace `<hosted-url>`):

```bash
curl -sS <hosted-url>/api/system/status
```

Expected response shape includes keys:

- `status`
- `alerts`
- `demoData`
- `healthSignals`
- `latestIngestionRun`

Truthfulness checks in `/api/system/status`:

- `alerts.deliveryMode` is `dry-run-only`
- `demoData.mode` is non-empty and reflects ingestion/fallback outcome.

Open and validate core pages:

- `<hosted-url>/`
- `<hosted-url>/members/demo-member-nancy-pelosi`
- `<hosted-url>/assets/demo-asset-amzn`

Each page should load and render usable content without setup-required errors.

## 5. Reproducible command sequence (operator checklist)

1. Deploy blueprint from `render.yaml`.
2. Set required environment variables.
3. Redeploy web service.
4. Run in hosted shell:
   - `npm run db:setup`
   - `npm run demo:refresh`
5. Verify:
   - `/api/system/status`
   - `/`
   - `/members/demo-member-nancy-pelosi`
   - `/assets/demo-asset-amzn`

## Milestone boundary

- This runbook intentionally excludes scheduled worker automation setup.
- Scheduled ingestion/pricing/alerts operations are Milestone 5 work.
