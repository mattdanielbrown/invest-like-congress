import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function evaluatePoolConfig(databaseUrl) {
	const script = `
		const { buildDatabasePoolConfig } = await import("./src/lib/db/pool.ts");
		const config = buildDatabasePoolConfig(process.argv[1]);
		console.log(JSON.stringify({
			hasSsl: Boolean(config.ssl),
			rejectUnauthorized: config.ssl && typeof config.ssl === "object" ? config.ssl.rejectUnauthorized : null
		}));
	`;

	const { stdout } = await execFileAsync(
		"node",
		[
			"--experimental-strip-types",
			"--import",
			"./scripts/lib/register-alias-loader.mjs",
			"--input-type=module",
			"--eval",
			script,
			databaseUrl
		],
		{
			cwd: process.cwd()
		}
	);

	return JSON.parse(stdout);
}

test("database pool keeps localhost Postgres connections non-SSL by default", async () => {
	const config = await evaluatePoolConfig("postgres://postgres:postgres@127.0.0.1:5432/congress_portfolio");

	assert.equal(config.hasSsl, false);
	assert.equal(config.rejectUnauthorized, null);
});

test("database pool enables SSL for managed Postgres URLs that omit sslmode", async () => {
	const config = await evaluatePoolConfig("postgres://user:password@db.example.com:5432/congress_portfolio");

	assert.equal(config.hasSsl, true);
	assert.equal(config.rejectUnauthorized, false);
});

test("database pool respects sslmode=disable for explicit local overrides", async () => {
	const config = await evaluatePoolConfig("postgres://user:password@db.example.com:5432/congress_portfolio?sslmode=disable");

	assert.equal(config.hasSsl, false);
	assert.equal(config.rejectUnauthorized, null);
});
