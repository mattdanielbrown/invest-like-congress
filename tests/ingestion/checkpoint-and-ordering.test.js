import test from "node:test";
import assert from "node:assert/strict";
import { maybeSkipByCheckpoint } from "../../src/lib/ingestion/checkpoint-utils.ts";
import { sortOfficialFilingRecords } from "../../src/lib/ingestion/official-source-sorting.ts";

test("hourly checkpoint skip treats same-day records as already seen", () => {
	assert.equal(maybeSkipByCheckpoint("2026-03-21", "2026-03-21"), true);
	assert.equal(maybeSkipByCheckpoint("2026-03-20", "2026-03-21"), true);
	assert.equal(maybeSkipByCheckpoint("2026-03-22", "2026-03-21"), false);
});

test("official filing sort is deterministic by filedAt then sourceDocumentId", () => {
	const sorted = sortOfficialFilingRecords([
		{
			sourceSystem: "house-disclosures",
			sourceDocumentId: "z-last",
			documentUrl: "https://example.com/z",
			filedAt: "2026-03-22",
			memberDisplayName: "Later Example",
			chamber: "house",
			year: 2026
		},
		{
			sourceSystem: "senate-disclosures",
			sourceDocumentId: "a-first",
			documentUrl: "https://example.com/a",
			filedAt: "2026-03-21",
			memberDisplayName: "Alpha Example",
			chamber: "senate",
			year: 2026
		},
		{
			sourceSystem: "house-disclosures",
			sourceDocumentId: "b-second",
			documentUrl: "https://example.com/b",
			filedAt: "2026-03-21",
			memberDisplayName: "Bravo Example",
			chamber: "house",
			year: 2026
		}
	]);

	assert.deepEqual(sorted.map((record) => record.sourceDocumentId), ["a-first", "b-second", "z-last"]);
});
