import { createDatabaseClient } from "./lib/database-connection-config.js";
import { loadEnvironmentFile } from "./lib/load-environment.js";

loadEnvironmentFile();

const demoMembers = [
	{ id: "demo-member-nancy-pelosi", fullName: "Nancy Pelosi", party: "D", stateCode: "CA", chamber: "house" },
	{ id: "demo-member-mitt-romney", fullName: "Mitt Romney", party: "R", stateCode: "UT", chamber: "senate" }
];

const demoAssets = [
	{ id: "demo-asset-amzn", displayName: "Amazon.com, Inc.", tickerSymbol: "AMZN", assetType: "equity" },
	{ id: "demo-asset-msft", displayName: "Microsoft Corporation", tickerSymbol: "MSFT", assetType: "equity" }
];

const demoFilings = [
	{
		id: "demo-filing-house-1",
		sourceSystem: "demo-seed",
		sourceDocumentId: "demo-house-2026-001",
		documentUrl: "https://example.gov/demo/house-2026-001",
		filedAt: "2026-03-21",
		ingestionChecksum: "demo-checksum-house-1"
	},
	{
		id: "demo-filing-house-2",
		sourceSystem: "demo-seed",
		sourceDocumentId: "demo-house-2026-002",
		documentUrl: "https://example.gov/demo/house-2026-002",
		filedAt: "2026-04-02",
		ingestionChecksum: "demo-checksum-house-2"
	},
	{
		id: "demo-filing-senate-1",
		sourceSystem: "demo-seed",
		sourceDocumentId: "demo-senate-2026-001",
		documentUrl: "https://example.gov/demo/senate-2026-001",
		filedAt: "2026-03-30",
		ingestionChecksum: "demo-checksum-senate-1"
	}
];

const demoTransactions = [
	{
		id: "demo-txn-1",
		sourceTransactionKey: "demo-source-key-1",
		memberId: "demo-member-nancy-pelosi",
		assetId: "demo-asset-amzn",
		action: "buy",
		tradeDate: "2026-03-11",
		filingDate: "2026-03-21",
		shareQuantity: 10,
		pricePerShare: 178,
		totalAmountMin: 1780,
		totalAmountMax: 1780,
		filingDocumentId: "demo-house-2026-001",
		isNewPosition: true
	},
	{
		id: "demo-txn-2",
		sourceTransactionKey: "demo-source-key-2",
		memberId: "demo-member-nancy-pelosi",
		assetId: "demo-asset-amzn",
		action: "sell",
		tradeDate: "2026-03-27",
		filingDate: "2026-04-02",
		shareQuantity: 5,
		pricePerShare: 190,
		totalAmountMin: 950,
		totalAmountMax: 950,
		filingDocumentId: "demo-house-2026-002",
		isNewPosition: false
	},
	{
		id: "demo-txn-3",
		sourceTransactionKey: "demo-source-key-3",
		memberId: "demo-member-mitt-romney",
		assetId: "demo-asset-msft",
		action: "buy",
		tradeDate: "2026-03-19",
		filingDate: "2026-03-30",
		shareQuantity: 8,
		pricePerShare: 410,
		totalAmountMin: 3280,
		totalAmountMax: 3280,
		filingDocumentId: "demo-senate-2026-001",
		isNewPosition: true
	}
];

async function shouldSeedDemoData(client) {
	const result = await client.query(
		`SELECT COUNT(*)::int AS count
		FROM normalized_transactions
		WHERE verification_status = 'verified'`
	);
	const count = Number(result.rows[0]?.count ?? 0);
	return count === 0;
}

