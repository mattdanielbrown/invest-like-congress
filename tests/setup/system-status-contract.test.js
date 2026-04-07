import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("system status route includes additive health signals", async () => {
	const source = await fs.readFile("src/app/api/system/status/route.ts", "utf8");
	assert.equal(source.includes("healthSignals"), true);
	assert.equal(source.includes("latestIngestionRun"), true);
	assert.equal(source.includes("pendingAlertEventCount"), true);
});
