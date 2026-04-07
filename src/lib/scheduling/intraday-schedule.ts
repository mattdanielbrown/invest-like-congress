import { isTradingDay } from "@/lib/scheduling/trading-calendar";

const refreshHoursUtc = [15, 18, 21];

export function getNextPricingRefreshUtc(now: Date): Date {
	let cursorDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

	for (let dayOffset = 0; dayOffset < 10; dayOffset += 1) {
		if (!isTradingDay(cursorDate)) {
			cursorDate = new Date(cursorDate.getTime() + 24 * 60 * 60 * 1000);
			continue;
		}

		for (const hour of refreshHoursUtc) {
			const candidate = new Date(Date.UTC(cursorDate.getUTCFullYear(), cursorDate.getUTCMonth(), cursorDate.getUTCDate(), hour, 0, 0));
			if (candidate.getTime() > now.getTime()) {
				return candidate;
			}
		}

		cursorDate = new Date(cursorDate.getTime() + 24 * 60 * 60 * 1000);
	}

	return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

export function getIntradayRefreshHoursUtc(): number[] {
	return [...refreshHoursUtc];
}
