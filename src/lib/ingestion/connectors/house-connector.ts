import { fetchWithRetry, rateLimitPause } from "@/lib/ingestion/http-client";

export interface HouseIndexRow {
	prefix: string;
	lastName: string;
	firstName: string;
	suffix: string;
	filingType: string;
	stateDistrict: string;
	year: number;
	filingDate: string;
	documentId: string;
}

export interface HouseFilingReference {
	sourceSystem: "house-disclosures";
	sourceDocumentId: string;
	documentUrl: string;
	filedAt: string;
	memberDisplayName: string;
	stateDistrict: string;
	year: number;
	chamber: "house";
}

export function parseHouseIndexText(indexText: string): HouseIndexRow[] {
	const lines = indexText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (lines.length <= 1) {
		return [];
	}

	const rows: HouseIndexRow[] = [];
	for (const line of lines.slice(1)) {
		const columns = line.split("\t");
		if (columns.length < 9) {
			continue;
		}

		const filingType = columns[4]?.trim() ?? "";
		if (filingType !== "P") {
			continue;
		}

		rows.push({
			prefix: columns[0]?.trim() ?? "",
			lastName: columns[1]?.trim() ?? "",
			firstName: columns[2]?.trim() ?? "",
			suffix: columns[3]?.trim() ?? "",
			filingType,
			stateDistrict: columns[5]?.trim() ?? "",
			year: Number(columns[6]) || 0,
			filingDate: columns[7]?.trim() ?? "",
			documentId: columns[8]?.trim() ?? ""
		});
	}

	return rows;
}

function formatMemberDisplayName(row: HouseIndexRow): string {
	return [row.prefix, row.firstName, row.lastName, row.suffix]
		.filter((item) => item.length > 0)
		.join(" ")
		.replaceAll(/\s+/g, " ")
		.trim();
}

export async function fetchHousePeriodicTransactionReports(fromYear: number, toYear: number): Promise<HouseFilingReference[]> {
	const references: HouseFilingReference[] = [];

	for (let year = fromYear; year <= toYear; year += 1) {
		const indexUrl = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.txt`;
		const indexResponse = await fetchWithRetry(indexUrl, { maxRetries: 2 });
		const indexText = await indexResponse.text();
		const rows = parseHouseIndexText(indexText);

		for (const row of rows) {
			if (!row.documentId || !row.filingDate) {
				continue;
			}

			references.push({
				sourceSystem: "house-disclosures",
				sourceDocumentId: `house-${row.year}-${row.documentId}`,
				documentUrl: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${row.year}/${row.documentId}.pdf`,
				filedAt: row.filingDate,
				memberDisplayName: formatMemberDisplayName(row),
				stateDistrict: row.stateDistrict,
				year: row.year,
				chamber: "house"
			});
		}

		await rateLimitPause();
	}

	return references;
}
