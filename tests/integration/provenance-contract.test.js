import test from "node:test";
import assert from "node:assert/strict";
import { parseOfficialRecord } from "../../src/lib/ingestion/parser.ts";

test("parser generates transaction records with provenance fields", () => {
	const result = parseOfficialRecord(
		{
			sourceSystem: "house-disclosures",
			sourceDocumentId: "house-2026-1",
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
					{
						fieldName: "asset_name",
						fieldValue: "Example Corp",
						sourceText: "Example Corp (EXM)",
						sourceLocation: "line:1",
						confidence: 0.8
					}
				],
				parserConfidence: 0.8,
				extractionMode: "pdf-text"
			}
		]
	);

	assert.equal(result.normalizedTransactions.length, 1);
	assert.equal(result.sourceAttributions.length, 1);
	assert.equal(result.quarantinedRows.length, 0);
	assert.equal(result.sourceAttributions[0].fieldName, "asset_name");
});
