import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getDatabasePool } from "@/lib/db/pool";
import type { MemberQueryFilters } from "@/lib/db/schema-types";
import type {
	AlertSubscription,
	AssetActivityRow,
	IngestionCheckpoint,
	MemberHoldingsRow,
	PositionChangeEvent,
	SubscriptionPreference,
	TransactionWithPresentation
} from "@/lib/domain/types";
import type { OfficialFilingRecord } from "@/lib/ingestion/official-sources";
import type { ParsedFilingBatch } from "@/lib/ingestion/parser";

interface StatusRow {
	lastIngestionAt: string | null;
	lastPricingRefreshAt: string | null;
	nextPricingRefreshAt: string | null;
	marketSessionState: string;
}

interface PersistParsedFilingInput {
	record: OfficialFilingRecord;
	parsedRecord: ParsedFilingBatch;
	rawCachePath: string;
	rawFetchedAt: string;
	rawContentHash: string;
	complianceMode: string;
}

interface PersistRawDocumentInput {
	id: string;
	sourceSystem: string;
	sourceDocumentId: string;
	cachePath: string;
	contentHash: string;
	fetchedAt: string;
	contentType: string | null;
	contentLength: number;
}

function getRequiredPool(): Pool {
	return getDatabasePool();
}

export async function listMembersWithHoldings(filters: MemberQueryFilters): Promise<MemberHoldingsRow[]> {
	void filters;
	const pool = getRequiredPool();

	const query = `
		SELECT
			m.id,
			m.full_name,
			m.party,
			m.state_code,
			m.chamber,
			COUNT(h.id)::int AS holdings_count,
			COALESCE(SUM(h.unrealized_profit_loss), 0)::float8 AS unrealized_profit_loss_total,
			COALESCE(SUM(rp.realized_profit_loss), 0)::float8 AS realized_profit_loss_total,
			COALESCE(MAX(h.verified_updated_at), now()) AS last_verified_update_at
		FROM members m
		LEFT JOIN holding_snapshots h
			ON h.member_id = m.id
			AND h.verification_status = 'verified'
		LEFT JOIN realized_profit_events rp
			ON rp.member_id = m.id
		GROUP BY m.id
		ORDER BY last_verified_update_at DESC
		LIMIT 200
	`;

	const result = await pool.query(query);
	return result.rows.map((row) => ({
		member: {
			id: row.id,
			fullName: row.full_name,
			party: row.party,
			stateCode: row.state_code,
			chamber: row.chamber
		},
		holdingsCount: Number(row.holdings_count),
		realizedProfitLossTotal: Number(row.realized_profit_loss_total),
		unrealizedProfitLossTotal: Number(row.unrealized_profit_loss_total),
		lastVerifiedUpdateAt: new Date(row.last_verified_update_at).toISOString()
	}));
}

