import pgPackage from "pg";

const { Client } = pgPackage;

function getRequiredEnvironmentVariable(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is required.`);
	}

	return value;
}

async function runQuery(enableSsl) {
	const client = new Client({
		connectionString: getRequiredEnvironmentVariable("DATABASE_URL"),
		ssl: enableSsl ? { rejectUnauthorized: false } : undefined
	});

	await client.connect();

	try {
		return await client.query(getRequiredEnvironmentVariable("SQL_QUERY"));
	} finally {
		await client.end();
	}
}

export async function runSqlVerificationQuery() {
	let result;

	try {
		result = await runQuery(false);
	} catch (error) {
		const message = String(error?.message ?? "");
		const requiresSsl = message.includes("SSL/TLS required") || message.includes("SSL off");
		if (!requiresSsl) {
			throw error;
		}

		result = await runQuery(true);
	}

	for (const row of result.rows) {
		const output = Object.values(row).map((value) => (value === null ? "" : String(value)));
		console.log(output.join("\t"));
	}
}

const currentScriptPath = new URL(import.meta.url).pathname;
const invokedScriptPath = process.argv[1];

if (invokedScriptPath && currentScriptPath === invokedScriptPath) {
	await runSqlVerificationQuery();
}
