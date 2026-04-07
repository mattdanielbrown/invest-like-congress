export interface ServerEnv {
	databaseUrl: string | null;
	applicationBaseUrl: string;
	emailFromAddress: string;
	emailProviderApiKey: string | null;
}

export function loadServerEnv(): ServerEnv {
	return {
		databaseUrl: process.env.DATABASE_URL ?? null,
		applicationBaseUrl: process.env.APPLICATION_BASE_URL ?? "http://localhost:3000",
		emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "alerts@congress-portfolio.local",
		emailProviderApiKey: process.env.EMAIL_PROVIDER_API_KEY ?? null
	};
}
