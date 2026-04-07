import type { Chamber } from "@/lib/domain/types";
import { fetchHousePeriodicTransactionReports, type HouseFilingReference } from "@/lib/ingestion/connectors/house-connector";
import { fetchSenatePeriodicTransactionReports, type SenateFilingReference } from "@/lib/ingestion/connectors/senate-connector";

export interface OfficialFilingRecord {
	sourceSystem: "house-disclosures" | "senate-disclosures";
	sourceDocumentId: string;
	documentUrl: string;
	filedAt: string;
	memberDisplayName: string;
	chamber: Chamber;
	year: number;
}

export interface OfficialSourceFetchResult {
	records: OfficialFilingRecord[];
	warnings: string[];
}

function normalizeHouseReference(reference: HouseFilingReference): OfficialFilingRecord {
	return {
		sourceSystem: reference.sourceSystem,
		sourceDocumentId: reference.sourceDocumentId,
		documentUrl: reference.documentUrl,
		filedAt: reference.filedAt,
		memberDisplayName: reference.memberDisplayName,
		chamber: "house",
		year: reference.year
	};
}

function normalizeSenateReference(reference: SenateFilingReference): OfficialFilingRecord {
	return {
		sourceSystem: reference.sourceSystem,
		sourceDocumentId: reference.sourceDocumentId,
		documentUrl: reference.documentUrl,
		filedAt: reference.filedAt,
		memberDisplayName: reference.memberDisplayName,
		chamber: "senate",
		year: reference.year
	};
}

export function sortOfficialFilingRecords(records: OfficialFilingRecord[]): OfficialFilingRecord[] {
	return [...records].sort((left, right) => {
		const dateOrder = left.filedAt.localeCompare(right.filedAt);
		if (dateOrder !== 0) {
			return dateOrder;
		}
		return left.sourceDocumentId.localeCompare(right.sourceDocumentId);
	});
}

export async function fetchOfficialPtrRecords(fromYear: number, toYear: number): Promise<OfficialSourceFetchResult> {
	const warnings: string[] = [];

	const [houseResult, senateResult] = await Promise.allSettled([
		fetchHousePeriodicTransactionReports(fromYear, toYear),
		fetchSenatePeriodicTransactionReports(fromYear, toYear)
	]);

	const records: OfficialFilingRecord[] = [];
	if (houseResult.status === "fulfilled") {
		records.push(...houseResult.value.map(normalizeHouseReference));
	} else {
		warnings.push(`house-fetch-failure:${String(houseResult.reason)}`);
	}

	if (senateResult.status === "fulfilled") {
		records.push(...senateResult.value.map(normalizeSenateReference));
	} else {
		warnings.push(`senate-fetch-failure:${String(senateResult.reason)}`);
	}

	const uniqueRecords = new Map<string, OfficialFilingRecord>();
	for (const record of records) {
		uniqueRecords.set(record.sourceDocumentId, record);
	}

	const sortedRecords = sortOfficialFilingRecords([...uniqueRecords.values()]);

	return {
		records: sortedRecords,
		warnings
	};
}
