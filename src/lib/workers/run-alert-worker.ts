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
import { alertsLaunchPolicy } from "@/lib/alerts/launch-policy";

export async function runAlertWorkerFromCli() {
	const env = loadServerEnv();

	const summary = await runSharedWorker({
		workerName: "alerts",
		hasDatabase: Boolean(env.databaseUrl),
		allowDryRunWithoutDatabase: process.env.WORKER_ALLOW_DRY_RUN === "1" || process.env.WORKER_ALLOW_DRY_RUN === "true",
		persistRunSummary: persistWorkerRunSummary,
		execute: async ({ runId }) => {
			if (!alertsLaunchPolicy.workerDispatchEnabled) {
				return {
					metrics: {
						alertDispatchEnabled: false,
						claimedEvents: 0,
						processedEvents: 0,
						failedEvents: 0,
						deliveriesAttempted: 0,
						deliveriesCompleted: 0,
						dryRunDeliveries: 0
					},
					warnings: [
						"Alert dispatch is deferred from launch; worker run exited without processing events."
					],
					failureReason: null
				};
			}

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
