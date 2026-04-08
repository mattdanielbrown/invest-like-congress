import type { ParsedTransactionCandidate, ProvenanceFieldSummary } from "../../domain/types";
import {
	cleanAssetDisplayName,
	extractTickerSymbol,
	normalizeAction,
	normalizeTradeDate,
	parseAmountRange,
	stripHtmlTags
} from "./parser-normalization.ts";

function provenance(fieldName: string, fieldValue: string | null, sourceText: string, sourceLocation: string): ProvenanceFieldSummary {
	return {
		fieldName,
		fieldValue,
		sourceText,
		sourceLocation,
		confidence: 0.74
	};
}

export function parseSenatePtrHtml(html: string): ParsedTransactionCandidate[] {
	const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
	const candidates: ParsedTransactionCandidate[] = [];

	for (const [rowIndex, rowMatch] of rowMatches.entries()) {
		const rowHtml = rowMatch[1];
		const cellMatches = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripHtmlTags(match[1]));
		if (cellMatches.length < 5) {
			continue;
		}

		const joined = cellMatches.join(" | ");
		const action = normalizeAction(cellMatches[1] ?? joined);
		if (!action) {
			continue;
		}

		const normalizedDate = normalizeTradeDate(cellMatches[2] ?? "") ?? "";
		const { min, max } = parseAmountRange(cellMatches[4] ?? "", { allowSingleValue: false });
		const tickerSymbol = extractTickerSymbol(cellMatches[0] ?? "");
		const assetDisplayName = cleanAssetDisplayName(cellMatches[0] ?? "");
		const ownershipType = cellMatches[5] ? cellMatches[5] : null;
		const comment = cellMatches[6] ? cellMatches[6] : null;

		const provenanceFields: ProvenanceFieldSummary[] = [
			provenance("asset_name", assetDisplayName, joined, `row:${rowIndex}`),
			provenance("action", action, joined, `row:${rowIndex}`),
			provenance("trade_date", normalizedDate || null, joined, `row:${rowIndex}`),
			provenance("amount_range", min !== null && max !== null ? `${min}-${max}` : null, joined, `row:${rowIndex}`)
		];
		if (tickerSymbol) {
			provenanceFields.push(provenance("ticker", tickerSymbol, joined, `row:${rowIndex}`));
		}

		candidates.push({
			assetDisplayName,
			tickerSymbol,
			action,
			tradeDate: normalizedDate,
			shareQuantity: null,
			pricePerShare: null,
			totalAmountMin: min,
			totalAmountMax: max,
			ownershipType,
			comment,
			provenanceFields,
			parserConfidence: 0.74,
			extractionMode: "html",
			parseIssue: !assetDisplayName
				? "ambiguous-transaction-row"
				: !normalizedDate
					? "invalid-trade-date"
					: min === null || max === null
						? "invalid-amount-range"
						: null
		});
	}

	return candidates;
}
