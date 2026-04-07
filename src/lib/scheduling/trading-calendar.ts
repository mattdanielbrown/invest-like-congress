const marketHolidayIsoDates = new Set<string>([
	"2026-01-01",
	"2026-01-19",
	"2026-02-16",
	"2026-04-03",
	"2026-05-25",
	"2026-07-03",
	"2026-09-07",
	"2026-11-26",
	"2026-12-25"
]);

export function isTradingDay(date: Date): boolean {
	const day = date.getUTCDay();
	if (day === 0 || day === 6) {
		return false;
	}

	const isoDate = date.toISOString().slice(0, 10);
	return !marketHolidayIsoDates.has(isoDate);
}
