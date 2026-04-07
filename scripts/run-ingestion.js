import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";

function buildSampleRecords() {
	return [
		{
			sourceSystem: "house-disclosures",
			sourceDocumentId: "house-doc-2026-001",
			documentUrl: "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/10000123.pdf",
			filedAt: "2026-04-01",
			memberName: "Nancy Pelosi",
			assetDisplayName: "Amazon.com, Inc.",
			action: "purchase",
			tradeDate: "2026-03-11",
			shareQuantity: 10,
			pricePerShare: 178,
			totalAmountMin: 1780,
			totalAmountMax: 1780
		},
		{
			sourceSystem: "senate-disclosures",
			sourceDocumentId: "senate-doc-2026-001",
			documentUrl: "https://efdsearch.senate.gov/search/view/paper/123ABC45-DE67-89FG-HI10-1234567890AB/",
			filedAt: "2026-03-30",
			memberName: "Mitt Romney",
			assetDisplayName: "SPDR S&P 500 ETF Trust",
			action: "purchase",
			tradeDate: "2026-03-19",
			shareQuantity: 15,
			pricePerShare: 522,
			totalAmountMin: 7830,
			totalAmountMax: 7830
		}
	];
}

function toCanonicalIdentifiers(record) {
	return {
		memberId: `member-${record.memberName.toLowerCase().replaceAll(" ", "-")}`,
		assetId: `asset-${record.assetDisplayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`
	};
}

async function run() {
	const records = buildSampleRecords();
	if (!process.env.DATABASE_URL) {
		console.info("[ingestion:dry-run] Parsed records", records.length);
		return;
	}

	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();

	try {
		for (const record of records) {
			const checksum = createHash("sha256").update(JSON.stringify(record)).digest("hex");
			const identifiers = toCanonicalIdentifiers(record);

			await client.query(
				`INSERT INTO members (id, full_name, party, state_code, chamber)
				 VALUES ($1, $2, $3, $4, $5)
				 ON CONFLICT (id) DO NOTHING`,
				[
					identifiers.memberId,
					record.memberName,
					record.memberName === "Nancy Pelosi" ? "D" : "R",
					record.memberName === "Nancy Pelosi" ? "CA" : "UT",
					record.sourceSystem.startsWith("house") ? "house" : "senate"
				]
			);

			await client.query(
				`INSERT INTO assets (id, display_name, ticker_symbol, asset_type, is_symbol_resolved)
				 VALUES ($1, $2, $3, $4, true)
				 ON CONFLICT (id) DO NOTHING`,
				[
					identifiers.assetId,
					record.assetDisplayName,
					record.assetDisplayName.includes("Amazon") ? "AMZN" : "SPY",
					record.assetDisplayName.includes("ETF") ? "etf" : "equity"
				]
			);

			await client.query(
				`INSERT INTO filing_documents (id, source_system, source_document_id, document_url, filed_at, verification_status, ingestion_checksum)
				 VALUES ($1, $2, $3, $4, $5, 'verified', $6)
				 ON CONFLICT (source_document_id) DO UPDATE SET ingestion_checksum = EXCLUDED.ingestion_checksum`,
				[
					`doc-${record.sourceDocumentId}`,
					record.sourceSystem,
					record.sourceDocumentId,
					record.documentUrl,
					record.filedAt,
					checksum
				]
			);

			await client.query(
				`INSERT INTO normalized_transactions (
					id,
					member_id,
					asset_id,
					action,
					trade_date,
					filing_date,
					share_quantity,
					price_per_share,
					total_amount_min,
					total_amount_max,
					filing_document_id,
					verification_status,
					is_new_position
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'verified', true)
				ON CONFLICT (id) DO NOTHING`,
				[
					randomUUID(),
					identifiers.memberId,
					identifiers.assetId,
					record.action === "purchase" ? "buy" : "sell",
					record.tradeDate,
					record.filedAt,
					record.shareQuantity,
					record.pricePerShare,
					record.totalAmountMin,
					record.totalAmountMax,
					`doc-${record.sourceDocumentId}`
				]
			);
		}

		await client.query("UPDATE system_status SET last_ingestion_at = now() WHERE id = 1");
		console.info("[ingestion] Completed successfully", { records: records.length });
	} finally {
		await client.end();
	}
}

run().catch((error) => {
	console.error("Ingestion failed", error);
	process.exit(1);
});
