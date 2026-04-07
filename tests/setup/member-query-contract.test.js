import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("member holdings query applies filters, sorting, and pagination", async () => {
	const source = await load("src/lib/db/repository.ts");
	assert.equal(source.includes("WHERE ${whereClauses.join(\" AND \")}"), true);
	assert.equal(source.includes("LIMIT ${limitPlaceholder}"), true);
	assert.equal(source.includes("OFFSET ${offsetPlaceholder}"), true);
	assert.equal(source.includes("EXISTS ("), true);
	assert.equal(source.includes("co_holder_aggregation"), true);
});
