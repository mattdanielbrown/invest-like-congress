import {
	getLatestIngestionRunSummary,
	getLatestSuccessfulWorkerRunSummary,
	getLatestWorkerRunSummary,
	getPendingAlertEventCount,
	getSystemStatus
} from "@/lib/db/repository";
import { databaseSetupRequired, internalError, okJson } from "@/lib/api/http";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";
import { getIntradayRefreshHoursUtc } from "@/lib/scheduling/intraday-schedule";

const alertsTruthfulness = {
	deliveryMode: "dry-run-only",
	mvpStatus: "not-provider-backed",
	message: "Provider-backed alert email delivery is not implemented; worker dispatch currently runs in dry-run mode."
} as const;

export async function GET() {
	try {
		const [
			status,
			pendingAlertEventCount,
			latestIngestionRun,
			latestPricingRefreshRun,
			latestAlertWorkerRun,
			latestSuccessfulAlertWorkerRun
		] = await Promise.all([
			getSystemStatus(),
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
		return okJson({
			status,
			pricingRefreshHoursUtc: getIntradayRefreshHoursUtc(),
			targetRefreshRunsPerTradingDay: 3,
			alerts: alertsTruthfulness,
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
