import test from "node:test";
import assert from "node:assert/strict";
import { detectPdfExtractionIssue } from "../../src/lib/ingestion/parsers/pdf-text.ts";

test("detectPdfExtractionIssue flags image-only scanned PDFs without a text layer", () => {
	const fakeImageOnlyPdf = Buffer.from(
		"%PDF-1.5\n"
		+ "4 0 obj\n"
		+ "<</Subtype/Image/Filter/CCITTFaxDecode>>\n"
		+ "stream\n"
		+ "binary-data\n"
		+ "endstream\n",
		"latin1"
	);

	assert.equal(
		detectPdfExtractionIssue(new Uint8Array(fakeImageOnlyPdf), ""),
		"pdf-image-only-no-text-layer"
	);
});

test("detectPdfExtractionIssue accepts readable extracted text", () => {
	const fakeTextPdf = Buffer.from("%PDF-1.5\n/Font\n/ToUnicode\n", "latin1");
	const readableText = [
		"Periodic Transaction Report",
		"Microsoft Corporation",
		"Purchase",
		"04/02/2026",
		"$1,000 - $15,000",
		"Owner: Self",
		"Ticker: MSFT",
		"Page 1 of 2"
	].join("\n");

	assert.equal(detectPdfExtractionIssue(new Uint8Array(fakeTextPdf), readableText), null);
});
