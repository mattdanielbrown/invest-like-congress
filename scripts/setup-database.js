import fs from "node:fs/promises";
import { Client } from "pg";

async function run() {
	if (!process.env.DATABASE_URL) {
		console.error("DATABASE_URL is required.");
		process.exit(1);
	}

	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();

	try {
		const migration001 = await fs.readFile(new URL("../sql/001_initial_schema.sql", import.meta.url), "utf8");
		const migration002 = await fs.readFile(new URL("../sql/002_indexes.sql", import.meta.url), "utf8");
		await client.query(migration001);
		await client.query(migration002);
		console.info("Database schema applied.");
	} finally {
		await client.end();
	}
}

run().catch((error) => {
	console.error("Database setup failed", error);
	process.exit(1);
});