export async function listMemberTransactions(memberId: string): Promise<TransactionWithPresentation[]> {
	const pool = getRequiredPool();

	const query = `
		SELECT
			t.id,
			t.source_transaction_key,
			t.member_id,
			t.asset_id,
			t.action,
			t.trade_date,
			t.filing_date,
			t.share_quantity,
			t.price_per_share,
			t.total_amount_min,
			t.total_amount_max,
			t.filing_document_id,
			t.verification_status,
			t.is_new_position,
			t.parser_confidence,
			t.extraction_mode,
			a.display_name,
			a.ticker_symbol,
			a.asset_type,
			a.is_symbol_resolved,
			rpe.realized_profit_loss,
			COALESCE(ps.position_status, 'open') AS position_status_after_transaction,
			COALESCE(fd.source_system, 'unknown') AS filing_source_system,
			COALESCE(fd.source_document_id, t.filing_document_id) AS filing_source_document_id,
			COALESCE(fd.document_url, '') AS filing_document_url,
			COALESCE(
				json_agg(
					json_build_object(
						'fieldName', sa.field_name,
						'fieldValue', sa.field_value,
						'sourceText', sa.source_text,
						'sourceLocation', sa.source_location,
						'confidence', sa.confidence
					)
				) FILTER (WHERE sa.id IS NOT NULL),
				'[]'::json
			) AS provenance_fields
		FROM normalized_transactions t
		JOIN assets a ON a.id = t.asset_id
		LEFT JOIN realized_profit_events rpe ON rpe.source_transaction_id = t.id
		LEFT JOIN position_state_events ps ON ps.source_transaction_id = t.id
		LEFT JOIN filing_documents fd ON fd.source_document_id = t.filing_document_id
		LEFT JOIN source_attributions sa ON sa.entity_id = t.id AND sa.entity_type = 'normalized-transaction'
		WHERE t.member_id = $1 AND t.verification_status = 'verified'
		GROUP BY
			t.id,
			a.id,
			rpe.realized_profit_loss,
			ps.position_status,
			fd.source_system,
			fd.source_document_id,
			fd.document_url
		ORDER BY t.trade_date DESC
	`;

	const result = await pool.query(query, [memberId]);
	return result.rows.map((row) => ({
		transaction: {
			id: row.id,
			sourceTransactionKey: row.source_transaction_key,
			memberId: row.member_id,
			assetId: row.asset_id,
			action: row.action,
			tradeDate: row.trade_date,
			filingDate: row.filing_date,
			shareQuantity: row.share_quantity,
			pricePerShare: row.price_per_share,
			totalAmountMin: row.total_amount_min,
			totalAmountMax: row.total_amount_max,
			filingDocumentId: row.filing_document_id,
			verificationStatus: row.verification_status,
			isNewPosition: row.is_new_position,
			parserConfidence: Number(row.parser_confidence ?? 0.5),
			extractionMode: row.extraction_mode ?? "metadata"
		},
		asset: {
			id: row.asset_id,
			displayName: row.display_name,
			tickerSymbol: row.ticker_symbol,
			assetType: row.asset_type,
			isSymbolResolved: row.is_symbol_resolved
		},
		realizedProfitLoss: row.realized_profit_loss,
		positionStatusAfterTransaction: row.position_status_after_transaction,
		filingSource: {
			sourceSystem: row.filing_source_system,
			sourceDocumentId: row.filing_source_document_id,
			documentUrl: row.filing_document_url
		},
		provenanceFields: Array.isArray(row.provenance_fields) ? row.provenance_fields : []
	}));
}

export async function getAssetActivity(assetId: string): Promise<AssetActivityRow | null> {
	const pool = getRequiredPool();

	const query = `
		SELECT
			a.id,
			a.display_name,
			a.ticker_symbol,
			a.asset_type,
			a.is_symbol_resolved,
			COUNT(DISTINCT hs.member_id)::int AS holder_count,
			COUNT(DISTINCT CASE WHEN nt.action = 'buy' THEN nt.member_id END)::int AS buyer_count,
			COUNT(DISTINCT CASE WHEN nt.action = 'sell' THEN nt.member_id END)::int AS seller_count,
			COUNT(DISTINCT CASE WHEN hs.status = 'open' THEN hs.member_id END)::int AS open_position_count,
			COUNT(DISTINCT CASE WHEN hs.status = 'closed' THEN hs.member_id END)::int AS closed_position_count,
			MAX(nt.trade_date) AS latest_activity_at
		FROM assets a
		LEFT JOIN holding_snapshots hs ON hs.asset_id = a.id
		LEFT JOIN normalized_transactions nt ON nt.asset_id = a.id AND nt.verification_status = 'verified'
		WHERE a.id = $1
		GROUP BY a.id
	`;

	const result = await pool.query(query, [assetId]);
	if ((result.rowCount ?? 0) === 0) {
		return null;
	}

	const row = result.rows[0];
	return {
		asset: {
			id: row.id,
			displayName: row.display_name,
			tickerSymbol: row.ticker_symbol,
			assetType: row.asset_type,
			isSymbolResolved: row.is_symbol_resolved
		},
		holderCount: Number(row.holder_count),
		buyerCount: Number(row.buyer_count),
		sellerCount: Number(row.seller_count),
		openPositionCount: Number(row.open_position_count),
		closedPositionCount: Number(row.closed_position_count),
		latestActivityAt: row.latest_activity_at ? new Date(row.latest_activity_at).toISOString() : null
	};
}

