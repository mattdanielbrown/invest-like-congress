import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("public timestamp formatter emits deterministic UTC labels", async () => {
	const formatter = await load("src/lib/presentation/date-format.ts");

	assert.equal(formatter.includes("toISOString().slice(0, 16)"), true);
	assert.equal(formatter.includes('replace("T", " ")'), true);
	assert.equal(formatter.includes('UTC'), true);
});

test("public pages avoid locale-dependent timestamp rendering", async () => {
	const dataTable = await load("src/components/data-table.tsx");
	const assetDetailPage = await load("src/app/assets/[assetId]/page.tsx");

	assert.equal(dataTable.includes("toLocaleString()"), false);
	assert.equal(dataTable.includes("formatTimestampUtc"), true);
	assert.equal(assetDetailPage.includes("formatTimestampUtc"), true);
});
