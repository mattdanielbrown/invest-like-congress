import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnvironmentFile } from "./lib/load-environment.js";

const { Client } = pg;
loadEnvironmentFile();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
	if (!process.env.DATABASE_URL) {
		console.error("DATABASE_URL is required.");
		process.exit(1);
	}

	const sqlDirectory = path.resolve(__dirname, "../sql");
	const migrationFileNames = (await fs.readdir(sqlDirectory))
		.filter((fileName) => /^\d+_.*\.sql$/.test(fileName))
		.sort((left, right) => left.localeCompare(right));

	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();

	try {
		await client.query("SELECT pg_advisory_lock(94741322)");
		for (const fileName of migrationFileNames) {
			const filePath = path.join(sqlDirectory, fileName);
			const sql = await fs.readFile(filePath, "utf8");
			await client.query("BEGIN");
			try {
				await client.query(sql);
				await client.query("COMMIT");
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			}
			console.info(`Applied ${fileName}`);
		}
		console.info("Database schema applied.");
	} finally {
		await client.query("SELECT pg_advisory_unlock(94741322)");
		await client.end();
	}
}

run().catch((error) => {
	console.error("Database setup failed", error);
	process.exit(1);
});
