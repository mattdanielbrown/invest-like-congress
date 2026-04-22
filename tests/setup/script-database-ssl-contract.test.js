import test from "node:test";
import assert from "node:assert/strict";
import { buildDatabaseConnectionConfig } from "../../scripts/lib/database-connection-config.js";

test("script database client keeps localhost connections non-SSL by default", () => {
	const config = buildDatabaseConnectionConfig("postgres://postgres:postgres@127.0.0.1:5432/congress_portfolio");

	assert.equal("ssl" in config, false);
});

test("script database client enables SSL for managed Postgres URLs", () => {
	const config = buildDatabaseConnectionConfig("postgres://user:password@db.example.com:5432/congress_portfolio");

	assert.deepEqual(config.ssl, { rejectUnauthorized: false });
});

test("script database client respects sslmode=disable", () => {
	const config = buildDatabaseConnectionConfig("postgres://user:password@db.example.com:5432/congress_portfolio?sslmode=disable");

	assert.equal("ssl" in config, false);
});
