#!/usr/bin/env bash

set -euo pipefail

usage() {
	echo "Usage: HOSTED_BASE_URL=<url> DATABASE_URL=<postgres-url> $0 [HOSTED_BASE_URL] [DATABASE_URL]" >&2
	echo "Example: HOSTED_BASE_URL=https://congress-portfolio-web.onrender.com DATABASE_URL=postgres://... $0" >&2
}

HOSTED_BASE_URL="${1:-${HOSTED_BASE_URL:-}}"
DATABASE_URL_INPUT="${2:-${DATABASE_URL:-}}"

if [ -z "$HOSTED_BASE_URL" ] || [ -z "$DATABASE_URL_INPUT" ]; then
	echo "error: HOSTED_BASE_URL and DATABASE_URL are required." >&2
	usage
	exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
	echo "error: curl is required." >&2
	exit 1
fi

if ! command -v node >/dev/null 2>&1; then
	echo "error: node is required." >&2
	exit 1
fi

ARTIFACT_DIR="/tmp"
if ! (mkdir -p "$ARTIFACT_DIR" && touch "$ARTIFACT_DIR/.m5-verification-write-test" && rm -f "$ARTIFACT_DIR/.m5-verification-write-test"); then
	ARTIFACT_DIR="/var/tmp"
	if ! (mkdir -p "$ARTIFACT_DIR" && touch "$ARTIFACT_DIR/.m5-verification-write-test" && rm -f "$ARTIFACT_DIR/.m5-verification-write-test"); then
		echo "error: unable to write artifacts to /tmp or /var/tmp." >&2
		exit 1
	fi
fi

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
ARTIFACT_BASE="${ARTIFACT_DIR}/m5-verification-${TIMESTAMP}"
ARTIFACT_TEXT="${ARTIFACT_BASE}.txt"
ARTIFACT_JSON="${ARTIFACT_BASE}.json"
STATUS_JSON="${ARTIFACT_BASE}.status.json"

run_sql() {
	local sql="$1"
	if command -v psql >/dev/null 2>&1; then
		PGCONNECT_TIMEOUT=15 DATABASE_URL="$DATABASE_URL_INPUT" psql "$DATABASE_URL_INPUT" -v ON_ERROR_STOP=1 -At -F $'\t' -c "$sql"
		return 0
	fi

	if command -v docker >/dev/null 2>&1; then
		docker run --rm -e DATABASE_URL="$DATABASE_URL_INPUT" postgres:18 psql "$DATABASE_URL_INPUT" -v ON_ERROR_STOP=1 -At -F $'\t' -c "$sql"
		return 0
	fi

	if SQL_QUERY="$sql" DATABASE_URL="$DATABASE_URL_INPUT" node --input-type=module <<'NODE'
import pgPackage from 'pg';
const { Client } = pgPackage;

const runQuery = async (enableSsl) => {
	const client = new Client({
		connectionString: process.env.DATABASE_URL,
		ssl: enableSsl ? { rejectUnauthorized: false } : undefined
	});
	await client.connect();
	try {
		return await client.query(process.env.SQL_QUERY);
	} finally {
		await client.end();
	}
};

let result;
try {
	result = await runQuery(false);
} catch (error) {
	const message = String(error?.message ?? '');
	const needsSsl = message.includes('SSL/TLS required') || message.includes('SSL off');
	if (!needsSsl) {
		throw error;
	}
	result = await runQuery(true);
}

try {
	for (const row of result.rows) {
		const output = Object.values(row).map((value) => (value === null ? '' : String(value)));
		console.log(output.join('\t'));
	}
} catch (error) {
	throw error;
}
NODE
	then
		return 0
	fi

	echo "error: SQL verification requires one of: psql, docker+postgres image, or node with the pg dependency." >&2
	echo "recovery: install psql, install/start Docker, or run npm install to ensure node_modules/pg is available, then re-run this script." >&2
	exit 1
}

STATUS_URL="${HOSTED_BASE_URL%/}/api/system/status"
curl -sS "$STATUS_URL" > "$STATUS_JSON"

STATUS_VALUES="$(node - "$STATUS_JSON" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
const values = [
	payload?.alerts?.launchState ?? '',
	String(payload?.alerts?.subscriptionsApiEnabled),
	String(payload?.alerts?.workerDispatchEnabled),
	String(payload?.healthSignals?.pendingAlertEventCount),
	String(payload?.healthSignals?.minutesSinceLastIngestion),
	String(payload?.healthSignals?.minutesSinceLastPricingRefresh),
	String(payload?.latestIngestionRun?.success),
	String(payload?.latestPricingRefreshRun?.success)
];
console.log(values.join('\t'));
NODE
)"

IFS=$'\t' read -r ALERTS_LAUNCH ALERTS_API ALERTS_WORKER PENDING_ALERTS MINS_INGESTION MINS_PRICING LATEST_INGESTION_SUCCESS LATEST_PRICING_SUCCESS <<< "$STATUS_VALUES"

if [ "$ALERTS_LAUNCH" != "deferred" ] || [ "$ALERTS_API" != "false" ] || [ "$ALERTS_WORKER" != "false" ] || [ "$PENDING_ALERTS" != "0" ]; then
	echo "error: /api/system/status truthfulness checks failed." >&2
	echo "expected: launchState=deferred subscriptionsApiEnabled=false workerDispatchEnabled=false pendingAlertEventCount=0" >&2
	echo "actual:   launchState=${ALERTS_LAUNCH} subscriptionsApiEnabled=${ALERTS_API} workerDispatchEnabled=${ALERTS_WORKER} pendingAlertEventCount=${PENDING_ALERTS}" >&2
	echo "recovery: validate deferred alert policy deployment, run one ingestion cycle, then re-run verification." >&2
	exit 1
