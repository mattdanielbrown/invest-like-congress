import { createHash, randomUUID } from "node:crypto";
import type { NormalizedTransaction, ParsedTransactionCandidate, SourceAttribution } from "../domain/types";
import type { OfficialFilingRecord } from "./official-sources";
import { hasRequiredTransactionProvenance, normalizeTradeDate } from "./parsers/parser-normalization.ts";

export interface ParsedFilingBatch {
	documentChecksum: string;
	normalizedTransactions: NormalizedTransaction[];
	sourceAttributions: SourceAttribution[];
	quarantinedRows: Array<{ sourceDocumentId: string; reason: string }>;
}

function toSlug(input: string): string {
	return input
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-+|-+$/g, "");
}

function buildSourceTransactionKey(record: OfficialFilingRecord, candidate: ParsedTransactionCandidate, ordinal: number): string {
	const key = [
		record.sourceDocumentId,
		candidate.assetDisplayName,
		candidate.action,
		candidate.tradeDate,
		candidate.totalAmountMin ?? "",
		candidate.totalAmountMax ?? "",
		ordinal
	].join("|");
	return createHash("sha256").update(key).digest("hex");
}

function toSourceAttributions(transactionId: string, filingDocumentId: string, provenanceFields: ParsedTransactionCandidate["provenanceFields"]): SourceAttribution[] {
	return provenanceFields.map((field) => ({
		id: randomUUID(),
		entityType: "normalized-transaction",
		entityId: transactionId,
		fieldName: field.fieldName,
		fieldValue: field.fieldValue,
		filingDocumentId,
		sourceText: field.sourceText,
		sourceLocation: field.sourceLocation,
		extractorVersion: "v2",
		confidence: field.confidence
	}));
}

function getCandidateFailureReason(candidate: ParsedTransactionCandidate): string | null {
	if (candidate.parseIssue) {
		return candidate.parseIssue;
	}

	if (!candidate.assetDisplayName || !candidate.tradeDate || candidate.totalAmountMin === null || candidate.totalAmountMax === null) {
		return "missing-required-fields";
	}

	if (normalizeTradeDate(candidate.tradeDate) !== candidate.tradeDate) {
		return "invalid-trade-date";
	}

	if (candidate.totalAmountMin < 0 || candidate.totalAmountMax < 0 || candidate.totalAmountMax < candidate.totalAmountMin) {
		return "invalid-amount-range";
	}

	if (!hasRequiredTransactionProvenance(candidate.provenanceFields.map((field) => field.fieldName))) {
		return "ambiguous-transaction-row";
	}

	return null;
}

export function parseOfficialRecord(
	record: OfficialFilingRecord,
	candidates: ParsedTransactionCandidate[],
	options: { emptyDocumentReason?: string } = {}
): ParsedFilingBatch {
	const documentChecksum = createHash("sha256")
		.update(JSON.stringify({
			record,
			candidateCount: candidates.length,
			candidateTradeDates: candidates.map((candidate) => candidate.tradeDate)
		}))
		.digest("hex");

	const normalizedTransactions: NormalizedTransaction[] = [];
	const sourceAttributions: SourceAttribution[] = [];
	const quarantinedRows: Array<{ sourceDocumentId: string; reason: string }> = [];

	if (candidates.length === 0) {
		quarantinedRows.push({
			sourceDocumentId: record.sourceDocumentId,
			reason: options.emptyDocumentReason ?? "no-transactions-parsed"
		});
	}

	for (const [index, candidate] of candidates.entries()) {
		const failureReason = getCandidateFailureReason(candidate);
		if (failureReason) {
			quarantinedRows.push({
				sourceDocumentId: record.sourceDocumentId,
				reason: failureReason
			});
			continue;
		}

		const transactionId = randomUUID();
		const memberId = `member-${toSlug(record.memberDisplayName)}`;
		const assetId = `asset-${toSlug(candidate.assetDisplayName)}`;
		const sourceTransactionKey = buildSourceTransactionKey(record, candidate, index);

		normalizedTransactions.push({
			id: transactionId,
			sourceTransactionKey,
			memberId,
			assetId,
			action: candidate.action,
			tradeDate: candidate.tradeDate,
			filingDate: record.filedAt,
			shareQuantity: candidate.shareQuantity,
			pricePerShare: candidate.pricePerShare,
			totalAmountMin: candidate.totalAmountMin,
			totalAmountMax: candidate.totalAmountMax,
			filingDocumentId: record.sourceDocumentId,
			verificationStatus: "verified",
			isNewPosition: candidate.action === "buy",
			parserConfidence: candidate.parserConfidence,
			extractionMode: candidate.extractionMode
		});

		sourceAttributions.push(...toSourceAttributions(transactionId, record.sourceDocumentId, candidate.provenanceFields));
	}

	return {
		documentChecksum,
		normalizedTransactions,
		sourceAttributions,
		quarantinedRows
	};
}
