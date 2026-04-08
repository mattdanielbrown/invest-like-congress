import path from "node:path";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, "src");
const candidateSuffixes = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js", "/index.mjs"];

async function resolveAlias(specifier) {
	const relativePath = specifier.slice(2);
	for (const suffix of candidateSuffixes) {
		const candidatePath = path.join(srcRoot, `${relativePath}${suffix}`);
		try {
			await access(candidatePath, constants.F_OK);
			return pathToFileURL(candidatePath).href;
		} catch {
			// Try the next candidate.
		}
	}

	throw new Error(`Unable to resolve alias specifier: ${specifier}`);
}

export async function resolve(specifier, context, defaultResolve) {
	if (specifier.startsWith("@/")) {
		return {
			url: await resolveAlias(specifier),
			shortCircuit: true
		};
	}

	return defaultResolve(specifier, context, defaultResolve);
}
