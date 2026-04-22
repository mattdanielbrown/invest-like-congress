import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function createWorkspaceWithEnvFiles() {
	const workspaceDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "environment-loader-"));
	await fs.writeFile(
		path.join(workspaceDirectory, ".env"),
		"DATABASE_URL=postgres://from-env\nAPPLICATION_BASE_URL=http://from-env\n"
	);
	await fs.writeFile(
		path.join(workspaceDirectory, ".env.local"),
		"DATABASE_URL=postgres://from-env-local\n"
	);
	return workspaceDirectory;
}

async function evaluateEnvironmentLoader(workspaceDirectory, extraEnvironment = {}) {
	const script = `
		const { loadEnvironmentFile } = await import(${JSON.stringify(path.resolve(process.cwd(), "scripts/lib/load-environment.js"))});
		loadEnvironmentFile();
		console.log(JSON.stringify({
			databaseUrl: process.env.DATABASE_URL ?? null,
			applicationBaseUrl: process.env.APPLICATION_BASE_URL ?? null
		}));
	`;

	const { stdout } = await execFileAsync(
		"node",
		["--input-type=module", "--eval", script],
		{
			cwd: workspaceDirectory,
			env: {
				...process.env,
				...extraEnvironment
			}
		}
	);

	return JSON.parse(stdout);
}

test("environment loader prefers .env.local over .env for unset variables", async () => {
	const workspaceDirectory = await createWorkspaceWithEnvFiles();
	const loadedEnvironment = await evaluateEnvironmentLoader(workspaceDirectory, {
		DATABASE_URL: undefined,
		APPLICATION_BASE_URL: undefined
	});

	assert.equal(loadedEnvironment.databaseUrl, "postgres://from-env-local");
	assert.equal(loadedEnvironment.applicationBaseUrl, "http://from-env");
});

test("environment loader does not overwrite explicit process env values", async () => {
	const workspaceDirectory = await createWorkspaceWithEnvFiles();
	const loadedEnvironment = await evaluateEnvironmentLoader(workspaceDirectory, {
		DATABASE_URL: "postgres://from-process",
		APPLICATION_BASE_URL: "http://from-process"
	});

	assert.equal(loadedEnvironment.databaseUrl, "postgres://from-process");
	assert.equal(loadedEnvironment.applicationBaseUrl, "http://from-process");
});
