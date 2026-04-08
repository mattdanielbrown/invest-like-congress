import test from "node:test";
import assert from "node:assert/strict";
import {
	cleanAssetDisplayName,
	extractTickerSymbol,
	normalizeAction,
	normalizeTradeDate,
	parseAmountRange
} from "../../src/lib/ingestion/parsers/parser-normalization.ts";

test("normalization helpers parse dates, amounts, and ticker cleanup", () => {
	assert.equal(normalizeAction("Purchase"), "buy");
	assert.equal(normalizeAction("Sale (Partial)"), "sell");
	assert.equal(normalizeTradeDate("4/2/26"), "2026-04-02");
	assert.equal(normalizeTradeDate("04-18-2026"), "2026-04-18");
	assert.equal(normalizeTradeDate("04/31/2026"), null);

	assert.deepEqual(parseAmountRange("$1,001 - $15,000"), {
		min: 1001,
		max: 15000,
		isSingleValue: false
	});
	assert.deepEqual(parseAmountRange("$5,000", { allowSingleValue: true }), {
		min: 5000,
		max: 5000,
		isSingleValue: true
	});

	assert.equal(extractTickerSymbol("Acme Holdings (ACME)"), "ACME");
	assert.equal(cleanAssetDisplayName("Acme Holdings (ACME)"), "Acme Holdings");
});
