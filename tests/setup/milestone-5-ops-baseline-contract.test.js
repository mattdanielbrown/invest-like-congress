import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("render blueprint defines ingestion and pricing cron schedules", async () => {
	const renderBlueprint = await load("render.yaml");

	assert.equal(renderBlueprint.includes("congress-portfolio-ingestion-hourly"), true);
	assert.equal(renderBlueprint.includes("schedule: \"12 * * * *\""), true);
	assert.equal(renderBlueprint.includes("congress-portfolio-pricing-refresh"), true);
	assert.equal(renderBlueprint.includes("schedule: \"0 15,18,21 * * 1-5\""), true);
});

test("production readiness runbook covers required failure modes", async () => {
	const runbook = await load("docs/operations/production-readiness-minimum.md");

	assert.equal(runbook.includes("stale ingestion"), true);
	assert.equal(runbook.includes("failed pricing refresh"), true);
	assert.equal(runbook.includes("failed alert delivery"), true);
	assert.equal(runbook.includes("empty UI"), true);
	assert.equal(runbook.includes("DB misconfiguration"), true);
	assert.equal(runbook.includes("/api/system/status"), true);
	assert.equal(runbook.includes("worker_run_summaries"), true);
});
