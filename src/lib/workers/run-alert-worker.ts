import { deliverPendingAlertEvents, isEventInPreference } from "@/lib/domain/alert-service";
import {
	claimPendingPositionEvents,
	listVerifiedSubscriptions,
	markPositionEventDeliveryFailed,
	markPositionEventProcessed,
	persistWorkerRunSummary
} from "@/lib/db/repository";
import { loadServerEnv } from "@/lib/env/server-env";
import { runSharedWorker } from "@/lib/workers/run-shared-worker.js";

export async function runAlertWorkerFromCli() {
	const env = loadServerEnv();

	const summary = await runSharedWorker({
		workerName: "alerts",
		hasDatabase: Boolean(env.databaseUrl),
		allowDryRunWithoutDatabase: process.env.WORKER_ALLOW_DRY_RUN === "1" || process.env.WORKER_ALLOW_DRY_RUN === "true",
		persistRunSummary: persistWorkerRunSummary,
		execute: async ({ runId }) => {
			return deliverPendingAlertEvents({
				runId,
				claimPendingPositionEvents: (limit) => claimPendingPositionEvents(limit, runId),
				listVerifiedSubscriptions,
				markPositionEventProcessed: (eventId) => markPositionEventProcessed(eventId, runId),
				markPositionEventDeliveryFailed: (eventId, failureReason) => markPositionEventDeliveryFailed(eventId, runId, failureReason),
				isEventInPreference
			});
		}
	});

	return summary;
}
