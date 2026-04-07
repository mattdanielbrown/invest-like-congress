import { createHash, randomUUID } from "node:crypto";
import type { NormalizedTransaction } from "@/lib/domain/types";
import type { OfficialFilingRecord } from "@/lib/ingestion/official-sources";

export interface ParsedFilingBatch {
	documentChecksumByDocumentId: Record<string, string>;
	normalizedTransactions: NormalizedTransaction[];
	quarantinedRows: Array<{ sourceDocumentId: string; reason: string }>;
}

export function parseOfficialRecords(records: OfficialFilingRecord[]): ParsedFilingBatch {
	const normalizedTransactions: NormalizedTransaction[] = [];
	const quarantinedRows: Array<{ sourceDocumentId: string; reason: string }> = [];
	const documentChecksumByDocumentId: Record<string, string> = {};

	for (const record of records) {
		const checksum = createHash("sha256").update(JSON.stringify(record)).digest("hex");
		documentChecksumByDocumentId[record.sourceDocumentId] = checksum;

		if (!record.memberName || !record.assetDisplayName || !record.tradeDate) {
			quarantinedRows.push({
				sourceDocumentId: record.sourceDocumentId,
				reason: "required-fields-missing"
			});
			continue;
		}

		normalizedTransactions.push({
			id: randomUUID(),
			memberId: `member-${record.memberName.toLowerCase().replaceAll(" ", "-")}`,
			assetId: `asset-${record.assetDisplayName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
			action: record.action === "purchase" ? "buy" : "sell",
			tradeDate: record.tradeDate,
			filingDate: record.filedAt,
			shareQuantity: record.shareQuantity,
			pricePerShare: record.pricePerShare,
			totalAmountMin: record.totalAmountMin,
			totalAmountMax: record.totalAmountMax,
			filingDocumentId: record.sourceDocumentId,
			verificationStatus: "verified",
			isNewPosition: record.action === "purchase"
		});
	}

	return {
		documentChecksumByDocumentId,
		normalizedTransactions,
		quarantinedRows
	};
}
