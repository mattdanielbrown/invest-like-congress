import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("repository does not use runtime sample fallback rows", async () => {
	const source = await load("src/lib/db/repository.ts");
	assert.equal(source.includes("sampleMemberRows"), false);
	assert.equal(source.includes("sampleTransactionsWithPresentation"), false);
	assert.equal(source.includes("sampleAssetActivityRows"), false);
	assert.equal(source.includes("sampleStatus"), false);
	assert.equal(source.includes("fallbackSubscriptions"), false);
	assert.equal(source.includes("fallbackEvents"), false);
});

test("member and asset APIs return setup-required responses when DB is missing", async () => {
	const membersApi = await load("src/app/api/members/route.ts");
	const transactionsApi = await load("src/app/api/members/[memberId]/transactions/route.ts");
	const assetApi = await load("src/app/api/assets/[assetId]/activity/route.ts");

	assert.equal(membersApi.includes("databaseSetupRequired"), true);
	assert.equal(transactionsApi.includes("databaseSetupRequired"), true);
	assert.equal(assetApi.includes("databaseSetupRequired"), true);
});

test("key pages include setup-required UI state", async () => {
	const homePage = await load("src/app/page.tsx");
	const memberPage = await load("src/app/members/[memberId]/page.tsx");
	const assetPage = await load("src/app/assets/[assetId]/page.tsx");

	assert.equal(homePage.includes("DatabaseSetupRequired"), true);
	assert.equal(memberPage.includes("DatabaseSetupRequired"), true);
	assert.equal(assetPage.includes("DatabaseSetupRequired"), true);
});
