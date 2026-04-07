export interface ServerEnv {
	databaseUrl: string | null;
	applicationBaseUrl: string;
	emailFromAddress: string;
	emailProviderApiKey: string | null;
	ingestionUserAgent: string;
	rawFilingCacheDirectory: string;
	senateComplianceMode: "strict-non-commercial" | "manual";
	senateReportDataPath: string;
}

export function loadServerEnv(): ServerEnv {
	return {
		databaseUrl: process.env.DATABASE_URL ?? null,
		applicationBaseUrl: process.env.APPLICATION_BASE_URL ?? "http://localhost:3000",
		emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "alerts@congress-portfolio.local",
		emailProviderApiKey: process.env.EMAIL_PROVIDER_API_KEY ?? null,
		ingestionUserAgent: process.env.INGESTION_USER_AGENT ?? "invest-like-congress/1.0 (non-commercial, transparency research)",
		rawFilingCacheDirectory: process.env.RAW_FILING_CACHE_DIRECTORY ?? "/tmp/invest-like-congress/raw-filings",
		senateComplianceMode: process.env.SENATE_COMPLIANCE_MODE === "manual" ? "manual" : "strict-non-commercial",
		senateReportDataPath: process.env.SENATE_REPORT_DATA_PATH ?? "/search/report/data/"
	};
}
