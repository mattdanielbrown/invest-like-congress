function decodePdfStringToken(input: string): string {
	return input
		.replaceAll(/\\\(/g, "(")
		.replaceAll(/\\\)/g, ")")
		.replaceAll(/\\n/g, "\n")
		.replaceAll(/\\r/g, "\r")
		.replaceAll(/\\t/g, "\t")
		.replaceAll(/\\\\/g, "\\")
		.replaceAll(/\\([0-7]{3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function countOccurrences(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

function hasUsableExtractedText(extractedText: string): boolean {
	const normalized = extractedText
		.replaceAll(/[\u0000-\u001f]+/g, " ")
		.replaceAll(/[^\x20-\x7e]+/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim();
	const wordMatches = normalized.match(/[A-Za-z]{3,}/g) ?? [];
	return wordMatches.length >= 8;
}

export function extractTextFromPdfBytes(pdfBytes: Uint8Array): string {
	const pdfText = Buffer.from(pdfBytes).toString("latin1");
	const streamSegments = [...pdfText.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => match[1]);
	const searchTarget = streamSegments.length > 0 ? streamSegments.join("\n") : pdfText;

	const tokenMatches = [...searchTarget.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)];
	if (tokenMatches.length === 0) {
		return searchTarget;
	}

	const decodedParts = tokenMatches
		.map((match) => decodePdfStringToken(match[1]))
		.map((chunk) => chunk.replaceAll(/[\u0000-\u001f]+/g, " ").trim())
		.filter((chunk) => chunk.length > 0);

	return decodedParts.join("\n");
}

export function detectPdfExtractionIssue(pdfBytes: Uint8Array, extractedText: string): string | null {
	if (hasUsableExtractedText(extractedText)) {
		return null;
	}

	const pdfText = Buffer.from(pdfBytes).toString("latin1");
	const imageObjectCount = countOccurrences(pdfText, "/Subtype/Image") + countOccurrences(pdfText, "/Subtype /Image");
	const faxDecodeCount = countOccurrences(pdfText, "/CCITTFaxDecode");
	const fontCount = countOccurrences(pdfText, "/Font");
	const toUnicodeCount = countOccurrences(pdfText, "/ToUnicode");

	if (imageObjectCount > 0 && faxDecodeCount > 0 && fontCount === 0 && toUnicodeCount === 0) {
		return "pdf-image-only-no-text-layer";
	}

	return "pdf-text-extraction-unreadable";
}
