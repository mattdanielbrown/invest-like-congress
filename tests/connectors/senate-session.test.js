import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

function parseSenateCsrfFromHomePageHtml(homePageHtml) {
	const match = homePageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/i);
	return match?.[1] ?? "";
}

test("senate home page parser extracts csrf token", async () => {
	const fixture = await fs.readFile("tests/fixtures/senate/home-page.html", "utf8");
	const token = parseSenateCsrfFromHomePageHtml(fixture);
	assert.equal(token, "fake-csrf-token-123");
});
