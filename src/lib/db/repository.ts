import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDatabasePool } from "@/lib/db/pool";
import type { MemberQueryFilters } from "@/lib/db/schema-types";
import type {
	AlertSubscription,
	AssetActivityRow,
	IngestionCheckpoint,
	IngestionRunSummary,
	MemberHoldingsRow,
	MemberPortfolioSummary,
	NormalizedTransaction,
	PositionChangeEvent,
	SubscriptionPreference,
	TransactionWithPresentation,
	WorkerName,
	WorkerRunSummary
} from "@/lib/domain/types";
import type {
	DerivedHoldingSnapshotInput,
	DerivedPortfolioState,
	DerivedPositionChangeEventInput,
	DerivedPositionStateEventInput,
	DerivedRealizedProfitEventInput
} from "@/lib/ingestion/derived-portfolio-state";
import type { OfficialFilingRecord } from "@/lib/ingestion/official-sources";
import type { ParsedFilingBatch } from "@/lib/ingestion/parser";

interface StatusRow {
	lastIngestionAt: string | null;
	lastPricingRefreshAt: string | null;
	nextPricingRefreshAt: string | null;
	marketSessionState: string;
}

type IngestionMode = "backfill" | "hourly";

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

interface PersistIngestionRunSummaryInput {
	runId: string;
	mode: IngestionMode;
	sourceSystem: string;
	cursorKey: string;
	fromYear: number;
	toYear: number;
	startedAt: string;
	finishedAt: string;
	success: boolean;
	failureReason: string | null;
	fetchedDocuments: number;
	parsedDocuments: number;
	quarantinedDocuments: number;
	extractedTransactions: number;
	provenanceCoverageRatio: number;
	warnings: string[];
}

interface PersistWorkerRunSummaryInput {
	runId: string;
	workerName: WorkerName;
	startedAt: string;
	finishedAt: string;
	success: boolean;
	failureReason: string | null;
	metrics: Record<string, unknown>;
	warnings: string[];
}

interface ExistingHoldingSnapshotPriceRow {
	memberId: string;
	assetId: string;
	lastMarketPrice: number | null;
}

interface PricingCandidateRow {
	assetId: string;
	tickerSymbol: string;
}

function getRequiredPool(): Pool {
	return getDatabasePool();
}

