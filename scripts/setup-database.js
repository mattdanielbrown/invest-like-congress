import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

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
		for (const fileName of migrationFileNames) {
			const filePath = path.join(sqlDirectory, fileName);
			const sql = await fs.readFile(filePath, "utf8");
			await client.query(sql);
			console.info(`Applied ${fileName}`);
		}
		console.info("Database schema applied.");
	} finally {
		await client.end();
	}
}

run().catch((error) => {
	console.error("Database setup failed", error);
	process.exit(1);
});
