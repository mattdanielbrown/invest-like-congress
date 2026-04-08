import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("worker runtime hardening migration adds worker summaries and alert delivery state", async () => {
	const migration = await load("sql/006_worker_runtime_hardening.sql");
	assert.equal(migration.includes("CREATE TABLE IF NOT EXISTS worker_run_summaries"), true);
	assert.equal(migration.includes("processing_started_at"), true);
	assert.equal(migration.includes("processing_run_id"), true);
	assert.equal(migration.includes("delivery_attempt_count"), true);
	assert.equal(migration.includes("last_delivery_error"), true);
	assert.equal(migration.includes("idx_worker_run_summaries_latest"), true);
	assert.equal(migration.includes("idx_position_change_events_delivery_queue"), true);
});

test("alert queue claim uses skip locked semantics", async () => {
	const source = await load("src/lib/db/repository.ts");
	assert.equal(source.includes("FOR UPDATE SKIP LOCKED"), true);
	assert.equal(source.includes("claimPendingPositionEvents"), true);
	assert.equal(source.includes("markPositionEventDeliveryFailed"), true);
});

test("pricing and alert worker entrypoints delegate to shared runtime modules", async () => {
	const pricingSource = await load("scripts/run-pricing-refresh.js");
	const alertSource = await load("scripts/run-alert-worker.js");
	assert.equal(pricingSource.includes("runPricingRefreshWorkerFromCli"), true);
	assert.equal(pricingSource.includes("runPricingRefreshWorker()"), false);
	assert.equal(alertSource.includes("runAlertWorkerFromCli"), true);
	assert.equal(alertSource.includes("runAlertWorker()"), false);
});
