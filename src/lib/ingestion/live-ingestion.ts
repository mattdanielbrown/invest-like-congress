import { createHash } from "node:crypto";
import { fetchWithRetry, rateLimitPause } from "@/lib/ingestion/http-client";
import { cacheRawDocument } from "@/lib/ingestion/raw-cache";
import { parseHousePtrText } from "@/lib/ingestion/parsers/house-ptr-parser";
import { parseSenatePtrHtml } from "@/lib/ingestion/parsers/senate-ptr-parser";
import { extractTextFromPdfBytes } from "@/lib/ingestion/parsers/pdf-text";
import { fetchOfficialPtrRecords } from "@/lib/ingestion/official-sources";
import { parseOfficialRecord } from "@/lib/ingestion/parser";
import {
	getIngestionCheckpoint,
	persistParsedFiling,
	persistQuarantineRows,
	persistRawDocumentCache,
	upsertIngestionCheckpoint,
	updateSystemStatus
} from "@/lib/db/repository";
import { emitMetric } from "@/lib/metrics/metrics";
import { loadServerEnv } from "@/lib/env/server-env";
import type { ParsedTransactionCandidate } from "@/lib/domain/types";

export interface RunIngestionOptions {
	fromYear: number;
	toYear: number;
	mode: "backfill" | "hourly";
}

interface IngestionRunSummary {
	fetchedDocuments: number;
	parsedDocuments: number;
	quarantinedDocuments: number;
	extractedTransactions: number;
	provenanceCoverageRatio: number;
	warnings: string[];
}

function detectContentType(response: Response, bytes: Uint8Array): "html" | "pdf" | "other" {
	const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
	if (contentType.includes("html") || contentType.includes("text/html")) {
		return "html";
	}
	if (contentType.includes("pdf") || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "%PDF") {
		return "pdf";
	}
	return "other";
}

function parseCandidates(contentType: "html" | "pdf" | "other", rawBytes: Uint8Array): ParsedTransactionCandidate[] {
	if (contentType === "html") {
		return parseSenatePtrHtml(Buffer.from(rawBytes).toString("utf8"));
	}
	if (contentType === "pdf") {
		const extractedText = extractTextFromPdfBytes(rawBytes);
		return parseHousePtrText(extractedText);
	}
	return [];
}

function getCursorKey(options: RunIngestionOptions): string {
	return `${options.mode}:${options.fromYear}-${options.toYear}`;
}

function maybeSkipByCheckpoint(recordFiledAt: string, checkpointDate: string | null): boolean {
	if (!checkpointDate) {
		return false;
	}

	const recordDate = new Date(recordFiledAt);
	const knownDate = new Date(checkpointDate);
	return recordDate.getTime() < knownDate.getTime();
}

export async function runLiveIngestion(options: RunIngestionOptions): Promise<IngestionRunSummary> {
	const env = loadServerEnv();
	const checkpointKey = getCursorKey(options);
	const checkpoint = await getIngestionCheckpoint("official-ptr", checkpointKey);
	const sourceResult = await fetchOfficialPtrRecords(options.fromYear, options.toYear);

	let fetchedDocuments = 0;
	let parsedDocuments = 0;
	let quarantinedDocuments = 0;
	let extractedTransactions = 0;
	let provenanceFieldCount = 0;
	const warnings = [...sourceResult.warnings];
	let lastSeenFiledAt: string | null = checkpoint?.lastSeenFiledAt ?? null;

	for (const record of sourceResult.records) {
		if (options.mode === "hourly" && maybeSkipByCheckpoint(record.filedAt, checkpoint?.lastSeenFiledAt ?? null)) {
			continue;
		}

		const response = await fetchWithRetry(record.documentUrl, { maxRetries: 2 });
		const rawBytes = new Uint8Array(await response.arrayBuffer());
		const contentTypeHeader = response.headers.get("content-type");
		const detectedType = detectContentType(response, rawBytes);
		const rawContentHash = createHash("sha256").update(rawBytes).digest("hex");
		fetchedDocuments += 1;

		const cachedDocument = await cacheRawDocument(record.sourceSystem, record.sourceDocumentId, rawBytes, contentTypeHeader);
		await persistRawDocumentCache({
			id: cachedDocument.id,
			sourceSystem: record.sourceSystem,
			sourceDocumentId: record.sourceDocumentId,
			cachePath: cachedDocument.cachePath,
			contentHash: cachedDocument.contentHash,
			fetchedAt: cachedDocument.fetchedAt,
			contentType: cachedDocument.contentType,
			contentLength: cachedDocument.contentLength
		});

		const candidates = parseCandidates(detectedType, rawBytes);
		const parsedRecord = parseOfficialRecord(record, candidates);

		if (parsedRecord.quarantinedRows.length > 0) {
			quarantinedDocuments += 1;
			await persistQuarantineRows(parsedRecord.quarantinedRows);
		}

		if (parsedRecord.normalizedTransactions.length > 0) {
			parsedDocuments += 1;
			extractedTransactions += parsedRecord.normalizedTransactions.length;
			provenanceFieldCount += parsedRecord.sourceAttributions.length;
			await persistParsedFiling({
				record,
				parsedRecord,
				rawCachePath: cachedDocument.cachePath,
				rawFetchedAt: cachedDocument.fetchedAt,
				rawContentHash,
				complianceMode: env.senateComplianceMode
			});
		}

		if (!lastSeenFiledAt || new Date(record.filedAt).getTime() > new Date(lastSeenFiledAt).getTime()) {
			lastSeenFiledAt = record.filedAt;
		}

		await rateLimitPause();
	}

	await upsertIngestionCheckpoint("official-ptr", checkpointKey, lastSeenFiledAt);
	await updateSystemStatus({ lastIngestionAt: new Date().toISOString() });

	const provenanceCoverageRatio = extractedTransactions > 0
		? Number((provenanceFieldCount / extractedTransactions).toFixed(4))
		: 0;

	emitMetric({ name: "ingestion.fetched_documents", value: fetchedDocuments, timestamp: new Date().toISOString() });
	emitMetric({ name: "ingestion.parsed_documents", value: parsedDocuments, timestamp: new Date().toISOString() });
	emitMetric({ name: "ingestion.quarantined_documents", value: quarantinedDocuments, timestamp: new Date().toISOString() });
	emitMetric({ name: "ingestion.extracted_transactions", value: extractedTransactions, timestamp: new Date().toISOString() });
	emitMetric({ name: "ingestion.provenance_coverage_ratio", value: provenanceCoverageRatio, timestamp: new Date().toISOString() });

	return {
		fetchedDocuments,
		parsedDocuments,
		quarantinedDocuments,
		extractedTransactions,
		provenanceCoverageRatio,
		warnings
	};
}