export async function getSystemStatus(): Promise<StatusRow> {
	const pool = getRequiredPool();

	const query = `
		SELECT
			last_ingestion_at,
			last_pricing_refresh_at,
			next_pricing_refresh_at,
			market_session_state
		FROM system_status
		LIMIT 1
	`;

	const result = await pool.query(query);
	if ((result.rowCount ?? 0) === 0) {
		return {
			lastIngestionAt: null,
			lastPricingRefreshAt: null,
			nextPricingRefreshAt: null,
			marketSessionState: "unknown"
		};
	}

	const row = result.rows[0];
	return {
		lastIngestionAt: row.last_ingestion_at ? new Date(row.last_ingestion_at).toISOString() : null,
		lastPricingRefreshAt: row.last_pricing_refresh_at ? new Date(row.last_pricing_refresh_at).toISOString() : null,
		nextPricingRefreshAt: row.next_pricing_refresh_at ? new Date(row.next_pricing_refresh_at).toISOString() : null,
		marketSessionState: row.market_session_state
	};
}

export async function upsertAlertSubscription(emailAddress: string, preference: SubscriptionPreference): Promise<AlertSubscription> {
	const pool = getRequiredPool();
	const verificationToken = randomUUID();

	const query = `
		INSERT INTO alert_subscriptions (email_address, is_verified, verification_token, preference_json)
		VALUES ($1, false, $2, $3::jsonb)
		ON CONFLICT (email_address)
		DO UPDATE SET
			is_verified = false,
			verification_token = EXCLUDED.verification_token,
			preference_json = EXCLUDED.preference_json,
			unsubscribed_at = null
		RETURNING id, email_address, is_verified, verification_token, unsubscribed_at, preference_json, created_at
	`;

	const result = await pool.query(query, [emailAddress, verificationToken, JSON.stringify(preference)]);
	const row = result.rows[0];
	return {
		id: row.id,
		emailAddress: row.email_address,
		isVerified: row.is_verified,
		verificationToken: row.verification_token,
		unsubscribedAt: row.unsubscribed_at,
		preference: row.preference_json,
		createdAt: row.created_at
	};
}

export async function unsubscribeAlertEmail(emailAddress: string): Promise<boolean> {
	const pool = getRequiredPool();

	const query = `
		UPDATE alert_subscriptions
		SET unsubscribed_at = now()
		WHERE email_address = $1 AND unsubscribed_at IS NULL
	`;
	const result = await pool.query(query, [emailAddress]);
	return (result.rowCount ?? 0) > 0;
}

export async function enqueuePositionChangeEvent(event: Omit<PositionChangeEvent, "id" | "createdAt">): Promise<PositionChangeEvent> {
	const pool = getRequiredPool();
	const row: PositionChangeEvent = {
		...event,
		id: randomUUID(),
		createdAt: new Date().toISOString()
	};

	const query = `
		INSERT INTO position_change_events (
			id,
			member_id,
			asset_id,
			action,
			share_delta,
			realized_profit_loss,
			source_transaction_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, member_id, asset_id, action, share_delta, realized_profit_loss, source_transaction_id, created_at
	`;

	const result = await pool.query(query, [row.id, row.memberId, row.assetId, row.action, row.shareDelta, row.realizedProfitLoss, row.sourceTransactionId]);
	const inserted = result.rows[0];
	return {
		id: inserted.id,
		memberId: inserted.member_id,
		assetId: inserted.asset_id,
		action: inserted.action,
		shareDelta: inserted.share_delta,
		realizedProfitLoss: inserted.realized_profit_loss,
		sourceTransactionId: inserted.source_transaction_id,
		createdAt: new Date(inserted.created_at).toISOString()
	};
}

