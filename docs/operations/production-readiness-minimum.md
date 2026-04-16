# Production Readiness Minimum (Milestone 5)

This runbook defines the smallest production-readiness baseline for Milestone 5.

## Scope

- Alerts launch truthfulness path: explicit launch deferral with hard gating.
- Baseline worker schedules for ingestion and pricing refresh.
- Required operator runbook coverage for these failure modes:
	- stale ingestion
	- failed pricing refresh
	- failed alert delivery
	- empty UI
	- DB misconfiguration
- Minimal observability expectations tied to:
	- `GET /api/system/status`
	- `ingestion_run_summaries`
	- `worker_run_summaries`

## 1. Alert launch truthfulness path

- Alerts are intentionally deferred from launch.
- Public alert subscription endpoints are hard-gated with `503`:
	- `POST /api/alerts/subscribe`
	- `GET /api/alerts/subscribe?token=...`
	- `POST /api/alerts/unsubscribe`
- `GET /api/system/status` must report:
	- `alerts.launchState = deferred`
	- `alerts.subscriptionsApiEnabled = false`
	- `alerts.workerDispatchEnabled = false`

## 2. Worker scheduling baseline (Render)

Configure these Render cron services from `render.yaml`:

- `congress-portfolio-ingestion-hourly`
	- Schedule: `12 * * * *`
	- Command: `npm run worker:ingestion -- --mode=hourly --from-year=2019`
- `congress-portfolio-pricing-refresh`
	- Schedule: `0 15,18,21 * * 1-5`
	- Command: `npm run worker:pricing-refresh`

Alerts scheduling is deferred until provider-backed delivery is implemented and validated.

## 3. Minimal observability expectations

Use these observation paths for every incident:

1. `GET /api/system/status`
	- `healthSignals.minutesSinceLastIngestion`
	- `healthSignals.minutesSinceLastPricingRefresh`
	- `healthSignals.minutesSinceLastSuccessfulAlertDispatch`
	- `latestIngestionRun`
	- `latestPricingRefreshRun`
	- `latestAlertWorkerRun`
	- `alerts.*`
2. Ingestion run summaries
	- `psql "$DATABASE_URL" -c "select run_id,mode,started_at,finished_at,success,failure_reason,warnings_json from ingestion_run_summaries order by started_at desc limit 10;"`
3. Worker run summaries
	- `psql "$DATABASE_URL" -c "select worker_name,run_id,started_at,finished_at,success,failure_reason,metrics_json,warnings_json from worker_run_summaries order by started_at desc limit 20;"`

## 4. Post-activation verification snapshot

Primary command (canonical path) after cron services are enabled and at least one cycle has elapsed:

- `HOSTED_BASE_URL=https://congress-portfolio-web.onrender.com DATABASE_URL='<render-postgres-connection-string>' ./scripts/ops/verify-hosted-m5.sh`
- Expected script result:
	- `verification_passed=true`
	- Artifacts written to `/tmp/m5-verification-<timestamp>.*` (or `/var/tmp` fallback)

Fallback manual checks (if script execution environment is unavailable):

1. `curl -sS <hosted-url>/api/system/status`
	- Expected:
		- `alerts.launchState = deferred`
		- `alerts.subscriptionsApiEnabled = false`
		- `alerts.workerDispatchEnabled = false`
		- `healthSignals.pendingAlertEventCount = 0`
2. `psql "$DATABASE_URL" -c "select run_id,mode,started_at,finished_at,success from ingestion_run_summaries order by started_at desc limit 5;"`
	- Expected:
		- At least one recent successful hourly run.
3. `psql "$DATABASE_URL" -c "select worker_name,run_id,started_at,finished_at,success from worker_run_summaries where worker_name='pricing-refresh' order by started_at desc limit 5;"`
	- Expected:
		- At least one recent successful pricing refresh run.

## 5. Operator ownership and check cadence

- Owner: MVP operator on-call.
- Daily checks:
	- Verify `/api/system/status` freshness signals for ingestion and pricing.
	- Verify latest ingestion/pricing summaries include successful runs.
- Weekly checks:
	- Confirm Render cron services are still enabled and on the expected schedules.
	- Confirm `pendingAlertEventCount` remains `0` while alerts are deferred.

## 6. Failure modes and runbook actions

### A) Stale ingestion

- Observe:
	- `healthSignals.minutesSinceLastIngestion` is unexpectedly high.
	- Latest `ingestion_run_summaries.success = false` or no recent runs.
- Recover:
	- Run a manual hourly ingestion:
		- `npm run worker:ingestion -- --mode=hourly --from-year=2019`
	- If checkpoint is wedged, delete the specific hourly checkpoint and rerun:
		- `psql "$DATABASE_URL" -c "delete from ingestion_checkpoints where source_system='official-ptr' and cursor_key='hourly:2019-2026';"`
		- `npm run worker:ingestion -- --mode=hourly --from-year=2019 --to-year=2026`

### B) Failed pricing refresh

- Observe:
	- `latestPricingRefreshRun.success = false`.
	- `healthSignals.minutesSinceLastPricingRefresh` is unexpectedly high.
- Recover:
	- Run manual pricing refresh:
		- `npm run worker:pricing-refresh`
	- Inspect worker summary warnings and `metrics_json.skippedTickerCount` for provider/data issues.

### C) Failed alert delivery

- Observe:
	- `alerts.launchState = deferred` indicates alert delivery is intentionally not active.
	- `latestAlertWorkerRun.warnings_json` indicates dispatch is deferred.
	- `healthSignals.pendingAlertEventCount` should remain `0` while deferred.
- Recover:
	- No delivery recovery is expected while deferred.
	- Keep alerts API hard-gated.
	- If `pendingAlertEventCount` is non-zero, run one ingestion cycle after confirming deferred policy is active to clear stale queue rows.

### D) Empty UI

- Observe:
	- Home/member/asset pages render but contain no records.
	- `demoData.mode = empty` or verified counts are zero.
- Recover:
	- Run `npm run demo:refresh`.
	- Re-check `/api/system/status` and ensure `demoData.mode` is not `empty`.

### E) DB misconfiguration

- Observe:
	- Pages/APIs return setup-required responses.
	- `/api/system/status` fails with database setup guidance.
- Recover:
	- Verify `DATABASE_URL`.
	- Run `npm run db:setup`.
	- Re-check `/api/system/status`.
