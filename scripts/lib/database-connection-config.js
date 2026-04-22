import pg from "pg";

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function resolveDatabaseSsl(databaseUrl) {
	const parsedDatabaseUrl = new URL(databaseUrl);
	const sslMode = parsedDatabaseUrl.searchParams.get("sslmode");

	if (sslMode === "disable") {
		return undefined;
	}

	if (sslMode !== null && sslMode !== "") {
		return { rejectUnauthorized: false };
	}

	if (LOCAL_DATABASE_HOSTS.has(parsedDatabaseUrl.hostname)) {
		return undefined;
	}

	return { rejectUnauthorized: false };
}

export function buildDatabaseConnectionConfig(databaseUrl) {
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required.");
	}

	const ssl = resolveDatabaseSsl(databaseUrl);
	return {
		connectionString: databaseUrl,
		...(ssl ? { ssl } : {})
	};
}

export function createDatabaseClient(databaseUrl) {
	return new pg.Client(buildDatabaseConnectionConfig(databaseUrl));
}
