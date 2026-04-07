import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadServerEnv } from "@/lib/env/server-env";

export interface RawDocumentCacheEntry {
	id: string;
	cachePath: string;
	contentHash: string;
	fetchedAt: string;
	contentType: string | null;
	contentLength: number;
}

function fileExtensionForContentType(contentType: string | null): string {
	if (!contentType) {
		return ".bin";
	}
	if (contentType.includes("pdf")) {
		return ".pdf";
	}
	if (contentType.includes("html")) {
		return ".html";
	}
	if (contentType.includes("json")) {
		return ".json";
	}
	if (contentType.includes("text")) {
		return ".txt";
	}
	return ".bin";
}

export async function cacheRawDocument(sourceSystem: string, sourceDocumentId: string, bytes: Uint8Array, contentType: string | null): Promise<RawDocumentCacheEntry> {
	const env = loadServerEnv();
	const fetchedAt = new Date().toISOString();
	const contentHash = createHash("sha256").update(bytes).digest("hex");
	const extension = fileExtensionForContentType(contentType);

	const systemDirectory = path.join(env.rawFilingCacheDirectory, sourceSystem);
	await fs.mkdir(systemDirectory, { recursive: true });

	const safeDocumentId = sourceDocumentId.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
	const fileName = `${safeDocumentId}-${contentHash.slice(0, 10)}${extension}`;
	const cachePath = path.join(systemDirectory, fileName);
	await fs.writeFile(cachePath, bytes);

	return {
		id: randomUUID(),
		cachePath,
		contentHash,
		fetchedAt,
		contentType,
		contentLength: bytes.byteLength
	};
}
