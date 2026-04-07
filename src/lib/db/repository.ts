import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getDatabasePool } from "@/lib/db/pool";
import type { MemberQueryFilters } from "@/lib/db/schema-types";
import type {
	AlertSubscription,
	AssetActivityRow,
	MemberHoldingsRow,
	PositionChangeEvent,
	SubscriptionPreference,
	TransactionWithPresentation
} from "@/lib/domain/types";
import {
	sampleAlertSubscriptions,
	sampleAssetActivityRows,
	sampleMemberRows,
	samplePositionChangeEvents,
	sampleStatus,
	sampleTransactions
} from "@/lib/source-data/sample-seed";

interface StatusRow {
	lastIngestionAt: string | null;
	lastPricingRefreshAt: string | null;
	nextPricingRefreshAt: string | null;
	marketSessionState: string;
}

const fallbackSubscriptions = [...sampleAlertSubscriptions];
const fallbackEvents = [...samplePositionChangeEvents];

function useDatabase(): Pool | null {
	try {
		return getDatabasePool();
	} catch {
		return null;
	}
}

export async function listMembersWithHoldings(_filters: MemberQueryFilters): Promise<MemberHoldingsRow[]> {
	const pool = useDatabase();
	if (!pool) {
		return sampleMemberRows;
	}

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
	const pool = useDatabase();
	if (!pool) {
		return sampleTransactions
			.filter((transaction) => transaction.memberId === memberId)
			.map((transaction) => ({
				transaction,
				asset: sampleAssetActivityRows.find((row) => row.asset.id === transaction.assetId)?.asset ?? {
					id: transaction.assetId,
					displayName: transaction.assetId,
					tickerSymbol: null,
					assetType: "unknown",
					isSymbolResolved: false
				},
				realizedProfitLoss: transaction.action === "sell" ? 60 : null,
				positionStatusAfterTransaction: "open"
			}));
	}

	const query = `
		SELECT
			t.id,
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
			a.display_name,
			a.ticker_symbol,
			a.asset_type,
			a.is_symbol_resolved,
			rpe.realized_profit_loss,
			COALESCE(ps.position_status, 'open') AS position_status_after_transaction
		FROM normalized_transactions t
		JOIN assets a ON a.id = t.asset_id
		LEFT JOIN realized_profit_events rpe ON rpe.source_transaction_id = t.id
		LEFT JOIN position_state_events ps ON ps.source_transaction_id = t.id
		WHERE t.member_id = $1 AND t.verification_status = 'verified'
		ORDER BY t.trade_date DESC
	`;

	const result = await pool.query(query, [memberId]);
	return result.rows.map((row) => ({
		transaction: {
			id: row.id,
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
			isNewPosition: row.is_new_position
		},
		asset: {
			id: row.asset_id,
			displayName: row.display_name,
			tickerSymbol: row.ticker_symbol,
			assetType: row.asset_type,
			isSymbolResolved: row.is_symbol_resolved
		},
		realizedProfitLoss: row.realized_profit_loss,
		positionStatusAfterTransaction: row.position_status_after_transaction
	}));
}

export async function getAssetActivity(assetId: string): Promise<AssetActivityRow | null> {
	const pool = useDatabase();
	if (!pool) {
		return sampleAssetActivityRows.find((row) => row.asset.id === assetId) ?? null;
	}

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
	if (result.rowCount === 0) {
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
	const pool = useDatabase();
	if (!pool) {
		return sampleStatus;
	}

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
	if (result.rowCount === 0) {
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
	const pool = useDatabase();
	const verificationToken = randomUUID();

	if (!pool) {
		const existing = fallbackSubscriptions.find((subscription) => subscription.emailAddress.toLowerCase() === emailAddress.toLowerCase());
		if (existing) {
			existing.preference = preference;
			existing.unsubscribedAt = null;
			return existing;
		}

		const subscription: AlertSubscription = {
			id: `subscription-${randomUUID()}`,
			emailAddress,
			isVerified: false,
			verificationToken,
			unsubscribedAt: null,
			preference,
			createdAt: new Date().toISOString()
		};
		fallbackSubscriptions.push(subscription);
		return subscription;
	}

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
	const pool = useDatabase();
	if (!pool) {
		const subscription = fallbackSubscriptions.find((item) => item.emailAddress.toLowerCase() === emailAddress.toLowerCase());
		if (!subscription) {
			return false;
		}
		subscription.unsubscribedAt = new Date().toISOString();
		return true;
	}

	const query = `
		UPDATE alert_subscriptions
		SET unsubscribed_at = now()
		WHERE email_address = $1 AND unsubscribed_at IS NULL
	`;
	const result = await pool.query(query, [emailAddress]);
	return result.rowCount > 0;
}

export async function enqueuePositionChangeEvent(event: Omit<PositionChangeEvent, "id" | "createdAt">): Promise<PositionChangeEvent> {
	const pool = useDatabase();
	const row: PositionChangeEvent = {
		...event,
		id: randomUUID(),
		createdAt: new Date().toISOString()
	};

	if (!pool) {
		fallbackEvents.push(row);
		return row;
	}

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
	const pool = useDatabase();
	if (!pool) {
		return fallbackEvents.slice(0, limit);
	}

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
	const pool = useDatabase();
	if (!pool) {
		return fallbackSubscriptions.filter((subscription) => subscription.isVerified && subscription.unsubscribedAt === null);
	}

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
	const pool = useDatabase();
	if (!pool) {
		const index = fallbackEvents.findIndex((event) => event.id === eventId);
		if (index >= 0) {
			fallbackEvents.splice(index, 1);
		}
		return;
	}

	await pool.query("UPDATE position_change_events SET processed_at = now() WHERE id = $1", [eventId]);
}

export async function listQuarantinedTransactions(limit = 100): Promise<{ id: string; reason: string; createdAt: string }[]> {
	const pool = useDatabase();
	if (!pool) {
		return [];
	}

	const query = `
		SELECT id, quarantine_reason, created_at
		FROM normalized_transactions
		WHERE verification_status = 'quarantined'
		ORDER BY created_at DESC
		LIMIT $1
	`;
	const result = await pool.query(query, [limit]);
	return result.rows.map((row) => ({
		id: row.id,
		reason: row.quarantine_reason,
		createdAt: new Date(row.created_at).toISOString()
	}));
}

export async function verifyAlertSubscriptionByToken(token: string): Promise<boolean> {
	const pool = useDatabase();
	if (!pool) {
		const subscription = fallbackSubscriptions.find((entry) => entry.verificationToken === token);
		if (!subscription) {
			return false;
		}
		subscription.isVerified = true;
		return true;
	}

	const query = `
		UPDATE alert_subscriptions
		SET is_verified = true
		WHERE verification_token = $1
	`;
	const result = await pool.query(query, [token]);
	return result.rowCount > 0;
}

export async function updateSystemStatus(status: Partial<StatusRow>): Promise<void> {
	const pool = useDatabase();
	if (!pool) {
		Object.assign(sampleStatus, status);
		return;
	}

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
