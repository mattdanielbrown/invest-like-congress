import { Client } from "pg";

const refreshHoursUtc = [15, 18, 21];

function getNextRefreshTimestamp(now) {
	for (const hour of refreshHoursUtc) {
		const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
		if (candidate > now) {
			return candidate;
		}
	}

	const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, refreshHoursUtc[0], 0, 0));
	return nextDay;
}

async function run() {
	const refreshedAt = new Date();
	const nextRefreshAt = getNextRefreshTimestamp(refreshedAt);

	if (!process.env.DATABASE_URL) {
		console.info("[pricing-refresh:dry-run]", {
			refreshedAt: refreshedAt.toISOString(),
			nextRefreshAt: nextRefreshAt.toISOString()
		});
		return;
	}

	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();

	try {
		await client.query(
			`UPDATE system_status
			 SET last_pricing_refresh_at = $1,
				 next_pricing_refresh_at = $2,
				 market_session_state = 'open'
			 WHERE id = 1`,
			[refreshedAt.toISOString(), nextRefreshAt.toISOString()]
		);

		console.info("[pricing-refresh] Completed", {
			refreshedAt: refreshedAt.toISOString(),
			nextRefreshAt: nextRefreshAt.toISOString()
		});
	} finally {
		await client.end();
	}
}

run().catch((error) => {
	console.error("Pricing refresh failed", error);
	process.exit(1);
});
