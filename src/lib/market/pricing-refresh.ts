import {
	listVerifiedOpenHoldingTickers,
	updateHoldingSnapshotMarketPrice,
	updateSystemStatus
} from "@/lib/db/repository";
import { getNextPricingRefreshUtc } from "@/lib/scheduling/intraday-schedule";

function toValidPrice(value: unknown): number | null {
	const price = Number(value);
	if (!Number.isFinite(price) || price <= 0) {
		return null;
	}
	return price;
}

function parseStooqPriceCsv(csvText: string): number | null {
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

async function fetchPriceWithBaseApi(tickerSymbol: string): Promise<number | null> {
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

async function fetchPriceFromStooq(tickerSymbol: string): Promise<number | null> {
	const normalizedTicker = tickerSymbol.toLowerCase();
	const stooqSymbol = normalizedTicker.includes(".") ? normalizedTicker : `${normalizedTicker}.us`;
	const response = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`);
	if (!response.ok) {
		return null;
	}
	const csvText = await response.text();
	return parseStooqPriceCsv(csvText);
}

async function fetchMarketPrice(tickerSymbol: string): Promise<number | null> {
	try {
		const baseApiPrice = await fetchPriceWithBaseApi(tickerSymbol);
		if (baseApiPrice) {
			return baseApiPrice;
		}
	} catch {
		// Ignore provider failures and fall back to the public source.
	}

	try {
		return await fetchPriceFromStooq(tickerSymbol);
	} catch {
		return null;
	}
}

export async function refreshPortfolioPricing() {
	const refreshedAt = new Date();
	const nextRefreshAt = getNextPricingRefreshUtc(refreshedAt);
	const pricingCandidates = await listVerifiedOpenHoldingTickers();
	const skippedTickers: string[] = [];
	let assetsUpdated = 0;

	for (const candidate of pricingCandidates) {
		const tickerSymbol = candidate.tickerSymbol.trim().toUpperCase();
		if (!tickerSymbol) {
			continue;
		}

		const marketPrice = await fetchMarketPrice(tickerSymbol);
		if (marketPrice === null) {
			skippedTickers.push(tickerSymbol);
			continue;
		}

		await updateHoldingSnapshotMarketPrice(candidate.assetId, marketPrice);
		assetsUpdated += 1;
	}

	await updateSystemStatus({
		lastPricingRefreshAt: refreshedAt.toISOString(),
		nextPricingRefreshAt: nextRefreshAt.toISOString(),
		marketSessionState: "open"
	});

	return {
		metrics: {
			assetsConsidered: pricingCandidates.length,
			assetsUpdated,
			skippedTickerCount: skippedTickers.length
		},
		warnings: skippedTickers.length > 0
			? [`Skipped market price refresh for ${skippedTickers.length} ticker(s): ${skippedTickers.join(", ")}`]
			: [],
		failureReason: null
	};
}
