import {
	getVerifiedDataCounts,
	getLatestIngestionRunSummary,
	getLatestSuccessfulWorkerRunSummary,
	getLatestWorkerRunSummary,
	getPendingAlertEventCount,
	getSystemStatus
} from "@/lib/db/repository";
import { databaseSetupRequired, internalError, okJson } from "@/lib/api/http";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";
import { alertsLaunchPolicy } from "@/lib/alerts/launch-policy";
import { getIntradayRefreshHoursUtc } from "@/lib/scheduling/intraday-schedule";

function resolveDemoDataMode(options: {
	verifiedTransactions: number;
	demoSeedTransactions: number;
	officialTransactions: number;
	latestIngestionRunSuccess: boolean | null;
	latestIngestionExtractedTransactions: number | null;
}) {
	if (options.verifiedTransactions === 0) {
		return "empty";
	}
	if (options.demoSeedTransactions > 0 && options.officialTransactions === 0) {
		return "deterministic-fallback";
	}
	if (options.demoSeedTransactions > 0 && options.officialTransactions > 0) {
		return "mixed";
	}
	if (options.officialTransactions > 0) {
		return "official-ingestion";
	}
	if (options.latestIngestionRunSuccess === false || options.latestIngestionExtractedTransactions === 0) {
		return "deterministic-fallback";
	}
	return "official-ingestion";
}

export async function GET() {
	try {
		const [
			status,
			verifiedDataCounts,
			pendingAlertEventCount,
			latestIngestionRun,
			latestPricingRefreshRun,
			latestAlertWorkerRun,
			latestSuccessfulAlertWorkerRun
		] = await Promise.all([
			getSystemStatus(),
			getVerifiedDataCounts(),
			getPendingAlertEventCount(),
			getLatestIngestionRunSummary(),
			getLatestWorkerRunSummary("pricing-refresh"),
			getLatestWorkerRunSummary("alerts"),
			getLatestSuccessfulWorkerRunSummary("alerts")
		]);
		const minutesSinceLastIngestion = status.lastIngestionAt
			? Math.floor((Date.now() - new Date(status.lastIngestionAt).getTime()) / (60 * 1000))
			: null;
		const minutesSinceLastPricingRefresh = status.lastPricingRefreshAt
			? Math.floor((Date.now() - new Date(status.lastPricingRefreshAt).getTime()) / (60 * 1000))
			: null;
		const minutesSinceLastSuccessfulAlertDispatch = latestSuccessfulAlertWorkerRun
			? Math.floor((Date.now() - new Date(latestSuccessfulAlertWorkerRun.finishedAt).getTime()) / (60 * 1000))
			: null;
		const demoDataMode = resolveDemoDataMode({
			verifiedTransactions: verifiedDataCounts.verifiedTransactions,
			demoSeedTransactions: verifiedDataCounts.demoSeedTransactions,
			officialTransactions: verifiedDataCounts.officialTransactions,
			latestIngestionRunSuccess: latestIngestionRun?.success ?? null,
			latestIngestionExtractedTransactions: latestIngestionRun?.extractedTransactions ?? null
		});

		return okJson({
			status,
			pricingRefreshHoursUtc: getIntradayRefreshHoursUtc(),
			targetRefreshRunsPerTradingDay: 3,
			alerts: alertsLaunchPolicy,
			demoData: {
				mode: demoDataMode,
				counts: verifiedDataCounts
			},
			healthSignals: {
				pendingAlertEventCount,
				minutesSinceLastIngestion,
				minutesSinceLastPricingRefresh,
				minutesSinceLastSuccessfulAlertDispatch
			},
			latestIngestionRun,
			latestPricingRefreshRun,
			latestAlertWorkerRun
		});
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return databaseSetupRequired();
		}
		console.error("system-status-api-failure", error);
		return internalError("Failed to load system status.");
	}
}
