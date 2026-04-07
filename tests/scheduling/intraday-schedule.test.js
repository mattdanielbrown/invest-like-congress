import test from "node:test";
import assert from "node:assert/strict";

function getNextRefreshTimestamp(now) {
	const hours = [15, 18, 21];
	for (const hour of hours) {
		const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
		if (candidate.getTime() > now.getTime()) {
			return candidate;
		}
	}

	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, hours[0], 0, 0));
}

test("returns next intraday slot when before final slot", () => {
	const now = new Date("2026-04-07T16:00:00.000Z");
	const next = getNextRefreshTimestamp(now);
	assert.equal(next.toISOString(), "2026-04-07T18:00:00.000Z");
});

test("rolls to next day after final slot", () => {
	const now = new Date("2026-04-07T22:30:00.000Z");
	const next = getNextRefreshTimestamp(now);
	assert.equal(next.toISOString(), "2026-04-08T15:00:00.000Z");
});
