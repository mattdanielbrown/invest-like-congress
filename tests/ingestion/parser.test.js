import test from "node:test";
import assert from "node:assert/strict";
import { parseOfficialRecord } from "../../src/lib/ingestion/parser.ts";

test("parseOfficialRecord accepts valid candidates and quarantines invalid ones with precise reasons", () => {
	const result = parseOfficialRecord(
		{
			sourceSystem: "house-disclosures",
			sourceDocumentId: "house-2026-accuracy",
			documentUrl: "https://example.com/doc.pdf",
			filedAt: "2026-03-21",
			memberDisplayName: "Jane Example",
			chamber: "house",
			year: 2026
		},
		[
			{
				assetDisplayName: "Example Corp",
				tickerSymbol: "EXM",
				action: "buy",
				tradeDate: "2026-03-11",
				shareQuantity: null,
				pricePerShare: null,
				totalAmountMin: 1000,
				totalAmountMax: 1500,
				ownershipType: null,
				comment: null,
				provenanceFields: [
					{ fieldName: "asset_name", fieldValue: "Example Corp", sourceText: "Example Corp (EXM)", sourceLocation: "line:1", confidence: 0.8 },
					{ fieldName: "action", fieldValue: "buy", sourceText: "Purchase", sourceLocation: "line:2", confidence: 0.8 },
					{ fieldName: "trade_date", fieldValue: "2026-03-11", sourceText: "03/11/2026", sourceLocation: "line:3", confidence: 0.8 },
					{ fieldName: "amount_range", fieldValue: "$1000-$1500", sourceText: "$1,000 - $1,500", sourceLocation: "line:4", confidence: 0.8 }
				],
				parserConfidence: 0.8,
				extractionMode: "pdf-text",
				parseIssue: null
			},
			{
				assetDisplayName: "Broken Corp",
				tickerSymbol: null,
				action: "sell",
				tradeDate: "",
				shareQuantity: null,
				pricePerShare: null,
				totalAmountMin: null,
				totalAmountMax: null,
				ownershipType: null,
				comment: null,
				provenanceFields: [
					{ fieldName: "asset_name", fieldValue: "Broken Corp", sourceText: "Broken Corp", sourceLocation: "line:5", confidence: 0.6 },
					{ fieldName: "action", fieldValue: "sell", sourceText: "Sale", sourceLocation: "line:6", confidence: 0.6 }
				],
				parserConfidence: 0.4,
				extractionMode: "pdf-text",
				parseIssue: "invalid-trade-date"
			}
		]
	);

	assert.equal(result.normalizedTransactions.length, 1);
	assert.equal(result.sourceAttributions.length, 4);
	assert.deepEqual(result.quarantinedRows, [
		{
			sourceDocumentId: "house-2026-accuracy",
			reason: "invalid-trade-date"
		}
	]);
});
