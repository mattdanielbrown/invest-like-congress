import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function load(path) {
	return fs.readFile(path, "utf8");
}

test("member portfolio summaries carry member display data for the detail page", async () => {
	const types = await load("src/lib/domain/types.ts");
	const repository = await load("src/lib/db/repository.ts");

	assert.equal(types.includes("member: Member;"), true);
	assert.equal(repository.includes("FROM members"), true);
	assert.equal(repository.includes("full_name"), true);
	assert.equal(repository.includes("return null;"), true);
});

test("member detail page renders the member full name and 404s missing members", async () => {
	const page = await load("src/app/members/[memberId]/page.tsx");

	assert.equal(page.includes('import { notFound } from "next/navigation";'), true);
	assert.equal(page.includes("if (!summary)"), true);
	assert.equal(page.includes("notFound();"), true);
	assert.equal(page.includes("summary.member.fullName"), true);
	assert.equal(page.includes("Viewing verified transaction history for"), true);
});
