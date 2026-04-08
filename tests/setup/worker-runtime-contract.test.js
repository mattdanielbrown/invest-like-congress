import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("runtime convergence migration adds unique indexes for derived ingestion tables", async () => {
	const migration = await load("sql/005_runtime_convergence.sql");
	assert.equal(migration.includes("idx_realized_profit_events_source_transaction"), true);
	assert.equal(migration.includes("idx_position_state_events_source_transaction"), true);
	assert.equal(migration.includes("idx_position_change_events_source_transaction"), true);
});

test("ingestion worker delegates to shared live ingestion runtime", async () => {
	const source = await load("scripts/lib/run-ingestion-service.js");
	assert.equal(source.includes("runLiveIngestion"), true);
	assert.equal(source.includes("parsePtrCandidatesFromText"), false);
	assert.equal(source.includes("fetchHouseReferences"), false);
});
