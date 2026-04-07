export interface ServerEnv {
	databaseUrl: string | null;
	applicationBaseUrl: string;
	emailFromAddress: string;
	emailProviderApiKey: string | null;
	ingestionUserAgent: string;
	rawFilingCacheDirectory: string;
	senateComplianceMode: "strict-non-commercial" | "manual";
	senateReportDataPath: string;
	ingestionRetryMaxRetries: number;
	ingestionRetryDelayMs: number;
	ingestionRateLimitPauseMs: number;
}

function parsePositiveInteger(rawValue: string | undefined, fallbackValue: number): number {
	const parsed = Number(rawValue);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return fallbackValue;
	}
	return Math.floor(parsed);
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
		senateReportDataPath: process.env.SENATE_REPORT_DATA_PATH ?? "/search/report/data/",
		ingestionRetryMaxRetries: parsePositiveInteger(process.env.INGESTION_RETRY_MAX_RETRIES, 3),
		ingestionRetryDelayMs: parsePositiveInteger(process.env.INGESTION_RETRY_DELAY_MS, 800),
		ingestionRateLimitPauseMs: parsePositiveInteger(process.env.INGESTION_RATE_LIMIT_PAUSE_MS, 300)
	};
}
