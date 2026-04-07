import type { ParsedTransactionCandidate, ProvenanceFieldSummary } from "@/lib/domain/types";

function stripHtmlTags(input: string): string {
	return input
		.replaceAll(/<[^>]+>/g, " ")
		.replaceAll(/&nbsp;/gi, " ")
		.replaceAll(/&amp;/gi, "&")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function parseDate(value: string): string {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return value;
	}

	const parts = value.split(/[\/\-]/).map((item) => item.trim());
	if (parts.length !== 3) {
		return "";
	}

	const [month, day, year] = parts;
	const normalizedYear = year.length === 2 ? `20${year}` : year;
	return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseAmountRange(rawText: string): { min: number | null; max: number | null } {
	const match = rawText.match(/\$?([\d,]+)\s*-\s*\$?([\d,]+)/);
	if (match) {
		return {
			min: Number(match[1].replaceAll(",", "")),
			max: Number(match[2].replaceAll(",", ""))
		};
	}
	return { min: null, max: null };
}

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
		if (cellMatches.length < 4) {
			continue;
		}

		const joined = cellMatches.join(" | ");
		const actionMatch = joined.match(/\b(Purchase|Sale)\b/i);
		const dateMatch = joined.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
		const amountMatch = joined.match(/\$?\d[\d,]*\s*-\s*\$?\d[\d,]*/);
		if (!actionMatch || !dateMatch || !amountMatch) {
			continue;
		}

		const action = actionMatch[1].toLowerCase() === "purchase" ? "buy" : "sell";
		const assetDisplayName = cellMatches[0];
		const tickerMatch = assetDisplayName.match(/\(([A-Z]{1,5})\)/);
		const { min, max } = parseAmountRange(amountMatch[0]);
		const normalizedDate = parseDate(dateMatch[0]);
		if (!normalizedDate || min === null || max === null) {
			continue;
		}

		const provenanceFields: ProvenanceFieldSummary[] = [
			provenance("asset_name", assetDisplayName, joined, `row:${rowIndex}`),
			provenance("action", action, joined, `row:${rowIndex}`),
			provenance("trade_date", normalizedDate, joined, `row:${rowIndex}`),
			provenance("amount_range", `${min}-${max}`, joined, `row:${rowIndex}`)
		];
		if (tickerMatch) {
			provenanceFields.push(provenance("ticker", tickerMatch[1], joined, `row:${rowIndex}`));
		}

		candidates.push({
			assetDisplayName,
			tickerSymbol: tickerMatch?.[1] ?? null,
			action,
			tradeDate: normalizedDate,
			shareQuantity: null,
			pricePerShare: null,
			totalAmountMin: min,
			totalAmountMax: max,
			ownershipType: null,
			comment: null,
			provenanceFields,
			parserConfidence: 0.74,
			extractionMode: "html"
		});
	}

	return candidates;
}
