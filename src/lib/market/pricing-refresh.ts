import { updateSystemStatus } from "@/lib/db/repository";
import { getNextPricingRefreshUtc } from "@/lib/scheduling/intraday-schedule";

export async function runPricingRefresh(): Promise<{ refreshedAt: string; nextRefreshAt: string }> {
	const refreshedAt = new Date();
	const nextRefreshAt = getNextPricingRefreshUtc(refreshedAt);

	await updateSystemStatus({
		lastPricingRefreshAt: refreshedAt.toISOString(),
		nextPricingRefreshAt: nextRefreshAt.toISOString(),
		marketSessionState: "open"
	});

	return {
		refreshedAt: refreshedAt.toISOString(),
		nextRefreshAt: nextRefreshAt.toISOString()
	};
}
