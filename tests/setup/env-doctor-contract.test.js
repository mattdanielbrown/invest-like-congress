import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("package.json exposes the env doctor command", async () => {
	const packageJson = JSON.parse(await load("package.json"));

	assert.equal(packageJson.scripts["doctor:env"], "node scripts/run-env-doctor.js");
});

test("readme documents doctor:env for demo refresh troubleshooting", async () => {
	const readme = await load("README.md");

	assert.equal(readme.includes("npm run doctor:env"), true);
	assert.equal(readme.includes(".env.local"), true);
	assert.equal(readme.includes("Demo refresh and `/api/system/status` disagree"), true);
});
