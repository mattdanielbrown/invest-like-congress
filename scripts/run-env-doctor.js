import fs from "node:fs";
import path from "node:path";
import { connectDatabaseClient } from "./lib/database-connection-config.js";
import { loadEnvironmentFile } from "./lib/load-environment.js";

loadEnvironmentFile();

function fileExists(fileName) {
	return fs.existsSync(path.resolve(process.cwd(), fileName));
}

function classifyDatabaseTarget(hostname) {
	if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
		return "local";
	}

	return "remote";
}

function describeDatabaseUrl(databaseUrl) {
	if (!databaseUrl) {
		return {
			present: false
		};
	}

	const parsed = new URL(databaseUrl);
	return {
		present: true,
		host: parsed.hostname,
		port: parsed.port || "5432",
		database: parsed.pathname.replace(/^\//, ""),
		sslmode: parsed.searchParams.get("sslmode") ?? "implicit",
		target: classifyDatabaseTarget(parsed.hostname)
	};
}

async function queryConnectionDetails(databaseUrl) {
	const client = await connectDatabaseClient(databaseUrl);

	try {
		const result = await client.query(
			`SELECT
				current_database() AS current_database,
				current_user AS current_user,
				inet_server_addr()::text AS server_address,
				inet_server_port()::int AS server_port`
		);

		const row = result.rows[0] ?? {};
		return {
			currentDatabase: row.current_database ?? null,
			currentUser: row.current_user ?? null,
			serverAddress: row.server_address ?? null,
			serverPort: row.server_port ?? null
		};
	} finally {
		await client.end();
	}
}

async function run() {
	const databaseUrl = process.env.DATABASE_URL ?? null;
	const environmentReport = {
		cwd: process.cwd(),
		envFiles: {
			envLocal: fileExists(".env.local"),
			env: fileExists(".env")
		},
		databaseUrl: describeDatabaseUrl(databaseUrl)
	};

	if (!databaseUrl) {
		console.log(JSON.stringify(environmentReport, null, 2));
		process.exit(0);
	}

	try {
		const connection = await queryConnectionDetails(databaseUrl);
		console.log(JSON.stringify({
			...environmentReport,
			connection
		}, null, 2));
	} catch (error) {
		console.log(JSON.stringify({
			...environmentReport,
			connectionError: String(error?.message ?? error)
		}, null, 2));
		process.exit(1);
	}
}

run().catch((error) => {
	console.error("[doctor:env] failed", error);
	process.exit(1);
});
