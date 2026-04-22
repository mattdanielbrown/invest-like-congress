import fs from "node:fs";
import path from "node:path";

function parseLine(line) {
	const trimmedLine = line.trim();
	if (!trimmedLine || trimmedLine.startsWith("#")) {
		return null;
	}

	const equalsIndex = trimmedLine.indexOf("=");
	if (equalsIndex <= 0) {
		return null;
	}

	const key = trimmedLine.slice(0, equalsIndex).trim();
	let value = trimmedLine.slice(equalsIndex + 1).trim();
	if (!key) {
		return null;
	}

	if (
		(value.startsWith("\"") && value.endsWith("\""))
		|| (value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}

	return { key, value };
}

function loadEnvironmentVariablesFromFile(filePath) {
	if (!fs.existsSync(filePath)) {
		return;
	}

	const fileContent = fs.readFileSync(filePath, "utf8");
	const lines = fileContent.split(/\r?\n/);

	for (const line of lines) {
		const parsed = parseLine(line);
		if (!parsed) {
			continue;
		}

		if (process.env[parsed.key] !== undefined) {
			continue;
		}

		process.env[parsed.key] = parsed.value;
	}
}

export function loadEnvironmentFile() {
	const currentWorkingDirectory = process.cwd();
	const nodeEnvironment = process.env.NODE_ENV;
	const candidateFileNames = [
		".env.local",
		nodeEnvironment ? `.env.${nodeEnvironment}` : null,
		".env"
	].filter(Boolean);

	for (const fileName of candidateFileNames) {
		loadEnvironmentVariablesFromFile(path.resolve(currentWorkingDirectory, fileName));
	}
}
