import type { ParsedTransactionCandidate, ProvenanceFieldSummary } from "@/lib/domain/types";

function parseAmountRange(rawText: string): { min: number | null; max: number | null } {
	const rangeMatch = rawText.match(/\$?([\d,]+)\s*-\s*\$?([\d,]+)/);
	if (rangeMatch) {
		return {
			min: Number(rangeMatch[1].replaceAll(",", "")),
			max: Number(rangeMatch[2].replaceAll(",", ""))
		};
	}

	const singleMatch = rawText.match(/\$\s?([\d,]+)/);
	if (singleMatch) {
		const amount = Number(singleMatch[1].replaceAll(",", ""));
		return { min: amount, max: amount };
	}

	return { min: null, max: null };
}

function buildProvenanceField(fieldName: string, fieldValue: string | null, sourceText: string, sourceLocation: string): ProvenanceFieldSummary {
	return {
		fieldName,
		fieldValue,
		sourceText,
		sourceLocation,
		confidence: 0.72
	};
}

function parseCandidatesFromLines(lines: string[]): ParsedTransactionCandidate[] {
	const candidates: ParsedTransactionCandidate[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const actionMatch = line.match(/\b(Purchase|Sale)\b/i);
		if (!actionMatch) {
			continue;
		}

		const action = actionMatch[1].toLowerCase() === "purchase" ? "buy" : "sell";
		const amountText = [line, lines[index + 1] ?? ""].join(" ");
		const { min, max } = parseAmountRange(amountText);
		const dateMatch = amountText.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
		const assetLine = lines[index - 1] ?? line;
		const tickerMatch = assetLine.match(/\(([A-Z]{1,5})\)/);
		const tradeDateRaw = dateMatch ? dateMatch[1] : "";
		const tradeDateParts = tradeDateRaw.split(/[\/\-]/);
		const normalizedDate = tradeDateParts.length === 3
			? `${tradeDateParts[2].length === 2 ? `20${tradeDateParts[2]}` : tradeDateParts[2]}-${tradeDateParts[0].padStart(2, "0")}-${tradeDateParts[1].padStart(2, "0")}`
			: "";

		if (!normalizedDate || min === null) {
			continue;
		}

		const assetDisplayName = assetLine.replaceAll(/\([^)]*\)/g, "").trim();
		const provenanceFields: ProvenanceFieldSummary[] = [
			buildProvenanceField("asset_name", assetDisplayName, assetLine, `line:${index}`),
			buildProvenanceField("action", action, line, `line:${index + 1}`),
			buildProvenanceField("trade_date", normalizedDate, amountText, `line:${index + 1}`),
			buildProvenanceField("amount_range", min === max ? `$${min}` : `$${min}-$${max}`, amountText, `line:${index + 1}`)
		];

		if (tickerMatch) {
			provenanceFields.push(buildProvenanceField("ticker", tickerMatch[1], assetLine, `line:${index}`));
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
			parserConfidence: 0.72,
			extractionMode: "pdf-text"
		});
	}

	return candidates;
}

export function parseHousePtrText(rawText: string): ParsedTransactionCandidate[] {
	const lines = rawText
		.split(/\r?\n/)
		.map((line) => line.replaceAll(/\s+/g, " ").trim())
		.filter((line) => line.length > 0);

	return parseCandidatesFromLines(lines);
}
