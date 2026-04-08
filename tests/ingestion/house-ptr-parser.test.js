import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseHousePtrText } from "../../src/lib/ingestion/parsers/house-ptr-parser.ts";

test("house parser extracts valid transactions and flags incomplete entries", async () => {
	const fixture = await fs.readFile("tests/fixtures/house/periodic-transaction-report.txt", "utf8");
	const candidates = parseHousePtrText(fixture);

	assert.equal(candidates.length, 4);

	assert.equal(candidates[0].assetDisplayName, "Acme Holdings, Inc.");
	assert.equal(candidates[0].tickerSymbol, "ACME");
	assert.equal(candidates[0].action, "buy");
	assert.equal(candidates[0].tradeDate, "2026-04-02");
	assert.equal(candidates[0].totalAmountMin, 1001);
	assert.equal(candidates[0].totalAmountMax, 15000);
	assert.equal(candidates[0].parseIssue, null);

	assert.equal(candidates[1].assetDisplayName, "Blue Ocean Fund");
	assert.equal(candidates[1].action, "sell");
	assert.equal(candidates[1].tradeDate, "2026-04-18");
	assert.equal(candidates[1].totalAmountMin, 50001);
	assert.equal(candidates[1].totalAmountMax, 100000);

	assert.equal(candidates[2].assetDisplayName, "Example Single Value Trust");
	assert.equal(candidates[2].tickerSymbol, "EST");
	assert.equal(candidates[2].totalAmountMin, 5000);
	assert.equal(candidates[2].totalAmountMax, 5000);

	assert.equal(candidates[3].assetDisplayName, "Incomplete Entry Corp");
	assert.equal(candidates[3].tradeDate, "");
	assert.equal(candidates[3].totalAmountMin, null);
	assert.equal(candidates[3].parseIssue, "invalid-trade-date");
});
