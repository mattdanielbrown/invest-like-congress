import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;

const refreshHoursUtc = [15, 18, 21];

function getNextRefreshTimestamp(now) {
	for (const hour of refreshHoursUtc) {
		const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
		if (candidate > now) {
			return candidate;
		}
	}

	const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, refreshHoursUtc[0], 0, 0));
	return nextDay;
}

function shouldAllowDryRun() {
	return process.env.WORKER_ALLOW_DRY_RUN === "1" || process.env.WORKER_ALLOW_DRY_RUN === "true";
}

function toValidPrice(value) {
	const price = Number(value);
	if (!Number.isFinite(price) || price <= 0) {
		return null;
	}
	return price;
}

function parseStooqPriceCsv(csvText) {
	const lines = csvText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (lines.length < 2) {
		return null;
	}
	const columns = lines[1].split(",");
	if (columns.length < 7) {
		return null;
	}
	return toValidPrice(columns[6]);
}

async function fetchPriceWithBaseApi(tickerSymbol) {
	const baseUrl = process.env.MARKET_DATA_BASE_URL;
	if (!baseUrl) {
		return null;
	}

	const url = new URL(baseUrl);
	url.searchParams.set("symbol", tickerSymbol);
	if (process.env.MARKET_DATA_API_KEY) {
		url.searchParams.set("apikey", process.env.MARKET_DATA_API_KEY);
	}

	const response = await fetch(url, {
		headers: {
			Accept: "application/json"
		}
	});
	if (!response.ok) {
		return null;
	}

	const payload = await response.json();
	if (Array.isArray(payload?.data) && payload.data.length > 0) {
		return toValidPrice(payload.data[0]?.price ?? payload.data[0]?.close);
	}
	return toValidPrice(payload?.price ?? payload?.close ?? payload?.last);
}

async function fetchPriceFromStooq(tickerSymbol) {
	const normalizedTicker = tickerSymbol.toLowerCase();
	const stooqSymbol = normalizedTicker.includes(".") ? normalizedTicker : `${normalizedTicker}.us`;
	const response = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`);
	if (!response.ok) {
		return null;
	}
	const csvText = await response.text();
	return parseStooqPriceCsv(csvText);
}

async function fetchMarketPrice(tickerSymbol) {
	try {
		const baseApiPrice = await fetchPriceWithBaseApi(tickerSymbol);
		if (baseApiPrice) {
			return baseApiPrice;
		}
	} catch {
		// Ignore API provider errors and fallback to stooq source.
	}

	try {
		return await fetchPriceFromStooq(tickerSymbol);
	} catch {
		return null;
	}
}

export async function runPricingRefreshWorker() {
	const refreshedAt = new Date();
	const nextRefreshAt = getNextRefreshTimestamp(refreshedAt);
	const runId = randomUUID();

	if (!process.env.DATABASE_URL) {
		if (!shouldAllowDryRun()) {
			throw new Error("DATABASE_URL is required for pricing refresh worker. Set WORKER_ALLOW_DRY_RUN=1 to allow dry-run.");
		}
		console.info("[pricing-refresh:dry-run]", {
			run_id: runId,
			refreshedAt: refreshedAt.toISOString(),
			nextRefreshAt: nextRefreshAt.toISOString()
		});
		return;
	}

	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();

	try {
		const tickersResult = await client.query(
			`SELECT DISTINCT a.id AS asset_id, a.ticker_symbol
			FROM assets a
			JOIN holding_snapshots h ON h.asset_id = a.id
			WHERE a.ticker_symbol IS NOT NULL
				AND a.ticker_symbol <> ''
				AND h.verification_status = 'verified'
				AND h.status = 'open'`
		);

		let updatedAssetCount = 0;
		const skippedTickers = [];
		for (const row of tickersResult.rows) {
			const tickerSymbol = String(row.ticker_symbol).trim().toUpperCase();
			if (!tickerSymbol) {
				continue;
			}

			const price = await fetchMarketPrice(tickerSymbol);
			if (!price) {
				skippedTickers.push(tickerSymbol);
				continue;
			}

			await client.query(
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
				[price, row.asset_id]
			);
			updatedAssetCount += 1;
		}

		await client.query(
			`UPDATE system_status
			 SET last_pricing_refresh_at = $1,
				 next_pricing_refresh_at = $2,
				 market_session_state = 'open'
			 WHERE id = 1`,
			[refreshedAt.toISOString(), nextRefreshAt.toISOString()]
		);

		console.info("[pricing-refresh] Completed", {
			run_id: runId,
			refreshedAt: refreshedAt.toISOString(),
			nextRefreshAt: nextRefreshAt.toISOString(),
			assetsConsidered: tickersResult.rowCount ?? 0,
			assetsUpdated: updatedAssetCount,
			skippedTickers
		});
	} finally {
		await client.end();
	}
}
