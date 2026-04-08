import test from "node:test";
import assert from "node:assert/strict";
import { processClaimedAlertEvents } from "../../src/lib/workers/process-alert-events.js";
import { runSharedWorker } from "../../src/lib/workers/run-shared-worker.js";

function createEvent(id) {
	return {
		id,
		memberId: "member-1",
		assetId: "asset-1",
		action: "position-opened",
		shareDelta: 10,
		realizedProfitLoss: null,
		sourceTransactionId: `txn-${id}`,
		createdAt: "2026-04-08T00:00:00.000Z"
	};
}

function createSubscription(id, preference = { memberIds: [], assetIds: [] }) {
	return {
		id,
		emailAddress: `${id}@example.com`,
		preference
	};
}

test("claimed alert events are marked processed after successful delivery", async () => {
	const processed = [];
	const failed = [];
	const result = await processClaimedAlertEvents({
		runId: "run-1",
		events: [createEvent("event-1")],
		subscriptions: [createSubscription("subscription-1")],
		isEventInPreference: () => true,
		sendDelivery: async () => ({ deliveryMode: "dry-run" }),
		markProcessed: async (eventId) => {
			processed.push(eventId);
		},
		markFailed: async (eventId, failureReason) => {
			failed.push({ eventId, failureReason });
		}
	});

	assert.deepEqual(processed, ["event-1"]);
	assert.deepEqual(failed, []);
	assert.equal(result.metrics.processedEvents, 1);
	assert.equal(result.metrics.failedEvents, 0);
	assert.equal(result.metrics.dryRunDeliveries, 1);
	assert.equal(result.failureReason, null);
});

test("claimed alert events remain retryable after delivery failure", async () => {
	const processed = [];
	const failed = [];
	const result = await processClaimedAlertEvents({
		runId: "run-2",
		events: [createEvent("event-2")],
		subscriptions: [createSubscription("subscription-2")],
		isEventInPreference: () => true,
		sendDelivery: async () => {
			throw new Error("provider offline");
		},
		markProcessed: async (eventId) => {
			processed.push(eventId);
		},
		markFailed: async (eventId, failureReason) => {
			failed.push({ eventId, failureReason });
		}
	});

	assert.deepEqual(processed, []);
	assert.deepEqual(failed, [{ eventId: "event-2", failureReason: "provider offline" }]);
	assert.equal(result.metrics.failedEvents, 1);
	assert.equal(result.failureReason, "1 alert event deliveries failed.");
});

test("claim-first alert flow can split work across two workers without overlap", async () => {
	const queue = [createEvent("event-a"), createEvent("event-b")];
	const claimedIds = new Set();
	const processed = [];

	const claimPendingPositionEvents = async (limit) => {
		const claimed = [];
		for (const event of queue) {
			if (claimed.length >= limit) {
				break;
			}
			if (claimedIds.has(event.id)) {
				continue;
			}
			claimedIds.add(event.id);
			claimed.push(event);
		}
		return claimed;
	};

	const processWorkerBatch = async (runId) => {
		const events = await claimPendingPositionEvents(1);
		return processClaimedAlertEvents({
			runId,
			events,
			subscriptions: [createSubscription("subscription-1")],
			isEventInPreference: () => true,
			sendDelivery: async () => ({ deliveryMode: "dry-run" }),
			markProcessed: async (eventId) => {
				processed.push(`${runId}:${eventId}`);
			},
			markFailed: async () => {}
		});
	};

	await Promise.all([processWorkerBatch("run-a"), processWorkerBatch("run-b")]);

	assert.deepEqual(processed.sort(), ["run-a:event-a", "run-b:event-b"]);
});

test("shared worker runtime persists success summaries", async () => {
	const summaries = [];
	const summary = await runSharedWorker({
		workerName: "alerts",
		hasDatabase: true,
		persistRunSummary: async (input) => {
			summaries.push(input);
		},
		execute: async () => ({
			metrics: { deliveriesCompleted: 3 },
			warnings: ["Email provider not configured; alert deliveries ran in dry-run mode."],
			failureReason: null
		}),
		logger: {
			info() {},
			error() {}
		}
	});

	assert.equal(summary.success, true);
	assert.equal(summaries.length, 1);
	assert.equal(summaries[0].success, true);
	assert.deepEqual(summaries[0].metrics, { deliveriesCompleted: 3 });
});

test("shared worker runtime persists failure summaries", async () => {
	const summaries = [];
	await assert.rejects(
		runSharedWorker({
			workerName: "pricing-refresh",
			hasDatabase: true,
			persistRunSummary: async (input) => {
				summaries.push(input);
			},
			execute: async () => {
				throw new Error("market API timed out");
			},
			logger: {
				info() {},
				error() {}
			}
		}),
		/market API timed out/
	);

	assert.equal(summaries.length, 1);
	assert.equal(summaries[0].success, false);
	assert.equal(summaries[0].failureReason, "market API timed out");
});
