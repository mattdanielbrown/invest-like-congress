import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseSenatePtrHtml } from "../../src/lib/ingestion/parsers/senate-ptr-parser.ts";

test("senate parser extracts only transaction rows and preserves stable fields", async () => {
	const fixture = await fs.readFile("tests/fixtures/senate/periodic-transaction-report.html", "utf8");
	const candidates = parseSenatePtrHtml(fixture);

	assert.equal(candidates.length, 3);

	assert.equal(candidates[0].assetDisplayName, "Summit Energy");
	assert.equal(candidates[0].tickerSymbol, "SME");
	assert.equal(candidates[0].action, "buy");
	assert.equal(candidates[0].tradeDate, "2026-03-14");
	assert.equal(candidates[0].totalAmountMin, 1001);
	assert.equal(candidates[0].totalAmountMax, 15000);
	assert.equal(candidates[0].ownershipType, "Self");
	assert.equal(candidates[0].comment, "Initial buy");
	assert.equal(candidates[0].parseIssue, null);

	assert.equal(candidates[1].assetDisplayName, "Municipal Bond Fund");
	assert.equal(candidates[1].action, "sell");
	assert.equal(candidates[1].tradeDate, "2026-03-19");
	assert.equal(candidates[1].totalAmountMin, 15001);
	assert.equal(candidates[1].totalAmountMax, 50000);
	assert.equal(candidates[1].ownershipType, "Spouse");

	assert.equal(candidates[2].assetDisplayName, "Incomplete Senate Entry");
	assert.equal(candidates[2].tradeDate, "");
	assert.equal(candidates[2].totalAmountMin, null);
	assert.equal(candidates[2].parseIssue, "invalid-trade-date");
});
