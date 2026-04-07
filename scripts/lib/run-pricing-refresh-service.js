import { Client } from "pg";
import { randomUUID } from "node:crypto";

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

function shouldAllowDryRun() {
	return process.env.WORKER_ALLOW_DRY_RUN === "1" || process.env.WORKER_ALLOW_DRY_RUN === "true";
}

export async function runPricingRefreshWorker() {
	const refreshedAt = new Date();
	const nextRefreshAt = getNextRefreshTimestamp(refreshedAt);
	const runId = randomUUID();

	if (!process.env.DATABASE_URL) {
		if (!shouldAllowDryRun()) {
			throw new Error("DATABASE_URL is required for pricing refresh worker. Set WORKER_ALLOW_DRY_RUN=1 to allow dry-run.");
		}
		console.info("[pricing-refresh:dry-run]", {
			run_id: runId,
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
			run_id: runId,
			refreshedAt: refreshedAt.toISOString(),
			nextRefreshAt: nextRefreshAt.toISOString()
		});
	} finally {
		await client.end();
	}
}