fi

LATEST_INGESTION_ROW="$(run_sql "select run_id, mode, started_at, finished_at, success from ingestion_run_summaries order by started_at desc limit 1;")"
if [ -z "$LATEST_INGESTION_ROW" ]; then
	echo "error: no ingestion_run_summaries rows found." >&2
	echo "recovery: run manual ingestion (npm run worker:ingestion -- --mode=hourly --from-year=2019), then re-run verification." >&2
	exit 1
fi

LATEST_PRICING_ROW="$(run_sql "select worker_name, run_id, started_at, finished_at, success from worker_run_summaries where worker_name='pricing-refresh' order by started_at desc limit 1;")"
if [ -z "$LATEST_PRICING_ROW" ]; then
	echo "error: no pricing-refresh worker_run_summaries rows found." >&2
	echo "recovery: run manual pricing refresh (npm run worker:pricing-refresh), then re-run verification." >&2
	exit 1
fi

INGESTION_SUCCESS="$(printf '%s' "$LATEST_INGESTION_ROW" | awk -F $'\t' '{print $5}')"
PRICING_SUCCESS="$(printf '%s' "$LATEST_PRICING_ROW" | awk -F $'\t' '{print $5}')"

if [ "$INGESTION_SUCCESS" != "t" ] && [ "$INGESTION_SUCCESS" != "true" ]; then
	echo "error: latest ingestion summary is not successful: ${LATEST_INGESTION_ROW}" >&2
	echo "recovery: investigate ingestion failure, run manual ingestion, then re-run verification." >&2
	exit 1
fi

if [ "$PRICING_SUCCESS" != "t" ] && [ "$PRICING_SUCCESS" != "true" ]; then
	echo "error: latest pricing-refresh summary is not successful: ${LATEST_PRICING_ROW}" >&2
	echo "recovery: investigate pricing refresh failure, run manual pricing refresh, then re-run verification." >&2
	exit 1
fi

cat > "$ARTIFACT_TEXT" <<TXT
Milestone 5 Hosted Verification
Timestamp (UTC): ${TIMESTAMP}
Hosted URL: ${HOSTED_BASE_URL}
Status URL: ${STATUS_URL}
alerts.launchState=${ALERTS_LAUNCH}
alerts.subscriptionsApiEnabled=${ALERTS_API}
alerts.workerDispatchEnabled=${ALERTS_WORKER}
healthSignals.pendingAlertEventCount=${PENDING_ALERTS}
healthSignals.minutesSinceLastIngestion=${MINS_INGESTION}
healthSignals.minutesSinceLastPricingRefresh=${MINS_PRICING}
latestIngestionRun.success=${LATEST_INGESTION_SUCCESS}
latestPricingRefreshRun.success=${LATEST_PRICING_SUCCESS}
latest_ingestion_row=${LATEST_INGESTION_ROW}
latest_pricing_refresh_row=${LATEST_PRICING_ROW}
TXT

ARTIFACT_JSON_PATH="$ARTIFACT_JSON" \
HOSTED_BASE_URL="$HOSTED_BASE_URL" \
STATUS_URL="$STATUS_URL" \
ALERTS_LAUNCH="$ALERTS_LAUNCH" \
ALERTS_API="$ALERTS_API" \
ALERTS_WORKER="$ALERTS_WORKER" \
PENDING_ALERTS="$PENDING_ALERTS" \
MINS_INGESTION="$MINS_INGESTION" \
MINS_PRICING="$MINS_PRICING" \
LATEST_INGESTION_SUCCESS="$LATEST_INGESTION_SUCCESS" \
LATEST_PRICING_SUCCESS="$LATEST_PRICING_SUCCESS" \
LATEST_INGESTION_ROW="$LATEST_INGESTION_ROW" \
LATEST_PRICING_ROW="$LATEST_PRICING_ROW" \
node <<'NODE'
const fs = require('fs');
const outputPath = process.env.ARTIFACT_JSON_PATH;
const payload = {
	timestampUtc: new Date().toISOString(),
	hostedBaseUrl: process.env.HOSTED_BASE_URL,
	statusUrl: process.env.STATUS_URL,
	statusChecks: {
		alertsLaunchState: process.env.ALERTS_LAUNCH,
		subscriptionsApiEnabled: process.env.ALERTS_API === 'true',
		workerDispatchEnabled: process.env.ALERTS_WORKER === 'true',
		pendingAlertEventCount: Number(process.env.PENDING_ALERTS),
		minutesSinceLastIngestion: Number(process.env.MINS_INGESTION),
		minutesSinceLastPricingRefresh: Number(process.env.MINS_PRICING),
		latestIngestionRunSuccess: process.env.LATEST_INGESTION_SUCCESS === 'true',
		latestPricingRefreshRunSuccess: process.env.LATEST_PRICING_SUCCESS === 'true'
	},
	latestRows: {
		ingestion: process.env.LATEST_INGESTION_ROW,
		pricingRefresh: process.env.LATEST_PRICING_ROW
	}
};
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
NODE

echo "verification_passed=true"
echo "artifact_text=${ARTIFACT_TEXT}"
echo "artifact_json=${ARTIFACT_JSON}"
echo "status_json=${STATUS_JSON}"
