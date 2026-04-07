import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const requiredKeys = [
	"sourceSystem",
	"sourceDocumentId",
	"documentUrl",
	"filedAt",
	"memberName",
	"assetDisplayName",
	"action",
	"tradeDate"
];

async function loadFixture(path) {
	const text = await fs.readFile(path, "utf8");
	return JSON.parse(text);
}

test("house fixture has required fields", async () => {
	const fixture = await loadFixture("tests/fixtures/official-filings/sample-house-ptr.json");
	for (const key of requiredKeys) {
		assert.ok(fixture[key] !== undefined, `Missing key: ${key}`);
	}
	assert.equal(fixture.action, "purchase");
});

test("senate fixture has required fields", async () => {
	const fixture = await loadFixture("tests/fixtures/official-filings/sample-senate-ptr.json");
	for (const key of requiredKeys) {
		assert.ok(fixture[key] !== undefined, `Missing key: ${key}`);
	}
	assert.equal(fixture.action, "purchase");
});
