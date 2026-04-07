import { Pool } from "pg";
import { DatabaseNotConfiguredError } from "@/lib/db/errors";
import { loadServerEnv } from "@/lib/env/server-env";

let sharedPool: Pool | null = null;

export function getDatabasePool(): Pool {
	if (sharedPool !== null) {
		return sharedPool;
	}

	const env = loadServerEnv();
	if (!env.databaseUrl) {
		throw new DatabaseNotConfiguredError();
	}

	sharedPool = new Pool({
		connectionString: env.databaseUrl
	});

	return sharedPool;
}