export async function listMembersWithHoldings(filters: MemberQueryFilters): Promise<MemberHoldingsRow[]> {
	const pool = getRequiredPool();
	const whereClauses: string[] = [];
	const values: Array<string | number> = [];

	if (filters.chamber) {
		values.push(filters.chamber);
		whereClauses.push(`m.chamber = $${values.length}`);
	}
	if (filters.party) {
		values.push(filters.party);
		whereClauses.push(`m.party = $${values.length}`);
	}
	if (filters.stateCode) {
		values.push(filters.stateCode.toUpperCase());
		whereClauses.push(`m.state_code = $${values.length}`);
	}

	const requiresTransactionFilter = Boolean(filters.assetId || filters.dateFrom || filters.dateTo);
	if (requiresTransactionFilter) {
		const transactionClauses = ["nt.member_id = m.id", "nt.verification_status = 'verified'"];
		if (filters.assetId) {
			values.push(filters.assetId);
			transactionClauses.push(`nt.asset_id = $${values.length}`);
		}
		if (filters.dateFrom) {
			values.push(filters.dateFrom);
			transactionClauses.push(`nt.trade_date >= $${values.length}::date`);
		}
		if (filters.dateTo) {
			values.push(filters.dateTo);
			transactionClauses.push(`nt.trade_date <= $${values.length}::date`);
		}
		whereClauses.push(`EXISTS (
			SELECT 1
			FROM normalized_transactions nt
			WHERE ${transactionClauses.join(" AND ")}
		)`);
	}

	const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
	const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
	const sortBy = filters.sortBy ?? "date";
	const orderBySql = (() => {
		if (sortBy === "shares") {
			return `holdings_count ${sortDirection}, last_verified_update_at DESC`;
		}
		if (sortBy === "profit_loss") {
			return `profit_loss_total ${sortDirection}, last_verified_update_at DESC`;
		}
		if (sortBy === "co_holder_count") {
			return `co_holder_count ${sortDirection}, last_verified_update_at DESC`;
		}
		return `last_verified_update_at ${sortDirection}`;
	})();

	const page = Math.max(1, filters.page ?? 1);
	const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
	const offset = (page - 1) * pageSize;
	values.push(pageSize, offset);
	const limitPlaceholder = `$${values.length - 1}`;
	const offsetPlaceholder = `$${values.length}`;

	const query = `
		WITH selected_members AS (
			SELECT m.id, m.full_name, m.party, m.state_code, m.chamber
			FROM members m
			${whereSql}
		),
		holding_aggregation AS (
			SELECT
				h.member_id,
				COUNT(*) FILTER (WHERE h.status = 'open')::int AS holdings_count,
				COALESCE(SUM(h.unrealized_profit_loss), 0)::float8 AS unrealized_profit_loss_total,
				COALESCE(MAX(h.verified_updated_at), now()) AS last_verified_update_at
			FROM holding_snapshots h
			WHERE h.verification_status = 'verified'
			GROUP BY h.member_id
		),
		realized_aggregation AS (
			SELECT
				rp.member_id,
				COALESCE(SUM(rp.realized_profit_loss), 0)::float8 AS realized_profit_loss_total
			FROM realized_profit_events rp
			GROUP BY rp.member_id
		),
		co_holder_aggregation AS (
			SELECT
				base.member_id,
				COALESCE(COUNT(DISTINCT peer.member_id) - 1, 0)::int AS co_holder_count
			FROM holding_snapshots base
			JOIN holding_snapshots peer
				ON peer.asset_id = base.asset_id
				AND peer.verification_status = 'verified'
			WHERE base.verification_status = 'verified'
				AND base.status = 'open'
			GROUP BY base.member_id
		)
		SELECT
			sm.id,
			sm.full_name,
			sm.party,
			sm.state_code,
			sm.chamber,
			COALESCE(ha.holdings_count, 0)::int AS holdings_count,
			COALESCE(ha.unrealized_profit_loss_total, 0)::float8 AS unrealized_profit_loss_total,
			COALESCE(ra.realized_profit_loss_total, 0)::float8 AS realized_profit_loss_total,
			COALESCE(cha.co_holder_count, 0)::int AS co_holder_count,
			(COALESCE(ha.unrealized_profit_loss_total, 0) + COALESCE(ra.realized_profit_loss_total, 0))::float8 AS profit_loss_total,
			COALESCE(ha.last_verified_update_at, now()) AS last_verified_update_at
		FROM selected_members sm
		LEFT JOIN holding_aggregation ha ON ha.member_id = sm.id
		LEFT JOIN realized_aggregation ra ON ra.member_id = sm.id
		LEFT JOIN co_holder_aggregation cha ON cha.member_id = sm.id
		ORDER BY ${orderBySql}
		LIMIT ${limitPlaceholder}
		OFFSET ${offsetPlaceholder}
	`;

	const result = await pool.query(query, values);
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

export async function listAssetsWithActivity(limit = 200): Promise<AssetActivityRow[]> {
	const pool = getRequiredPool();
	const result = await pool.query(
		`SELECT
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
		LEFT JOIN holding_snapshots hs ON hs.asset_id = a.id AND hs.verification_status = 'verified'
		LEFT JOIN normalized_transactions nt ON nt.asset_id = a.id AND nt.verification_status = 'verified'
		GROUP BY a.id
		ORDER BY holder_count DESC, latest_activity_at DESC NULLS LAST, a.display_name ASC
		LIMIT $1`,
		[limit]
	);

	return result.rows.map((row) => ({
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
	}));
}

export async function getMemberPortfolioSummary(memberId: string): Promise<MemberPortfolioSummary> {
	const pool = getRequiredPool();

	const realizedResult = await pool.query(
		`SELECT COALESCE(SUM(realized_profit_loss), 0)::float8 AS realized_profit_loss_total
		FROM realized_profit_events
		WHERE member_id = $1`,
		[memberId]
	);
	const realizedProfitLossTotal = Number(realizedResult.rows[0]?.realized_profit_loss_total ?? 0);

	const holdingsResult = await pool.query(
		`SELECT
			h.asset_id,
			h.shares_held,
			h.average_cost_basis_per_share,
			h.last_market_price,
			COALESCE(h.unrealized_profit_loss, 0)::float8 AS unrealized_profit_loss,
			a.display_name,
			a.ticker_symbol,
			a.asset_type,
			a.is_symbol_resolved
		FROM holding_snapshots h
		JOIN assets a ON a.id = h.asset_id
		WHERE h.member_id = $1
			AND h.verification_status = 'verified'
			AND h.status = 'open'
		ORDER BY a.display_name ASC`,
		[memberId]
	);

	const openPositions = holdingsResult.rows.map((row) => {
		const remainingShares = Number(row.shares_held ?? 0);
		const averageCostBasisPerShare = Number(row.average_cost_basis_per_share ?? 0);
		const lastMarketPrice = row.last_market_price === null ? null : Number(row.last_market_price);
		const unrealizedProfitLoss = Number(row.unrealized_profit_loss ?? 0);
		const priceForValue = lastMarketPrice ?? averageCostBasisPerShare;
		return {
			asset: {
				id: row.asset_id,
				displayName: row.display_name,
				tickerSymbol: row.ticker_symbol,
				assetType: row.asset_type,
				isSymbolResolved: row.is_symbol_resolved
			},
			remainingShares,
			averageCostBasisPerShare,
			lastMarketPrice,
			unrealizedProfitLoss,
			currentPositionValue: remainingShares * priceForValue
		};
	});

	const unrealizedProfitLossTotal = openPositions.reduce((sum, row) => sum + row.unrealizedProfitLoss, 0);
	const currentHeldAssetsValue = openPositions.reduce((sum, row) => sum + row.currentPositionValue, 0);

	return {
		memberId,
		realizedProfitLossTotal,
		unrealizedProfitLossTotal,
		cumulativeReturnTotal: realizedProfitLossTotal + unrealizedProfitLossTotal,
		currentHeldAssetsValue,
		openPositions
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
		SELECT
			id,
			member_id,
			asset_id,
			action,
			share_delta,
			realized_profit_loss,
			source_transaction_id,
			created_at,
			processing_started_at,
			processing_run_id,
			delivery_attempt_count,
			last_delivery_error
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
		createdAt: new Date(row.created_at).toISOString(),
		processingStartedAt: row.processing_started_at ? new Date(row.processing_started_at).toISOString() : null,
		processingRunId: row.processing_run_id ?? null,
		deliveryAttemptCount: Number(row.delivery_attempt_count ?? 0),
		lastDeliveryError: row.last_delivery_error ?? null
	}));
}

