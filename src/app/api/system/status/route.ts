import { getSystemStatus } from "@/lib/db/repository";
import { internalError, okJson } from "@/lib/api/http";
import { getIntradayRefreshHoursUtc } from "@/lib/scheduling/intraday-schedule";

export async function GET() {
	try {
		const status = await getSystemStatus();
		return okJson({
			status,
			pricingRefreshHoursUtc: getIntradayRefreshHoursUtc(),
			targetRefreshRunsPerTradingDay: 3
		});
	} catch (error) {
		console.error("system-status-api-failure", error);
		return internalError("Failed to load system status.");
	}
}