export async function listPendingPositionEvents(limit = 100): Promise<PositionChangeEvent[]> {
	const pool = getRequiredPool();

	const query = `
		SELECT id, member_id, asset_id, action, share_delta, realized_profit_loss, source_transaction_id, created_at
		FROM position_change_events
		WHERE processed_at IS NULL
		ORDER BY created_at ASC
		LIMIT $1
	`;

	const result = await pool.query(query, [limit]);
	return result.rows.map((row) => ({
		id: row.id,
		memberId: row.member_id,
		assetId: row.asset_id,
		action: row.action,
		shareDelta: Number(row.share_delta),
		realizedProfitLoss: row.realized_profit_loss,
		sourceTransactionId: row.source_transaction_id,
		createdAt: new Date(row.created_at).toISOString()
	}));
}

export async function listVerifiedSubscriptions(): Promise<AlertSubscription[]> {
	const pool = getRequiredPool();

	const query = `
		SELECT id, email_address, is_verified, verification_token, unsubscribed_at, preference_json, created_at
		FROM alert_subscriptions
		WHERE is_verified = true AND unsubscribed_at IS NULL
	`;
	const result = await pool.query(query);
	return result.rows.map((row) => ({
		id: row.id,
		emailAddress: row.email_address,
		isVerified: row.is_verified,
		verificationToken: row.verification_token,
		unsubscribedAt: row.unsubscribed_at,
		preference: row.preference_json,
		createdAt: row.created_at
	}));
}

export async function markPositionEventProcessed(eventId: string): Promise<void> {
	const pool = getRequiredPool();

	await pool.query("UPDATE position_change_events SET processed_at = now() WHERE id = $1", [eventId]);
}

export async function listQuarantinedTransactions(limit = 100): Promise<{ id: string; reason: string; createdAt: string }[]> {
	const pool = getRequiredPool();

	const query = `
		SELECT source_document_id, reason, created_at
		FROM ingestion_quarantine_events
		ORDER BY created_at DESC
		LIMIT $1
	`;
	const result = await pool.query(query, [limit]);
	return result.rows.map((row) => ({
		id: row.source_document_id,
		reason: row.reason,
		createdAt: new Date(row.created_at).toISOString()
	}));
}

export async function verifyAlertSubscriptionByToken(token: string): Promise<boolean> {
	const pool = getRequiredPool();

	const query = `
		UPDATE alert_subscriptions
		SET is_verified = true
		WHERE verification_token = $1
	`;
	const result = await pool.query(query, [token]);
	return (result.rowCount ?? 0) > 0;
}

export async function updateSystemStatus(status: Partial<StatusRow>): Promise<void> {
	const pool = getRequiredPool();

	const query = `
		UPDATE system_status
		SET
			last_ingestion_at = COALESCE($1, last_ingestion_at),
			last_pricing_refresh_at = COALESCE($2, last_pricing_refresh_at),
			next_pricing_refresh_at = COALESCE($3, next_pricing_refresh_at),
			market_session_state = COALESCE($4, market_session_state)
		WHERE id = 1
	`;

	await pool.query(query, [
		status.lastIngestionAt ?? null,
		status.lastPricingRefreshAt ?? null,
		status.nextPricingRefreshAt ?? null,
		status.marketSessionState ?? null
	]);
}

export async function getIngestionCheckpoint(sourceSystem: string, cursorKey: string): Promise<IngestionCheckpoint | null> {
	const pool = getRequiredPool();

	const result = await pool.query(
		`SELECT source_system, cursor_key, last_seen_filed_at, last_run_at
		 FROM ingestion_checkpoints
		 WHERE source_system = $1 AND cursor_key = $2`,
		[sourceSystem, cursorKey]
	);

	if ((result.rowCount ?? 0) === 0) {
		return null;
	}

	const row = result.rows[0];
	return {
		sourceSystem: row.source_system,
		cursorKey: row.cursor_key,
		lastSeenFiledAt: row.last_seen_filed_at ? new Date(row.last_seen_filed_at).toISOString().slice(0, 10) : null,
		lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null
	};
}

