import type { ParsedTransactionCandidate, ProvenanceFieldSummary } from "../../domain/types";
import {
	cleanAssetDisplayName,
	extractTickerSymbol,
	normalizeAction,
	normalizeTradeDate,
	normalizeWhitespace,
	parseAmountRange
} from "./parser-normalization.ts";

function buildProvenanceField(fieldName: string, fieldValue: string | null, sourceText: string, sourceLocation: string): ProvenanceFieldSummary {
	return {
		fieldName,
		fieldValue,
		sourceText,
		sourceLocation,
		confidence: 0.72
	};
}

function isBoilerplateLine(line: string): boolean {
	return /^(periodic transaction report|asset|description|issuer|ticker|owner|page \d+ of \d+|notes?:|filing status|transaction type)$/i.test(line);
}

function isLikelyAssetLine(line: string): boolean {
	if (!line || isBoilerplateLine(line)) {
		return false;
	}

	if (normalizeAction(line)) {
		return false;
	}

	if (normalizeTradeDate(line)) {
		return false;
	}

	const amount = parseAmountRange(line, { allowSingleValue: true });
	if (amount.min !== null && amount.max !== null) {
		return false;
	}

	return !/^owner:/i.test(line) && !/^pending review$/i.test(line);
}

function findNearestAssetLine(lines: string[], actionIndex: number): { text: string; index: number } | null {
	for (let index = actionIndex - 1; index >= Math.max(0, actionIndex - 4); index -= 1) {
		if (isLikelyAssetLine(lines[index])) {
			return {
				text: lines[index],
				index
			};
		}
	}

	return null;
}

function parseCandidatesFromLines(lines: string[]): ParsedTransactionCandidate[] {
	const candidates: ParsedTransactionCandidate[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const action = normalizeAction(line);
		if (!action) {
			continue;
		}

		const assetLine = findNearestAssetLine(lines, index);
		const detailLines = lines.slice(index, index + 4);
		const detailText = detailLines.join(" ");
		const dateMatch = detailText.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
		const normalizedDate = dateMatch ? normalizeTradeDate(dateMatch[0]) ?? "" : "";
		const { min, max } = parseAmountRange(
			detailLines.find((detailLine) => parseAmountRange(detailLine, { allowSingleValue: true }).min !== null) ?? "",
			{ allowSingleValue: true }
		);
		const assetSourceText = assetLine?.text ?? "";
		const assetDisplayName = cleanAssetDisplayName(assetSourceText);
		const tickerSymbol = assetSourceText ? extractTickerSymbol(assetSourceText) : null;
		const provenanceFields: ProvenanceFieldSummary[] = [
			buildProvenanceField("asset_name", assetDisplayName || null, assetSourceText, `line:${assetLine?.index ?? index}`),
			buildProvenanceField("action", action, line, `line:${index + 1}`),
			buildProvenanceField("trade_date", normalizedDate || null, detailText, `line:${index + 1}`),
			buildProvenanceField("amount_range", min !== null && max !== null ? (min === max ? `$${min}` : `$${min}-$${max}`) : null, detailText, `line:${index + 1}`)
		];

		if (tickerSymbol) {
			provenanceFields.push(buildProvenanceField("ticker", tickerSymbol, assetSourceText, `line:${assetLine?.index ?? index}`));
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
			ownershipType: null,
			comment: null,
			provenanceFields,
			parserConfidence: 0.72,
			extractionMode: "pdf-text",
			parseIssue: assetDisplayName
				? (!normalizedDate ? "invalid-trade-date" : min === null || max === null ? "invalid-amount-range" : null)
				: "ambiguous-transaction-row"
		});
	}

	return candidates;
}

export function parseHousePtrText(rawText: string): ParsedTransactionCandidate[] {
	const lines = rawText
		.split(/\r?\n/)
		.map((line) => normalizeWhitespace(line))
		.filter((line) => line.length > 0 && !isBoilerplateLine(line));

	return parseCandidatesFromLines(lines);
}
