import type { TransactionAction } from "../../domain/types";

interface AmountRangeOptions {
	allowSingleValue?: boolean;
}

export interface ParsedAmountRange {
	min: number | null;
	max: number | null;
	isSingleValue: boolean;
}

function parseNumericAmount(rawValue: string): number | null {
	const normalized = rawValue.replaceAll(",", "").trim();
	if (!/^\d+$/.test(normalized)) {
		return null;
	}

	return Number(normalized);
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeWhitespace(input: string): string {
	return input.replaceAll(/\s+/g, " ").trim();
}

export function stripHtmlTags(input: string): string {
	return normalizeWhitespace(
		input
			.replaceAll(/<[^>]+>/g, " ")
			.replaceAll(/&nbsp;/gi, " ")
			.replaceAll(/&amp;/gi, "&")
	);
}

export function normalizeAction(rawValue: string): TransactionAction | null {
	const normalized = normalizeWhitespace(rawValue).toLowerCase();
	if (normalized.includes("purchase") || normalized === "buy") {
		return "buy";
	}
	if (normalized.includes("sale") || normalized === "sell") {
		return "sell";
	}
	return null;
}

export function normalizeTradeDate(rawValue: string): string | null {
	const normalized = normalizeWhitespace(rawValue);
	if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
		const [year, month, day] = normalized.split("-").map(Number);
		return isValidCalendarDate(year, month, day) ? normalized : null;
	}

	const match = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
	if (!match) {
		return null;
	}

	const [, monthRaw, dayRaw, yearRaw] = match;
	const month = Number(monthRaw);
	const day = Number(dayRaw);
	const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
	if (!isValidCalendarDate(year, month, day)) {
		return null;
	}

	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseAmountRange(rawValue: string, options: AmountRangeOptions = {}): ParsedAmountRange {
	const normalized = normalizeWhitespace(rawValue);
	const rangeMatch = normalized.match(/\$\s*([\d,]+)\s*-\s*\$?\s*([\d,]+)/);
	if (rangeMatch) {
		const min = parseNumericAmount(rangeMatch[1]);
		const max = parseNumericAmount(rangeMatch[2]);
		if (min === null || max === null) {
			return { min: null, max: null, isSingleValue: false };
		}

		return { min, max, isSingleValue: false };
	}

	if (!options.allowSingleValue) {
		return { min: null, max: null, isSingleValue: false };
	}

	const singleMatch = normalized.match(/^\$?\s*([\d,]+)$/);
	if (!singleMatch) {
		return { min: null, max: null, isSingleValue: false };
	}

	const value = parseNumericAmount(singleMatch[1]);
	if (value === null) {
		return { min: null, max: null, isSingleValue: false };
	}

	return { min: value, max: value, isSingleValue: true };
}

export function extractTickerSymbol(rawValue: string): string | null {
	const match = rawValue.match(/\(([A-Z][A-Z.\-]{0,7})\)\s*$/);
	return match?.[1] ?? null;
}

export function cleanAssetDisplayName(rawValue: string): string {
	return normalizeWhitespace(rawValue.replaceAll(/\(([A-Z][A-Z.\-]{0,7})\)\s*$/g, ""));
}

export function hasRequiredTransactionProvenance(fieldNames: string[]): boolean {
	const requiredFields = ["asset_name", "action", "trade_date", "amount_range"];
	return requiredFields.every((fieldName) => fieldNames.includes(fieldName));
}
