import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;

function formatAlertBody(event) {
	return [
		`Event: ${event.action}`,
		`Member: ${event.member_id}`,
		`Asset: ${event.asset_id}`,
		`Share delta: ${event.share_delta}`,
		`Realized P/L: ${event.realized_profit_loss ?? "n/a"}`
	].join("\n");
}

function shouldAllowDryRun() {
	return process.env.WORKER_ALLOW_DRY_RUN === "1" || process.env.WORKER_ALLOW_DRY_RUN === "true";
}

export async function runAlertWorker() {
	const runId = randomUUID();
	if (!process.env.DATABASE_URL) {
		if (!shouldAllowDryRun()) {
			throw new Error("DATABASE_URL is required for alert worker. Set WORKER_ALLOW_DRY_RUN=1 to allow dry-run.");
		}
		console.info("[alert-worker:dry-run] DATABASE_URL not set; worker exited.", {
			run_id: runId
		});
		return;
	}

	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();

	try {
		const eventResult = await client.query(
			`SELECT id, member_id, asset_id, action, share_delta, realized_profit_loss
			 FROM position_change_events
			 WHERE processed_at IS NULL
			 ORDER BY created_at ASC
			 LIMIT 200`
		);

		const subscriptionResult = await client.query(
			`SELECT id, email_address, preference_json
			 FROM alert_subscriptions
			 WHERE is_verified = true AND unsubscribed_at IS NULL`
		);

		let sentCount = 0;
		for (const event of eventResult.rows) {
			for (const subscription of subscriptionResult.rows) {
				const preference = subscription.preference_json ?? { memberIds: [], assetIds: [] };
				const memberIds = Array.isArray(preference.memberIds) ? preference.memberIds : [];
				const assetIds = Array.isArray(preference.assetIds) ? preference.assetIds : [];
				const memberMatch = memberIds.length === 0 || memberIds.includes(event.member_id);
				const assetMatch = assetIds.length === 0 || assetIds.includes(event.asset_id);
				if (!memberMatch || !assetMatch) {
					continue;
				}

				console.info("[alert-email:dry-run]", {
					run_id: runId,
					to: subscription.email_address,
					subject: `Congress Portfolio Alert: ${event.action}`,
					body: formatAlertBody(event),
					idempotencyKey: `${event.id}:${subscription.id}`
				});
				sentCount += 1;
			}

			await client.query("UPDATE position_change_events SET processed_at = now() WHERE id = $1", [event.id]);
		}

		console.info("[alert-worker] Completed", {
			run_id: runId,
			events: eventResult.rowCount,
			deliveries: sentCount
		});
	} finally {
		await client.end();
	}
}