async function upsertDemoData(client) {
	await client.query("BEGIN");
	try {
		for (const member of demoMembers) {
			await client.query(
				`INSERT INTO members (id, full_name, party, state_code, chamber)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (id)
				DO UPDATE SET
					full_name = EXCLUDED.full_name,
					party = EXCLUDED.party,
					state_code = EXCLUDED.state_code,
					chamber = EXCLUDED.chamber`,
				[member.id, member.fullName, member.party, member.stateCode, member.chamber]
			);
		}

		for (const asset of demoAssets) {
			await client.query(
				`INSERT INTO assets (id, display_name, ticker_symbol, asset_type, is_symbol_resolved)
				VALUES ($1, $2, $3, $4, true)
				ON CONFLICT (id)
				DO UPDATE SET
					display_name = EXCLUDED.display_name,
					ticker_symbol = EXCLUDED.ticker_symbol,
					asset_type = EXCLUDED.asset_type,
					is_symbol_resolved = true`,
				[asset.id, asset.displayName, asset.tickerSymbol, asset.assetType]
			);
		}

		for (const filing of demoFilings) {
			await client.query(
				`INSERT INTO filing_documents (
					id,
					source_system,
					source_document_id,
					document_url,
					filed_at,
					verification_status,
					ingestion_checksum,
					compliance_mode
				)
				VALUES ($1, $2, $3, $4, $5, 'verified', $6, 'demo')
				ON CONFLICT (source_document_id)
				DO UPDATE SET
					document_url = EXCLUDED.document_url,
					filed_at = EXCLUDED.filed_at,
					verification_status = EXCLUDED.verification_status,
					ingestion_checksum = EXCLUDED.ingestion_checksum,
					compliance_mode = EXCLUDED.compliance_mode`,
				[
					filing.id,
					filing.sourceSystem,
					filing.sourceDocumentId,
					filing.documentUrl,
					filing.filedAt,
					filing.ingestionChecksum
				]
			);
		}

		for (const transaction of demoTransactions) {
			await client.query(
				`INSERT INTO normalized_transactions (
					id,
					source_transaction_key,
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
					is_new_position,
					parser_confidence,
					extraction_mode
				)
				VALUES (
					$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'verified', $13, 1.0, 'metadata'
				)
				ON CONFLICT (source_transaction_key)
				DO UPDATE SET
					member_id = EXCLUDED.member_id,
					asset_id = EXCLUDED.asset_id,
					action = EXCLUDED.action,
					trade_date = EXCLUDED.trade_date,
					filing_date = EXCLUDED.filing_date,
					share_quantity = EXCLUDED.share_quantity,
					price_per_share = EXCLUDED.price_per_share,
					total_amount_min = EXCLUDED.total_amount_min,
					total_amount_max = EXCLUDED.total_amount_max,
					filing_document_id = EXCLUDED.filing_document_id,
					verification_status = EXCLUDED.verification_status,
					is_new_position = EXCLUDED.is_new_position,
					parser_confidence = EXCLUDED.parser_confidence,
					extraction_mode = EXCLUDED.extraction_mode`,
				[
					transaction.id,
					transaction.sourceTransactionKey,
					transaction.memberId,
					transaction.assetId,
					transaction.action,
					transaction.tradeDate,
					transaction.filingDate,
					transaction.shareQuantity,
					transaction.pricePerShare,
					transaction.totalAmountMin,
					transaction.totalAmountMax,
					transaction.filingDocumentId,
					transaction.isNewPosition
				]
			);
		}

		await client.query(
			`DELETE FROM source_attributions
			WHERE entity_type = 'normalized-transaction'
				AND entity_id IN ($1, $2, $3)`,
			["demo-txn-1", "demo-txn-2", "demo-txn-3"]
		);

		await client.query(
			`INSERT INTO source_attributions (
				id,
				entity_type,
				entity_id,
				field_name,
				field_value,
				filing_document_id,
				source_text,
				source_location,
				extractor_version,
				confidence
			)
			VALUES
				('demo-attr-1', 'normalized-transaction', 'demo-txn-1', 'trade_date', '2026-03-11', 'demo-house-2026-001', '03/11/2026', 'line:12', 'demo', 1.0),
				('demo-attr-2', 'normalized-transaction', 'demo-txn-2', 'trade_date', '2026-03-27', 'demo-house-2026-002', '03/27/2026', 'line:14', 'demo', 1.0),
				('demo-attr-3', 'normalized-transaction', 'demo-txn-3', 'trade_date', '2026-03-19', 'demo-senate-2026-001', '03/19/2026', 'row:3', 'demo', 1.0)`
		);

		await client.query("DELETE FROM realized_profit_events WHERE source_transaction_id IN ($1, $2, $3)", ["demo-txn-1", "demo-txn-2", "demo-txn-3"]);
		await client.query("DELETE FROM position_state_events WHERE source_transaction_id IN ($1, $2, $3)", ["demo-txn-1", "demo-txn-2", "demo-txn-3"]);
		await client.query("DELETE FROM position_change_events WHERE source_transaction_id IN ($1, $2, $3)", ["demo-txn-1", "demo-txn-2", "demo-txn-3"]);
		await client.query("DELETE FROM holding_snapshots WHERE member_id IN ($1, $2)", ["demo-member-nancy-pelosi", "demo-member-mitt-romney"]);

		await client.query(
			`INSERT INTO realized_profit_events (
				id,
				member_id,
				asset_id,
				source_transaction_id,
				realized_profit_loss
			)
			VALUES ($1, $2, $3, $4, $5)`,
			["demo-rpe-1", "demo-member-nancy-pelosi", "demo-asset-amzn", "demo-txn-2", 60]
		);

		await client.query(
			`INSERT INTO position_state_events (id, source_transaction_id, position_status)
			VALUES
				('demo-pse-1', 'demo-txn-1', 'open'),
				('demo-pse-2', 'demo-txn-2', 'open'),
				('demo-pse-3', 'demo-txn-3', 'open')`
		);

		await client.query(
			`INSERT INTO position_change_events (
				id,
				member_id,
				asset_id,
				action,
				share_delta,
				realized_profit_loss,
				source_transaction_id
			)
			VALUES
				('demo-pce-1', 'demo-member-nancy-pelosi', 'demo-asset-amzn', 'position-opened', 10, NULL, 'demo-txn-1'),
				('demo-pce-2', 'demo-member-nancy-pelosi', 'demo-asset-amzn', 'position-partially-sold', -5, 60, 'demo-txn-2'),
				('demo-pce-3', 'demo-member-mitt-romney', 'demo-asset-msft', 'position-opened', 8, NULL, 'demo-txn-3')`
		);

		await client.query(
			`INSERT INTO holding_snapshots (
				id,
				member_id,
				asset_id,
				shares_held,
				average_cost_basis_per_share,
				last_market_price,
				unrealized_profit_loss,
				status,
				verification_status,
				verified_updated_at
			)
			VALUES
				('demo-holding-1', 'demo-member-nancy-pelosi', 'demo-asset-amzn', 5, 178, 196, 90, 'open', 'verified', now()),
				('demo-holding-2', 'demo-member-mitt-romney', 'demo-asset-msft', 8, 410, 421, 88, 'open', 'verified', now())`
		);

		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	}
}

async function run() {
	if (!process.env.DATABASE_URL) {
		console.error("DATABASE_URL is required.");
		process.exit(1);
	}

	const client = createDatabaseClient(process.env.DATABASE_URL);
	await client.connect();
	try {
		const seedRequired = await shouldSeedDemoData(client);
		if (!seedRequired) {
			console.info("[demo-seed] skipped; verified transactions already present");
			return;
		}

		await upsertDemoData(client);
		console.info("[demo-seed] inserted fallback demo data");
	} finally {
		await client.end();
	}
}

run().catch((error) => {
	console.error("[demo-seed] failed", error);
	process.exit(1);
});
