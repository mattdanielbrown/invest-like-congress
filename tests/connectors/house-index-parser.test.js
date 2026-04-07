import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

function parseHouseIndexText(indexText) {
	return indexText
		.split(/\r?\n/)
		.slice(1)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => line.split("\t"))
		.filter((columns) => columns.length >= 9 && columns[4] === "P")
		.map((columns) => ({
			documentId: columns[8],
			filingType: columns[4]
		}));
}

test("house index parser keeps only periodic transaction rows", async () => {
	const fixture = await fs.readFile("tests/fixtures/house/2026FD-sample.txt", "utf8");
	const rows = parseHouseIndexText(fixture);

	assert.equal(rows.length, 2);
	assert.equal(rows[0].documentId, "20034201");
	assert.equal(rows[1].documentId, "20033751");
	assert.ok(rows.every((row) => row.filingType === "P"));
});
