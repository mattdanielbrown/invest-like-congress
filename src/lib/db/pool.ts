import pg from "pg";
import type { Pool, PoolConfig } from "pg";
import { DatabaseNotConfiguredError } from "@/lib/db/errors";
import { loadServerEnv } from "@/lib/env/server-env";

const { Pool: PostgresPool } = pg;
let sharedPool: Pool | null = null;
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function resolveDatabaseSsl(databaseUrl: string): PoolConfig["ssl"] | undefined {
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

	// Managed Postgres providers commonly require TLS even when the URL omits sslmode.
	return { rejectUnauthorized: false };
}

export function buildDatabasePoolConfig(databaseUrl: string): PoolConfig {
	const ssl = resolveDatabaseSsl(databaseUrl);

	return {
		connectionString: databaseUrl,
		...(ssl ? { ssl } : {})
	};
}

export function getDatabasePool(): Pool {
	if (sharedPool !== null) {
		return sharedPool;
	}

	const env = loadServerEnv();
	if (!env.databaseUrl) {
		throw new DatabaseNotConfiguredError();
	}

	sharedPool = new PostgresPool(buildDatabasePoolConfig(env.databaseUrl));

	return sharedPool;
}
