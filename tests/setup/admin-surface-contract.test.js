import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("admin surfaces are hard-gated behind ADMIN_SURFACES_ENABLED", async () => {
	const policy = await load("src/lib/admin/admin-surface-policy.ts");
	const quarantinePage = await load("src/app/admin/quarantine/page.tsx");
	const provenanceRoute = await load("src/app/api/admin/filings/[filingDocumentId]/provenance/route.ts");

	assert.equal(policy.includes('process.env.ADMIN_SURFACES_ENABLED === "1"'), true);
	assert.equal(quarantinePage.includes("isAdminSurfaceEnabled"), true);
	assert.equal(quarantinePage.includes("notFound()"), true);
	assert.equal(provenanceRoute.includes("isAdminSurfaceEnabled"), true);
	assert.equal(provenanceRoute.includes('return notFound("Not found.")'), true);
});

test("readme and env example document admin surfaces as disabled by default", async () => {
	const readme = await load("README.md");
	const envExample = await load(".env.example");

	assert.equal(readme.includes("Internal admin routes are disabled by default"), true);
	assert.equal(readme.includes("ADMIN_SURFACES_ENABLED=1"), true);
	assert.equal(envExample.includes("ADMIN_SURFACES_ENABLED=0"), true);
});
