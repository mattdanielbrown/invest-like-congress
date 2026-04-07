import { getLatestIngestionRunSummary, getPendingAlertEventCount, getSystemStatus } from "@/lib/db/repository";
import { databaseSetupRequired, internalError, okJson } from "@/lib/api/http";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";
import { getIntradayRefreshHoursUtc } from "@/lib/scheduling/intraday-schedule";

export async function GET() {
	try {
		const [status, pendingAlertEventCount, latestIngestionRun] = await Promise.all([
			getSystemStatus(),
			getPendingAlertEventCount(),
			getLatestIngestionRunSummary()
		]);
		const minutesSinceLastIngestion = status.lastIngestionAt
			? Math.floor((Date.now() - new Date(status.lastIngestionAt).getTime()) / (60 * 1000))
			: null;
		return okJson({
			status,
			pricingRefreshHoursUtc: getIntradayRefreshHoursUtc(),
			targetRefreshRunsPerTradingDay: 3,
			healthSignals: {
				pendingAlertEventCount,
				minutesSinceLastIngestion
			},
			latestIngestionRun
		});
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return databaseSetupRequired();
		}
		console.error("system-status-api-failure", error);
		return internalError("Failed to load system status.");
	}
}