export async function upsertIngestionCheckpoint(sourceSystem: string, cursorKey: string, lastSeenFiledAt: string | null): Promise<void> {
	const pool = getRequiredPool();

	await pool.query(
		`INSERT INTO ingestion_checkpoints (source_system, cursor_key, last_seen_filed_at, last_run_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (source_system, cursor_key)
		 DO UPDATE SET
			last_seen_filed_at = EXCLUDED.last_seen_filed_at,
			last_run_at = now()`,
		[sourceSystem, cursorKey, lastSeenFiledAt]
	);
}

export async function persistRawDocumentCache(entry: PersistRawDocumentInput): Promise<void> {
	const pool = getRequiredPool();

	await pool.query(
		`INSERT INTO raw_document_cache (
			id,
			source_system,
			source_document_id,
			cache_path,
			content_hash,
			fetched_at,
			content_type,
			content_length
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (source_document_id)
		DO UPDATE SET
			cache_path = EXCLUDED.cache_path,
			content_hash = EXCLUDED.content_hash,
			fetched_at = EXCLUDED.fetched_at,
			content_type = EXCLUDED.content_type,
			content_length = EXCLUDED.content_length`,
		[
			entry.id,
			entry.sourceSystem,
			entry.sourceDocumentId,
			entry.cachePath,
			entry.contentHash,
			entry.fetchedAt,
			entry.contentType,
			entry.contentLength
		]
	);
}

export async function persistQuarantineRows(rows: Array<{ sourceDocumentId: string; reason: string }>): Promise<void> {
	const pool = getRequiredPool();

	for (const row of rows) {
		await pool.query(
			`INSERT INTO ingestion_quarantine_events (id, source_document_id, reason, created_at)
			 VALUES ($1, $2, $3, now())`,
			[randomUUID(), row.sourceDocumentId, row.reason]
		);
	}
}

