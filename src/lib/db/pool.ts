import { Pool } from "pg";
import { loadServerEnv } from "@/lib/env/server-env";

let sharedPool: Pool | null = null;

export function getDatabasePool(): Pool {
	if (sharedPool !== null) {
		return sharedPool;
	}

	const env = loadServerEnv();
	if (!env.databaseUrl) {
		throw new Error("DATABASE_URL is required for database-backed operations.");
	}

	sharedPool = new Pool({
		connectionString: env.databaseUrl
	});

	return sharedPool;
}
