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

export function loadEnvironmentFile() {
	const envFilePath = path.resolve(process.cwd(), ".env");
	if (!fs.existsSync(envFilePath)) {
		return;
	}

	const fileContent = fs.readFileSync(envFilePath, "utf8");
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
