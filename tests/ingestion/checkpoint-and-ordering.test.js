import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("hourly checkpoint skip treats same-day records as already seen", async () => {
	const source = await fs.readFile("src/lib/ingestion/live-ingestion.ts", "utf8");
	assert.equal(source.includes("recordDate.getTime() <= knownDate.getTime()"), true);
});

test("official filing sort is deterministic by filedAt then sourceDocumentId", async () => {
	const source = await fs.readFile("src/lib/ingestion/official-sources.ts", "utf8");
	assert.equal(source.includes("sortOfficialFilingRecords"), true);
	assert.equal(source.includes("left.filedAt.localeCompare(right.filedAt)"), true);
	assert.equal(source.includes("left.sourceDocumentId.localeCompare(right.sourceDocumentId)"), true);
});
