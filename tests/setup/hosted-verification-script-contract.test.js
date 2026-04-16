import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("hosted verification script enforces required status checks and SQL summaries", async () => {
	const script = await load("scripts/ops/verify-hosted-m5.sh");
	assert.equal(script.includes("HOSTED_BASE_URL and DATABASE_URL are required"), true);
	assert.equal(script.includes("alerts.launchState"), true);
	assert.equal(script.includes("subscriptionsApiEnabled"), true);
	assert.equal(script.includes("workerDispatchEnabled"), true);
	assert.equal(script.includes("pendingAlertEventCount"), true);
	assert.equal(script.includes("ingestion_run_summaries"), true);
	assert.equal(script.includes("worker_run_summaries"), true);
	assert.equal(script.includes("worker_name='pricing-refresh'"), true);
});

test("hosted verification runbook and readme reference the canonical script", async () => {
	const runbook = await load("docs/operations/production-readiness-minimum.md");
	const readme = await load("README.md");
	assert.equal(runbook.includes("./scripts/ops/verify-hosted-m5.sh"), true);
	assert.equal(runbook.includes("Fallback manual checks"), true);
	assert.equal(readme.includes("./scripts/ops/verify-hosted-m5.sh"), true);
});
