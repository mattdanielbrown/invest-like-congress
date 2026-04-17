# Production Readiness Minimum (Milestone 5)

This runbook defines the smallest production-readiness baseline for Milestone 5.

## 0. Milestone 5 closure checklist

| Milestone 5 criterion | Current implementation proof | Status | Evidence path |
| --- | --- | --- | --- |
| Alerts are truthful at launch (deferred or provider-backed) | Alerts launch policy is deferred and subscription endpoints are hard-gated with `503`; `/api/system/status` exposes `alerts.launchState=deferred`. | PASS | `docs/operations/evidence/milestone-5/2026-04-17/m5-verification-20260417T222120Z.status.json` |
| Worker schedules are configured for ingestion and pricing | Render cron services are defined in `render.yaml` for hourly ingestion and trading-session pricing refresh. | PASS | `render.yaml` |
| Failure-mode runbook coverage exists for all required scenarios | Runbook sections A-E cover stale ingestion, failed pricing refresh, failed alert delivery, empty UI, and DB misconfiguration. | PASS | Section `6. Failure modes and runbook actions` in this file |
| Monitoring expectations are tied to system status and worker summaries | `/api/system/status`, `ingestion_run_summaries`, and `worker_run_summaries` are the canonical observation paths. | PASS | Section `3. Minimal observability expectations` in this file |
| Hosted verification evidence is archived in-repo | Canonical hosted verification command is implemented and archived artifacts exist for latest run date. | PASS | `docs/operations/evidence/milestone-5/2026-04-17/` |

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
- Preferred archive command (runs verification + copies artifacts into repo evidence):
	- `HOSTED_BASE_URL=https://congress-portfolio-web.onrender.com DATABASE_URL='<render-postgres-connection-string>' ./scripts/ops/run-and-archive-hosted-m5.sh`
- Expected script result:
	- `verification_passed=true`
	- Artifacts written to `/tmp/m5-verification-<timestamp>.*` (or `/var/tmp` fallback)
	- Copy artifacts into the permanent evidence path:
		- `docs/operations/evidence/milestone-5/<YYYY-MM-DD>/`

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
	- Run canonical archive command:
		- `HOSTED_BASE_URL=https://congress-portfolio-web.onrender.com DATABASE_URL='<render-postgres-connection-string>' ./scripts/ops/run-and-archive-hosted-m5.sh`
	- Save or confirm these required artifacts:
		- latest archived hosted verification files (`.txt`, `.json`, `.status.json`)
		- latest ingestion summary query output
		- latest pricing summary query output
	- Verify `/api/system/status` sanity values:
		- `alerts.launchState = deferred`
		- `alerts.subscriptionsApiEnabled = false`
		- `alerts.workerDispatchEnabled = false`
		- `healthSignals.pendingAlertEventCount = 0`
		- `healthSignals.minutesSinceLastIngestion <= 180`
		- `healthSignals.minutesSinceLastPricingRefresh <= 360` on trading days
	- Verify latest summaries include successful runs:
		- latest ingestion run `success = true`
		- latest pricing refresh run `success = true`
- Weekly checks:
	- Confirm Render cron services are still enabled and on the expected schedules.
	- Confirm `pendingAlertEventCount` remains `0` while alerts are deferred.
	- Confirm at least one fresh archived evidence bundle exists for the current week in `docs/operations/evidence/milestone-5/<YYYY-MM-DD>/`.

## 6. Failure modes and runbook actions

### A) Stale ingestion

- Observe:
	- `healthSignals.minutesSinceLastIngestion > 180`.
	- Latest `ingestion_run_summaries.success = false` or no recent runs.
- Recover:
	- Canonical command sequence:
		- `npm run worker:ingestion -- --mode=hourly --from-year=2019`
		- If still failing, run:
			- `psql "$DATABASE_URL" -c "delete from ingestion_checkpoints where source_system='official-ptr' and cursor_key='hourly:2019-2026';"`
			- `npm run worker:ingestion -- --mode=hourly --from-year=2019 --to-year=2026`
- Validate:
	- `psql "$DATABASE_URL" -c "select run_id,mode,started_at,finished_at,success from ingestion_run_summaries order by started_at desc limit 3;"`
	- `curl -sS "$HOSTED_BASE_URL/api/system/status"` shows `minutesSinceLastIngestion <= 180`.

### B) Failed pricing refresh

- Observe:
	- `latestPricingRefreshRun.success = false`.
	- `healthSignals.minutesSinceLastPricingRefresh > 360` on trading days.
- Recover:
	- Canonical command sequence:
		- `npm run worker:pricing-refresh`
	- If still failing, inspect latest worker summaries for provider/data issues:
		- `psql "$DATABASE_URL" -c "select worker_name,run_id,started_at,finished_at,success,failure_reason,metrics_json,warnings_json from worker_run_summaries where worker_name='pricing-refresh' order by started_at desc limit 5;"`
- Validate:
	- Latest pricing refresh run row reports `success = true`.
	- `/api/system/status` reports `minutesSinceLastPricingRefresh <= 360` on trading days.

### C) Failed alert delivery

- Observe:
	- `alerts.launchState = deferred` indicates alert delivery is intentionally not active.
	- `latestAlertWorkerRun.warnings_json` indicates dispatch is deferred.
	- `healthSignals.pendingAlertEventCount` is non-zero while deferred.
- Recover:
	- Canonical command sequence:
		- Confirm deferred policy via `/api/system/status`.
		- Run one ingestion cycle: `npm run worker:ingestion -- --mode=hourly --from-year=2019`
		- Keep alerts API hard-gated; do not enable provider dispatch in Milestone 5.
- Validate:
	- `/api/system/status` reports:
		- `alerts.launchState=deferred`
		- `alerts.subscriptionsApiEnabled=false`
		- `alerts.workerDispatchEnabled=false`
		- `healthSignals.pendingAlertEventCount=0`

### D) Empty UI

- Observe:
	- Home/member/asset pages render but contain no records.
	- `demoData.mode = empty` or verified counts are zero.
- Recover:
	- Canonical command sequence:
		- `npm run demo:refresh`
- Validate:
	- Re-check `/api/system/status` and ensure:
		- `demoData.mode` is not `empty`
		- verified counts are non-zero.

### E) DB misconfiguration

- Observe:
	- Pages/APIs return setup-required responses.
	- `/api/system/status` fails with database setup guidance.
- Recover:
	- Canonical command sequence:
		- Verify `DATABASE_URL`.
		- Run `npm run db:setup`.
- Validate:
	- Re-check `/api/system/status` and confirm successful JSON response with `status` and `healthSignals`.
