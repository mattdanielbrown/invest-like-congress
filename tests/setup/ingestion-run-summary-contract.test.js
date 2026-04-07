import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("pipeline hardening migration adds ingestion run summaries table", async () => {
	const migration = await load("sql/004_pipeline_hardening.sql");
	assert.equal(migration.includes("CREATE TABLE IF NOT EXISTS ingestion_run_summaries"), true);
	assert.equal(migration.includes("idx_ingestion_run_summaries_latest"), true);
	assert.equal(migration.includes("fk_normalized_transactions_filing_document_id"), true);
});

test("ingestion runtime persists run summaries", async () => {
	const source = await load("src/lib/ingestion/live-ingestion.ts");
	assert.equal(source.includes("persistIngestionRunSummary"), true);
	assert.equal(source.includes("runId"), true);
	assert.equal(source.includes("failureReason"), true);
});