export async function claimPendingPositionEvents(limit: number, runId: string): Promise<PositionChangeEvent[]> {
	const pool = getRequiredPool();
	const client = await pool.connect();

	try {
		await client.query("BEGIN");
		const result = await client.query(
			`WITH claimable_events AS (
				SELECT id
				FROM position_change_events
				WHERE processed_at IS NULL
					AND (
						processing_started_at IS NULL
						OR processing_started_at < now() - interval '15 minutes'
					)
				ORDER BY created_at ASC
				LIMIT $1
				FOR UPDATE SKIP LOCKED
			)
			UPDATE position_change_events AS events
			SET
				processing_started_at = now(),
				processing_run_id = $2,
				last_delivery_error = NULL
			FROM claimable_events
			WHERE events.id = claimable_events.id
			RETURNING
				events.id,
				events.member_id,
				events.asset_id,
				events.action,
				events.share_delta,
				events.realized_profit_loss,
				events.source_transaction_id,
				events.created_at,
				events.processing_started_at,
				events.processing_run_id,
				events.delivery_attempt_count,
				events.last_delivery_error`,
			[limit, runId]
		);
		await client.query("COMMIT");

		return result.rows.map((row) => ({
			id: row.id,
			memberId: row.member_id,
			assetId: row.asset_id,
			action: row.action,
			shareDelta: Number(row.share_delta),
			realizedProfitLoss: row.realized_profit_loss === null ? null : Number(row.realized_profit_loss),
			sourceTransactionId: row.source_transaction_id,
			createdAt: new Date(row.created_at).toISOString(),
			processingStartedAt: row.processing_started_at ? new Date(row.processing_started_at).toISOString() : null,
			processingRunId: row.processing_run_id ?? null,
			deliveryAttemptCount: Number(row.delivery_attempt_count ?? 0),
			lastDeliveryError: row.last_delivery_error ?? null
		}));
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
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

export async function markPositionEventProcessed(eventId: string, runId: string): Promise<void> {
	const pool = getRequiredPool();

	await pool.query(
		`UPDATE position_change_events
		SET
			processed_at = now(),
			processing_started_at = NULL,
			processing_run_id = NULL,
			last_delivery_error = NULL
		WHERE id = $1
			AND processing_run_id = $2`,
		[eventId, runId]
	);
}

export async function markPositionEventDeliveryFailed(eventId: string, runId: string, failureReason: string): Promise<void> {
	const pool = getRequiredPool();

	await pool.query(
		`UPDATE position_change_events
		SET
			processing_started_at = NULL,
			processing_run_id = NULL,
			delivery_attempt_count = delivery_attempt_count + 1,
			last_delivery_error = $3
		WHERE id = $1
			AND processing_run_id = $2`,
		[eventId, runId, failureReason]
	);
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

export async function persistIngestionRunSummary(input: PersistIngestionRunSummaryInput): Promise<void> {
	const pool = getRequiredPool();

	await pool.query(
		`INSERT INTO ingestion_run_summaries (
			run_id,
			mode,
			source_system,
			cursor_key,
			from_year,
			to_year,
			started_at,
			finished_at,
			success,
			failure_reason,
			fetched_documents,
			parsed_documents,
			quarantined_documents,
			extracted_transactions,
			provenance_coverage_ratio,
			warnings_json
		)
		VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10, $11, $12,
			$13, $14, $15, $16::jsonb
		)
		ON CONFLICT (run_id)
		DO UPDATE SET
			finished_at = EXCLUDED.finished_at,
			success = EXCLUDED.success,
			failure_reason = EXCLUDED.failure_reason,
			fetched_documents = EXCLUDED.fetched_documents,
			parsed_documents = EXCLUDED.parsed_documents,
			quarantined_documents = EXCLUDED.quarantined_documents,
			extracted_transactions = EXCLUDED.extracted_transactions,
			provenance_coverage_ratio = EXCLUDED.provenance_coverage_ratio,
			warnings_json = EXCLUDED.warnings_json`,
		[
			input.runId,
			input.mode,
			input.sourceSystem,
			input.cursorKey,
			input.fromYear,
			input.toYear,
			input.startedAt,
			input.finishedAt,
			input.success,
			input.failureReason,
			input.fetchedDocuments,
			input.parsedDocuments,
			input.quarantinedDocuments,
			input.extractedTransactions,
			input.provenanceCoverageRatio,
			JSON.stringify(input.warnings)
		]
	);
}

export async function persistWorkerRunSummary(input: PersistWorkerRunSummaryInput): Promise<void> {
	const pool = getRequiredPool();

	await pool.query(
		`INSERT INTO worker_run_summaries (
			run_id,
			worker_name,
			started_at,
			finished_at,
			success,
			failure_reason,
			metrics_json,
			warnings_json
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
		ON CONFLICT (run_id)
		DO UPDATE SET
			finished_at = EXCLUDED.finished_at,
			success = EXCLUDED.success,
			failure_reason = EXCLUDED.failure_reason,
			metrics_json = EXCLUDED.metrics_json,
			warnings_json = EXCLUDED.warnings_json`,
		[
			input.runId,
			input.workerName,
			input.startedAt,
			input.finishedAt,
			input.success,
			input.failureReason,
			JSON.stringify(input.metrics),
			JSON.stringify(input.warnings)
		]
	);
}

export async function getLatestIngestionRunSummary(): Promise<IngestionRunSummary | null> {
	const pool = getRequiredPool();
	const result = await pool.query(
		`SELECT
			run_id,
			mode,
			source_system,
			cursor_key,
			from_year,
			to_year,
			started_at,
			finished_at,
			success,
			failure_reason,
			fetched_documents,
			parsed_documents,
			quarantined_documents,
			extracted_transactions,
			provenance_coverage_ratio,
			warnings_json
		FROM ingestion_run_summaries
		ORDER BY started_at DESC
		LIMIT 1`
	);

	if ((result.rowCount ?? 0) === 0) {
		return null;
	}

	const row = result.rows[0];
	return {
		runId: row.run_id,
		mode: row.mode,
		sourceSystem: row.source_system,
		cursorKey: row.cursor_key,
		fromYear: Number(row.from_year),
		toYear: Number(row.to_year),
		startedAt: new Date(row.started_at).toISOString(),
		finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
		success: Boolean(row.success),
		failureReason: row.failure_reason ?? null,
		fetchedDocuments: Number(row.fetched_documents),
		parsedDocuments: Number(row.parsed_documents),
		quarantinedDocuments: Number(row.quarantined_documents),
		extractedTransactions: Number(row.extracted_transactions),
		provenanceCoverageRatio: Number(row.provenance_coverage_ratio),
		warnings: Array.isArray(row.warnings_json) ? row.warnings_json : []
	};
}

function mapWorkerRunSummary(row: Record<string, unknown>): WorkerRunSummary {
	return {
		runId: String(row.run_id),
		workerName: row.worker_name as WorkerName,
		startedAt: new Date(String(row.started_at)).toISOString(),
		finishedAt: new Date(String(row.finished_at)).toISOString(),
		success: Boolean(row.success),
		failureReason: row.failure_reason ? String(row.failure_reason) : null,
		metrics: typeof row.metrics_json === "object" && row.metrics_json !== null ? row.metrics_json as Record<string, unknown> : {},
		warnings: Array.isArray(row.warnings_json) ? row.warnings_json as string[] : []
	};
}

export async function getLatestWorkerRunSummary(workerName: WorkerName): Promise<WorkerRunSummary | null> {
	const pool = getRequiredPool();
	const result = await pool.query(
		`SELECT
			run_id,
			worker_name,
			started_at,
			finished_at,
			success,
			failure_reason,
			metrics_json,
			warnings_json
		FROM worker_run_summaries
		WHERE worker_name = $1
		ORDER BY started_at DESC
		LIMIT 1`,
		[workerName]
	);

	if ((result.rowCount ?? 0) === 0) {
		return null;
	}

	return mapWorkerRunSummary(result.rows[0]);
}

export async function getLatestSuccessfulWorkerRunSummary(workerName: WorkerName): Promise<WorkerRunSummary | null> {
	const pool = getRequiredPool();
	const result = await pool.query(
		`SELECT
			run_id,
			worker_name,
			started_at,
			finished_at,
			success,
			failure_reason,
			metrics_json,
			warnings_json
		FROM worker_run_summaries
		WHERE worker_name = $1
			AND success = true
		ORDER BY started_at DESC
		LIMIT 1`,
		[workerName]
	);

	if ((result.rowCount ?? 0) === 0) {
		return null;
	}

	return mapWorkerRunSummary(result.rows[0]);
}

export async function getPendingAlertEventCount(): Promise<number> {
	const pool = getRequiredPool();
	const result = await pool.query(
		`SELECT COUNT(*)::int AS pending_count
		FROM position_change_events
		WHERE processed_at IS NULL`
	);
	return Number(result.rows[0]?.pending_count ?? 0);
}

export async function listVerifiedOpenHoldingTickers(): Promise<PricingCandidateRow[]> {
	const pool = getRequiredPool();
	const result = await pool.query(
		`SELECT DISTINCT a.id AS asset_id, a.ticker_symbol
		FROM assets a
		JOIN holding_snapshots h ON h.asset_id = a.id
		WHERE a.ticker_symbol IS NOT NULL
			AND a.ticker_symbol <> ''
			AND h.verification_status = 'verified'
			AND h.status = 'open'`
	);

	return result.rows.map((row) => ({
		assetId: row.asset_id,
		tickerSymbol: String(row.ticker_symbol)
	}));
}

export async function updateHoldingSnapshotMarketPrice(assetId: string, marketPrice: number): Promise<void> {
	const pool = getRequiredPool();
	await pool.query(
		`UPDATE holding_snapshots
		SET
			last_market_price = $1,
			unrealized_profit_loss = CASE
				WHEN shares_held > 0 THEN shares_held * ($1 - average_cost_basis_per_share)
				ELSE 0
			END,
			verified_updated_at = now()
		WHERE asset_id = $2
			AND verification_status = 'verified'`,
		[marketPrice, assetId]
	);
}

export async function listVerifiedTransactionsForDerivedState(): Promise<NormalizedTransaction[]> {
	const pool = getRequiredPool();
	const result = await pool.query(
		`SELECT
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
		FROM normalized_transactions
		WHERE verification_status = 'verified'
		ORDER BY member_id ASC, asset_id ASC, trade_date ASC, id ASC`
	);

	return result.rows.map((row) => ({
		id: row.id,
		sourceTransactionKey: row.source_transaction_key,
		memberId: row.member_id,
		assetId: row.asset_id,
		action: row.action,
		tradeDate: row.trade_date,
		filingDate: row.filing_date,
		shareQuantity: row.share_quantity === null ? null : Number(row.share_quantity),
		pricePerShare: row.price_per_share === null ? null : Number(row.price_per_share),
		totalAmountMin: row.total_amount_min === null ? null : Number(row.total_amount_min),
		totalAmountMax: row.total_amount_max === null ? null : Number(row.total_amount_max),
		filingDocumentId: row.filing_document_id,
		verificationStatus: row.verification_status,
		isNewPosition: Boolean(row.is_new_position),
		parserConfidence: Number(row.parser_confidence ?? 0.5),
		extractionMode: row.extraction_mode
	}));
}

async function listExistingHoldingSnapshotPrices(client: Pool | PoolClient): Promise<ExistingHoldingSnapshotPriceRow[]> {
	const result = await client.query(
		`SELECT member_id, asset_id, last_market_price
		FROM holding_snapshots
		WHERE verification_status = 'verified'`
	);

	return result.rows.map((row) => ({
		memberId: row.member_id,
		assetId: row.asset_id,
		lastMarketPrice: row.last_market_price === null ? null : Number(row.last_market_price)
	}));
}

function buildHoldingPairKey(memberId: string, assetId: string): string {
	return `${memberId}:${assetId}`;
}

function computeUnrealizedProfitLoss(
	holdingSnapshot: DerivedHoldingSnapshotInput,
	lastMarketPrice: number | null
): number | null {
	if (lastMarketPrice === null || holdingSnapshot.sharesHeld <= 0) {
		return null;
	}

	return holdingSnapshot.sharesHeld * (lastMarketPrice - holdingSnapshot.averageCostBasisPerShare);
}

async function deleteStaleHoldingSnapshots(
	client: PoolClient,
	holdingSnapshots: DerivedHoldingSnapshotInput[]
): Promise<void> {
	if (holdingSnapshots.length === 0) {
		await client.query("DELETE FROM holding_snapshots WHERE verification_status = 'verified'");
		return;
	}

	const memberIds = holdingSnapshots.map((row) => row.memberId);
	const assetIds = holdingSnapshots.map((row) => row.assetId);
	await client.query(
		`DELETE FROM holding_snapshots
		WHERE verification_status = 'verified'
			AND NOT EXISTS (
				SELECT 1
				FROM UNNEST($1::text[], $2::text[]) AS keep_rows(member_id, asset_id)
				WHERE keep_rows.member_id = holding_snapshots.member_id
					AND keep_rows.asset_id = holding_snapshots.asset_id
			)`,
		[memberIds, assetIds]
	);
}

async function deleteStaleTransactionScopedRows(
	client: PoolClient,
	tableName: "realized_profit_events" | "position_state_events" | "position_change_events",
	sourceTransactionIds: string[]
): Promise<void> {
	if (sourceTransactionIds.length === 0) {
		await client.query(`DELETE FROM ${tableName}`);
		return;
	}

	await client.query(
		`DELETE FROM ${tableName}
		WHERE source_transaction_id <> ALL($1::text[])`,
		[sourceTransactionIds]
	);
}

async function upsertHoldingSnapshots(
	client: PoolClient,
	holdingSnapshots: DerivedHoldingSnapshotInput[]
): Promise<void> {
	const existingPriceRows = await listExistingHoldingSnapshotPrices(client);
	const priceByHoldingPair = new Map<string, number | null>();
	for (const row of existingPriceRows) {
		priceByHoldingPair.set(buildHoldingPairKey(row.memberId, row.assetId), row.lastMarketPrice);
	}

	for (const holdingSnapshot of holdingSnapshots) {
		const lastMarketPrice = priceByHoldingPair.get(buildHoldingPairKey(holdingSnapshot.memberId, holdingSnapshot.assetId)) ?? null;
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
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
			ON CONFLICT (member_id, asset_id)
			DO UPDATE SET
				shares_held = EXCLUDED.shares_held,
				average_cost_basis_per_share = EXCLUDED.average_cost_basis_per_share,
				last_market_price = EXCLUDED.last_market_price,
				unrealized_profit_loss = EXCLUDED.unrealized_profit_loss,
				status = EXCLUDED.status,
				verification_status = EXCLUDED.verification_status,
				verified_updated_at = EXCLUDED.verified_updated_at`,
			[
				randomUUID(),
				holdingSnapshot.memberId,
				holdingSnapshot.assetId,
				holdingSnapshot.sharesHeld,
				holdingSnapshot.averageCostBasisPerShare,
				lastMarketPrice,
				computeUnrealizedProfitLoss(holdingSnapshot, lastMarketPrice),
				holdingSnapshot.status,
				holdingSnapshot.verificationStatus
			]
		);
	}
}

async function upsertRealizedProfitEvents(
	client: PoolClient,
	events: DerivedRealizedProfitEventInput[]
): Promise<void> {
	for (const event of events) {
		await client.query(
			`INSERT INTO realized_profit_events (
				id,
				member_id,
				asset_id,
				source_transaction_id,
				realized_profit_loss
			)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (source_transaction_id)
			DO UPDATE SET
				member_id = EXCLUDED.member_id,
				asset_id = EXCLUDED.asset_id,
				realized_profit_loss = EXCLUDED.realized_profit_loss`,
			[
				randomUUID(),
				event.memberId,
				event.assetId,
				event.sourceTransactionId,
				event.realizedProfitLoss
			]
		);
	}
}

async function upsertPositionStateEvents(
	client: PoolClient,
	events: DerivedPositionStateEventInput[]
): Promise<void> {
	for (const event of events) {
		await client.query(
			`INSERT INTO position_state_events (
				id,
				source_transaction_id,
				position_status
			)
			VALUES ($1, $2, $3)
			ON CONFLICT (source_transaction_id)
			DO UPDATE SET
				position_status = EXCLUDED.position_status`,
			[
				randomUUID(),
				event.sourceTransactionId,
				event.positionStatus
			]
		);
	}
}

async function upsertPositionChangeEvents(
	client: PoolClient,
	events: DerivedPositionChangeEventInput[]
): Promise<void> {
	for (const event of events) {
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
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (source_transaction_id)
			DO UPDATE SET
				member_id = EXCLUDED.member_id,
				asset_id = EXCLUDED.asset_id,
				action = EXCLUDED.action,
				share_delta = EXCLUDED.share_delta,
				realized_profit_loss = EXCLUDED.realized_profit_loss`,
			[
				randomUUID(),
				event.memberId,
				event.assetId,
				event.action,
				event.shareDelta,
				event.realizedProfitLoss,
				event.sourceTransactionId
			]
		);
	}
}

export async function replaceDerivedPortfolioState(derivedState: DerivedPortfolioState): Promise<void> {
	const pool = getRequiredPool();
	const client = await pool.connect();

	try {
		await client.query("BEGIN");
		await deleteStaleHoldingSnapshots(client, derivedState.holdingSnapshots);
		await deleteStaleTransactionScopedRows(
			client,
			"realized_profit_events",
			derivedState.realizedProfitEvents.map((event) => event.sourceTransactionId)
		);
		await deleteStaleTransactionScopedRows(
			client,
			"position_state_events",
			derivedState.positionStateEvents.map((event) => event.sourceTransactionId)
		);
		await deleteStaleTransactionScopedRows(
			client,
			"position_change_events",
			derivedState.positionChangeEvents.map((event) => event.sourceTransactionId)
		);
		await upsertHoldingSnapshots(client, derivedState.holdingSnapshots);
		await upsertRealizedProfitEvents(client, derivedState.realizedProfitEvents);
		await upsertPositionStateEvents(client, derivedState.positionStateEvents);
		await upsertPositionChangeEvents(client, derivedState.positionChangeEvents);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
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
			const parserConfidenceValue = Number.isFinite(transaction.parserConfidence)
				? Math.min(1, Math.max(0, Number(transaction.parserConfidence)))
				: 0.5;
			const extractionModeValue = transaction.extractionMode === "html"
				|| transaction.extractionMode === "pdf-text"
				|| transaction.extractionMode === "metadata"
				? transaction.extractionMode
				: "metadata";
			const sourceTransactionKeyValue = transaction.sourceTransactionKey
				? transaction.sourceTransactionKey
				: randomUUID();

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
					sourceTransactionKeyValue,
					transaction.memberId,
					transaction.assetId,
					transaction.action,
					transaction.tradeDate,
					transaction.filingDate,
					transaction.shareQuantity,
					transaction.pricePerShare,
					transaction.totalAmountMin,
					transaction.totalAmountMax,
					input.record.sourceDocumentId,
					transaction.isNewPosition,
					parserConfidenceValue,
					extractionModeValue
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
