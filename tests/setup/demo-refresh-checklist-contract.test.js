import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("readme links the dedicated demo refresh checklist", async () => {
	const readme = await load("README.md");

	assert.equal(readme.includes("docs/operations/demo-refresh-checklist.md"), true);
	assert.equal(readme.includes("npm run doctor:env"), true);
	assert.equal(readme.includes("npm run demo:refresh"), true);
});

test("demo refresh checklist distinguishes local and remote database targets", async () => {
	const runbook = await load("docs/operations/demo-refresh-checklist.md");

	assert.equal(runbook.includes('"target": "local"'), true);
	assert.equal(runbook.includes('"target": "remote"'), true);
	assert.equal(runbook.includes("docker compose down -v"), true);
	assert.equal(runbook.includes("Do not run `docker compose down -v`"), true);
});

test("demo refresh checklist covers status and fallback verification", async () => {
	const runbook = await load("docs/operations/demo-refresh-checklist.md");

	assert.equal(runbook.includes("curl -sS http://localhost:3000/api/system/status"), true);
	assert.equal(runbook.includes("demoData.mode"), true);
	assert.equal(runbook.includes("DEMO_FROM_YEAR=2100 DEMO_TO_YEAR=2100 npm run demo:refresh"), true);
	assert.equal(runbook.includes("deterministic-fallback"), true);
});
