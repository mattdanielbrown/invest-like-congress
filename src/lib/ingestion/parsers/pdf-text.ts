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
