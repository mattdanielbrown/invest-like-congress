import test from "node:test";
import assert from "node:assert/strict";
import { buildDatabaseConnectionConfig, connectDatabaseClient } from "../../scripts/lib/database-connection-config.js";
import pg from "pg";

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

test("script database client retries with SSL when the initial connection is rejected", async (context) => {
	class MockClient {
		static attempts = [];

		constructor(config) {
			this.config = config;
		}

		async connect() {
			MockClient.attempts.push(this.config);
			if (!this.config.ssl) {
				throw new Error("SSL/TLS required");
			}
		}

		async end() {}
	}

	const originalClient = pg.Client;
	context.after(() => {
		pg.Client = originalClient;
	});
	pg.Client = MockClient;

	const client = await connectDatabaseClient("postgres://user:password@db.example.com:5432/congress_portfolio?sslmode=disable");

	assert.equal(MockClient.attempts.length, 2);
	assert.equal("ssl" in MockClient.attempts[0], false);
	assert.deepEqual(MockClient.attempts[1].ssl, { rejectUnauthorized: false });
	assert.ok(client instanceof MockClient);
});
