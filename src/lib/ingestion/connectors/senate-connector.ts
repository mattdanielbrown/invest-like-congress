import { fetchWithRetry, rateLimitPause } from "@/lib/ingestion/http-client";
import { loadServerEnv } from "@/lib/env/server-env";

export interface SenateFilingReference {
	sourceSystem: "senate-disclosures";
	sourceDocumentId: string;
	documentUrl: string;
	filedAt: string;
	memberDisplayName: string;
	year: number;
	chamber: "senate";
}

export interface SenateSession {
	csrfToken: string;
	cookieHeader: string;
}

function parseCsrfToken(homeHtml: string): string {
	const match = homeHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/i);
	if (!match) {
		throw new Error("Could not locate Senate CSRF token from home page.");
	}
	return match[1];
}

function parseSetCookieHeader(response: Response): string {
	const rawHeader = response.headers.get("set-cookie") ?? "";
	if (!rawHeader) {
		return "";
	}

	return rawHeader
		.split(",")
		.map((piece) => piece.trim().split(";")[0])
		.filter((cookie) => cookie.includes("="))
		.join("; ");
}

function normalizeSenateDate(value: string): string {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return value;
	}

	const parts = value.split(/[\/\-]/).map((item) => item.trim());
	if (parts.length !== 3) {
		return value;
	}

	const [month, day, year] = parts;
	const paddedMonth = month.padStart(2, "0");
	const paddedDay = day.padStart(2, "0");
	return `${year}-${paddedMonth}-${paddedDay}`;
}

export async function createSenateSession(): Promise<SenateSession> {
	const homeResponse = await fetchWithRetry("https://efdsearch.senate.gov/search/home/");
	const homeHtml = await homeResponse.text();
	const csrfToken = parseCsrfToken(homeHtml);
	const initialCookies = parseSetCookieHeader(homeResponse);

	const agreementResponse = await fetchWithRetry("https://efdsearch.senate.gov/search/home/", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: initialCookies,
			Referer: "https://efdsearch.senate.gov/search/home/"
		},
		body: new URLSearchParams({
			prohibition_agreement: "1",
			csrfmiddlewaretoken: csrfToken
		}).toString()
	});

	const agreedCookies = parseSetCookieHeader(agreementResponse);
	return {
		csrfToken,
		cookieHeader: [initialCookies, agreedCookies].filter((cookie) => cookie.length > 0).join("; ")
	};
}

interface SenateDataRow {
	[first: string]: unknown;
}

function toSenateFilingReference(row: SenateDataRow): SenateFilingReference | null {
	const candidateDocumentId = String(row.filing_uuid ?? row.uuid ?? row.document_id ?? "").trim();
	const candidateDate = String(row.date_received ?? row.date_filed ?? row.filed_at ?? "").trim();
	const candidateName = String(row.filer_name ?? row.name ?? row.candidate ?? "").trim();
	if (!candidateDocumentId || !candidateDate || !candidateName) {
		return null;
	}

	const reportType = String(row.report_type ?? row.type ?? row.report ?? "").toLowerCase();
	if (reportType && !reportType.includes("periodic") && !reportType.includes("transaction") && !reportType.includes("ptr")) {
		return null;
	}

	const normalizedDate = normalizeSenateDate(candidateDate);
	const year = Number(normalizedDate.slice(0, 4)) || 0;

	return {
		sourceSystem: "senate-disclosures",
		sourceDocumentId: `senate-${candidateDocumentId}`,
		documentUrl: `https://efdsearch.senate.gov/search/view/ptr/${candidateDocumentId}/`,
		filedAt: normalizedDate,
		memberDisplayName: candidateName,
		year,
		chamber: "senate"
	};
}

export async function fetchSenatePeriodicTransactionReports(fromYear: number, toYear: number): Promise<SenateFilingReference[]> {
	const env = loadServerEnv();
	if (env.senateComplianceMode === "manual") {
		return [];
	}

	const session = await createSenateSession();
	const references: SenateFilingReference[] = [];

	for (let page = 0; page < 40; page += 1) {
		const pageSize = 100;
		const start = page * pageSize;
		const response = await fetchWithRetry(`https://efdsearch.senate.gov${env.senateReportDataPath}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Cookie: session.cookieHeader,
				Referer: "https://efdsearch.senate.gov/search/"
			},
			body: new URLSearchParams({
				draw: String(page + 1),
				start: String(start),
				length: String(pageSize),
				"search[value]": "periodic transaction",
				"search[regex]": "false"
			}).toString()
		});

		let payload: { data?: SenateDataRow[] };
		try {
			payload = (await response.json()) as { data?: SenateDataRow[] };
		} catch {
			break;
		}

		const rows = payload.data ?? [];
		if (rows.length === 0) {
			break;
		}

		for (const row of rows) {
			const reference = toSenateFilingReference(row);
			if (!reference) {
				continue;
			}
			if (reference.year >= fromYear && reference.year <= toYear) {
				references.push(reference);
			}
		}

		await rateLimitPause();
	}

	return references;
}

export function parseSenateCsrfFromHomePageHtml(homePageHtml: string): string {
	return parseCsrfToken(homePageHtml);
}
