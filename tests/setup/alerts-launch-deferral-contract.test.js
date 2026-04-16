import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("alerts APIs are hard-gated while launch state is deferred", async () => {
	const subscribeRoute = await load("src/app/api/alerts/subscribe/route.ts");
	const unsubscribeRoute = await load("src/app/api/alerts/unsubscribe/route.ts");

	assert.equal(subscribeRoute.includes("alerts_deferred_for_launch"), true);
	assert.equal(unsubscribeRoute.includes("alerts_deferred_for_launch"), true);
	assert.equal(subscribeRoute.includes("subscriptionsApiEnabled"), true);
	assert.equal(unsubscribeRoute.includes("subscriptionsApiEnabled"), true);
});

test("system status and alert worker use shared launch policy", async () => {
	const statusRoute = await load("src/app/api/system/status/route.ts");
	const alertWorker = await load("src/lib/workers/run-alert-worker.ts");
	const launchPolicy = await load("src/lib/alerts/launch-policy.ts");
	const repository = await load("src/lib/db/repository.ts");

	assert.equal(statusRoute.includes("alertsLaunchPolicy"), true);
	assert.equal(alertWorker.includes("workerDispatchEnabled"), true);
	assert.equal(launchPolicy.includes("launchState: \"deferred\""), true);
	assert.equal(repository.includes("positionChangeEventsEnabled"), true);
	assert.equal(repository.includes("derivedState.positionChangeEvents.map((event) => event.sourceTransactionId)"), true);
	assert.equal(repository.includes("if (positionChangeEventsEnabled)"), true);
});
