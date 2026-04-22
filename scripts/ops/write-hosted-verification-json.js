import fs from "node:fs";

function getRequiredEnvironmentVariable(name) {
	const value = process.env[name];
	if (value === undefined || value === "") {
		throw new Error(`${name} is required.`);
	}

	return value;
}

function isNormalizedTrue(value) {
	return value === "true";
}

export function writeHostedVerificationJson() {
	const outputPath = getRequiredEnvironmentVariable("ARTIFACT_JSON_PATH");
	const payload = {
		timestampUtc: new Date().toISOString(),
		hostedBaseUrl: getRequiredEnvironmentVariable("HOSTED_BASE_URL"),
		statusUrl: getRequiredEnvironmentVariable("STATUS_URL"),
		statusChecks: {
			alertsLaunchState: getRequiredEnvironmentVariable("ALERTS_LAUNCH"),
			subscriptionsApiEnabled: isNormalizedTrue(getRequiredEnvironmentVariable("ALERTS_API")),
			workerDispatchEnabled: isNormalizedTrue(getRequiredEnvironmentVariable("ALERTS_WORKER")),
			pendingAlertEventCount: Number(getRequiredEnvironmentVariable("PENDING_ALERTS")),
			minutesSinceLastIngestion: Number(getRequiredEnvironmentVariable("MINS_INGESTION")),
			minutesSinceLastPricingRefresh: Number(getRequiredEnvironmentVariable("MINS_PRICING")),
			latestIngestionRunSuccess: isNormalizedTrue(getRequiredEnvironmentVariable("NORMALIZED_LATEST_INGESTION_SUCCESS")),
			latestPricingRefreshRunSuccess: isNormalizedTrue(getRequiredEnvironmentVariable("NORMALIZED_LATEST_PRICING_SUCCESS"))
		},
		latestRows: {
			ingestion: getRequiredEnvironmentVariable("LATEST_INGESTION_ROW"),
			pricingRefresh: getRequiredEnvironmentVariable("LATEST_PRICING_ROW")
		}
	};

	fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
}

const currentScriptPath = new URL(import.meta.url).pathname;
const invokedScriptPath = process.argv[1];

if (invokedScriptPath && currentScriptPath === invokedScriptPath) {
	writeHostedVerificationJson();
}