export async function persistParsedFiling(input: PersistParsedFilingInput): Promise<void> {
	const pool = getRequiredPool();

	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		await client.query(
			`INSERT INTO filing_documents (
				id,
				source_system,
				source_document_id,
				document_url,
				filed_at,
				verification_status,
				ingestion_checksum,
				raw_cache_path,
				raw_fetched_at,
				raw_content_hash,
				compliance_mode
			)
			VALUES ($1, $2, $3, $4, $5, 'verified', $6, $7, $8, $9, $10)
			ON CONFLICT (source_document_id)
			DO UPDATE SET
				document_url = EXCLUDED.document_url,
				filed_at = EXCLUDED.filed_at,
				ingestion_checksum = EXCLUDED.ingestion_checksum,
				raw_cache_path = EXCLUDED.raw_cache_path,
				raw_fetched_at = EXCLUDED.raw_fetched_at,
				raw_content_hash = EXCLUDED.raw_content_hash,
				compliance_mode = EXCLUDED.compliance_mode`,
			[
				input.record.sourceDocumentId,
				input.record.sourceSystem,
				input.record.sourceDocumentId,
				input.record.documentUrl,
				input.record.filedAt,
				input.parsedRecord.documentChecksum,
				input.rawCachePath,
				input.rawFetchedAt,
				input.rawContentHash,
				input.complianceMode
			]
		);

		for (const transaction of input.parsedRecord.normalizedTransactions) {
			await client.query(
				`INSERT INTO members (id, full_name, party, state_code, chamber)
				 VALUES ($1, $2, $3, $4, $5)
				 ON CONFLICT (id) DO NOTHING`,
				[
					transaction.memberId,
					input.record.memberDisplayName,
					"U",
					"NA",
					input.record.chamber
				]
			);

			await client.query(
				`INSERT INTO assets (id, display_name, ticker_symbol, asset_type, is_symbol_resolved)
				 VALUES ($1, $2, $3, $4, $5)
				 ON CONFLICT (id) DO NOTHING`,
				[
					transaction.assetId,
					transaction.assetId.replace("asset-", "").replaceAll("-", " "),
					null,
					"unknown",
					false
				]
			);

			const upsertedTransaction = await client.query(
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
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'verified', $13, $14, $15)
				ON CONFLICT (source_transaction_key)
				DO UPDATE SET
					trade_date = EXCLUDED.trade_date,
					filing_date = EXCLUDED.filing_date,
					share_quantity = EXCLUDED.share_quantity,
					price_per_share = EXCLUDED.price_per_share,
					total_amount_min = EXCLUDED.total_amount_min,
					total_amount_max = EXCLUDED.total_amount_max,
					parser_confidence = EXCLUDED.parser_confidence,
					extraction_mode = EXCLUDED.extraction_mode,
					verification_status = 'verified'
				RETURNING id`,
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
					transaction.isNewPosition,
					transaction.parserConfidence,
					transaction.extractionMode
				]
			);

			const persistedTransactionId = upsertedTransaction.rows[0].id as string;
			await client.query(
				"DELETE FROM source_attributions WHERE entity_type = 'normalized-transaction' AND entity_id = $1",
				[persistedTransactionId]
			);

			const attributionRows = input.parsedRecord.sourceAttributions.filter((row) => row.entityId === transaction.id);
			for (const attribution of attributionRows) {
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
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
					[
						attribution.id,
						attribution.entityType,
						persistedTransactionId,
						attribution.fieldName,
						attribution.fieldValue,
						attribution.filingDocumentId,
						attribution.sourceText,
						attribution.sourceLocation,
						attribution.extractorVersion,
						attribution.confidence
					]
				);
			}
		}

		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

export async function getFilingProvenance(filingDocumentId: string): Promise<{
	filingDocumentId: string;
	sourceSystem: string;
	sourceDocumentId: string;
	documentUrl: string;
	complianceMode: string | null;
	transactions: Array<{
		transactionId: string;
		sourceTransactionKey: string;
		tradeDate: string;
		action: string;
		provenanceFields: Array<{
			fieldName: string;
			fieldValue: string | null;
			sourceText: string;
			sourceLocation: string | null;
			confidence: number;
		}>;
	}>;
} | null> {
	const pool = getRequiredPool();

	const filingResult = await pool.query(
		`SELECT source_system, source_document_id, document_url, compliance_mode
		 FROM filing_documents
		 WHERE source_document_id = $1`,
		[filingDocumentId]
	);

	if ((filingResult.rowCount ?? 0) === 0) {
		return null;
	}

	const transactionResult = await pool.query(
		`SELECT
			t.id,
			t.source_transaction_key,
			t.trade_date,
			t.action,
			COALESCE(
				json_agg(
					json_build_object(
						'fieldName', sa.field_name,
						'fieldValue', sa.field_value,
						'sourceText', sa.source_text,
						'sourceLocation', sa.source_location,
						'confidence', sa.confidence
					)
				) FILTER (WHERE sa.id IS NOT NULL),
				'[]'::json
			) AS provenance_fields
		FROM normalized_transactions t
		LEFT JOIN source_attributions sa ON sa.entity_id = t.id AND sa.entity_type = 'normalized-transaction'
		WHERE t.filing_document_id = $1
		GROUP BY t.id
		ORDER BY t.trade_date DESC`,
		[filingDocumentId]
	);

	const filing = filingResult.rows[0];
	return {
		filingDocumentId,
		sourceSystem: filing.source_system,
		sourceDocumentId: filing.source_document_id,
		documentUrl: filing.document_url,
		complianceMode: filing.compliance_mode,
		transactions: transactionResult.rows.map((row) => ({
			transactionId: row.id,
			sourceTransactionKey: row.source_transaction_key,
			tradeDate: row.trade_date,
			action: row.action,
			provenanceFields: Array.isArray(row.provenance_fields) ? row.provenance_fields : []
		}))
	};
}
