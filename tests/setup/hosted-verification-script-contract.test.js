import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function load(path) {
	return fs.readFile(path, "utf8");
}

async function makeExecutable(filePath, contents) {
	await fs.writeFile(filePath, contents, { mode: 0o755 });
}

async function createPgStub(workspaceDirectory) {
	const pgDirectory = path.join(workspaceDirectory, "node_modules", "pg");
	await fs.mkdir(pgDirectory, { recursive: true });
	await fs.writeFile(
		path.join(pgDirectory, "package.json"),
		JSON.stringify({
			name: "pg",
			version: "0.0.0-test",
			type: "module",
			exports: "./index.js"
		}, null, 2)
	);
	await fs.writeFile(
		path.join(pgDirectory, "index.js"),
		`class Client {
	constructor(config) {
		this.config = config;
	}

	async connect() {
		if (process.env.MOCK_PG_CONNECT_ERROR) {
			throw new Error(process.env.MOCK_PG_CONNECT_ERROR);
		}
	}

	async query(sql) {
		if (process.env.MOCK_PG_QUERY_ERROR) {
			throw new Error(process.env.MOCK_PG_QUERY_ERROR);
		}

		const queryText = String(sql);
		const rows = queryText.includes("ingestion_run_summaries")
			? JSON.parse(process.env.MOCK_PG_INGESTION_ROWS_JSON ?? "[]")
			: JSON.parse(process.env.MOCK_PG_PRICING_ROWS_JSON ?? "[]");

		return { rows };
	}

	async end() {}
}

export default { Client };
`
	);
}

async function createWorkspace() {
	const workspaceDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "hosted-verification-"));
	await fs.mkdir(path.join(workspaceDirectory, "scripts", "ops"), { recursive: true });
	await fs.mkdir(path.join(workspaceDirectory, "docs", "operations", "evidence"), { recursive: true });

	for (const relativePath of [
		"scripts/ops/verify-hosted-m5.sh",
		"scripts/ops/run-and-archive-hosted-m5.sh",
		"scripts/ops/run-sql-verification-query.js",
		"scripts/ops/write-hosted-verification-json.js"
	]) {
		const sourcePath = path.join(process.cwd(), relativePath);
		const destinationPath = path.join(workspaceDirectory, relativePath);
		await fs.mkdir(path.dirname(destinationPath), { recursive: true });
		await fs.copyFile(sourcePath, destinationPath);
		if (relativePath.endsWith(".sh")) {
			await fs.chmod(destinationPath, 0o755);
		}
	}

	await createPgStub(workspaceDirectory);

	return workspaceDirectory;
}

async function createBinStub(workspaceDirectory, name, contents) {
	const binDirectory = path.join(workspaceDirectory, "test-bin");
	await fs.mkdir(binDirectory, { recursive: true });
	await makeExecutable(path.join(binDirectory, name), contents);
	return binDirectory;
}

function buildEnvironment(workspaceDirectory, overrides = {}) {
	return {
		...process.env,
		PATH: `${path.join(workspaceDirectory, "test-bin")}:${process.env.PATH}`,
		HOSTED_BASE_URL: "https://example.test",
		DATABASE_URL: "postgres://verification:test@example.test/db",
		MOCK_STATUS_JSON: JSON.stringify({
			alerts: {
				launchState: "deferred",
				subscriptionsApiEnabled: false,
				workerDispatchEnabled: false
			},
			healthSignals: {
				pendingAlertEventCount: 0,
				minutesSinceLastIngestion: 12,
				minutesSinceLastPricingRefresh: 34
			},
			latestIngestionRun: { success: true },
			latestPricingRefreshRun: { success: true }
		}),
		...overrides
	};
}

async function runScript(workspaceDirectory, scriptRelativePath, overrides = {}) {
	const environment = buildEnvironment(workspaceDirectory, overrides);
	return execFileAsync("bash", [scriptRelativePath], {
		cwd: workspaceDirectory,
		env: environment
	});
}

function parseKeyValueOutput(stdout) {
	const output = new Map();
	for (const line of stdout.trim().split("\n")) {
		const [key, ...valueParts] = line.split("=");
		if (!key || valueParts.length === 0) {
			continue;
		}

		output.set(key, valueParts.join("="));
	}

	return output;
}

test("hosted verification falls back to node+pg when docker is present but unusable", async () => {
	const workspaceDirectory = await createWorkspace();
	await createBinStub(workspaceDirectory, "curl", "#!/usr/bin/env bash\nprintf '%s' \"$MOCK_STATUS_JSON\"\n");
	await createBinStub(workspaceDirectory, "docker", "#!/usr/bin/env bash\necho 'docker unavailable for test' >&2\nexit 1\n");

	const { stdout } = await runScript(
		workspaceDirectory,
		"./scripts/ops/verify-hosted-m5.sh",
		{
			MOCK_PG_INGESTION_ROWS_JSON: JSON.stringify([
				{
					run_id: "ingestion-run",
					mode: "hourly",
					started_at: "2026-04-21T00:00:00.000Z",
					finished_at: "2026-04-21T00:05:00.000Z",
					success: true
				}
			]),
			MOCK_PG_PRICING_ROWS_JSON: JSON.stringify([
				{
					worker_name: "pricing-refresh",
					run_id: "pricing-run",
					started_at: "2026-04-21T01:00:00.000Z",
					finished_at: "2026-04-21T01:05:00.000Z",
					success: true
				}
			])
		}
	);

	const output = parseKeyValueOutput(stdout);
	assert.equal(output.get("verification_passed"), "true");
	assert.ok(output.get("artifact_text"));
	assert.ok(output.get("artifact_json"));
	assert.ok(output.get("status_json"));
});

test("hosted verification JSON normalizes psql boolean output to true", async () => {
	const workspaceDirectory = await createWorkspace();
	await createBinStub(workspaceDirectory, "curl", "#!/usr/bin/env bash\nprintf '%s' \"$MOCK_STATUS_JSON\"\n");
	await createBinStub(
		workspaceDirectory,
		"psql",
		`#!/usr/bin/env bash
arguments="$*"
if printf '%s' "$arguments" | grep -q "ingestion_run_summaries"; then
	printf '%s\n' "$MOCK_INGESTION_ROW"
	exit 0
fi
if printf '%s' "$arguments" | grep -q "worker_run_summaries"; then
	printf '%s\n' "$MOCK_PRICING_ROW"
	exit 0
fi
echo "unexpected query" >&2
exit 1
`
	);

	const { stdout } = await runScript(
		workspaceDirectory,
		"./scripts/ops/verify-hosted-m5.sh",
		{
			MOCK_INGESTION_ROW: "ingestion-run\thourly\t2026-04-21 00:00:00+00\t2026-04-21 00:05:00+00\tt",
			MOCK_PRICING_ROW: "pricing-refresh\tpricing-run\t2026-04-21 01:00:00+00\t2026-04-21 01:05:00+00\tt"
		}
	);

	const output = parseKeyValueOutput(stdout);
	const artifactPath = output.get("artifact_json");
	assert.ok(artifactPath);

	const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
	assert.equal(artifact.statusChecks.latestIngestionRunSuccess, true);
	assert.equal(artifact.statusChecks.latestPricingRefreshRunSuccess, true);
});

test("archive wrapper preserves verify output contract and copies artifacts into evidence", async () => {
	const workspaceDirectory = await createWorkspace();
	await createBinStub(workspaceDirectory, "curl", "#!/usr/bin/env bash\nprintf '%s' \"$MOCK_STATUS_JSON\"\n");
	await createBinStub(
		workspaceDirectory,
		"psql",
		`#!/usr/bin/env bash
arguments="$*"
if printf '%s' "$arguments" | grep -q "ingestion_run_summaries"; then
	printf '%s\n' "$MOCK_INGESTION_ROW"
	exit 0
fi
if printf '%s' "$arguments" | grep -q "worker_run_summaries"; then
	printf '%s\n' "$MOCK_PRICING_ROW"
	exit 0
fi
echo "unexpected query" >&2
exit 1
`
	);

	const { stdout } = await runScript(
		workspaceDirectory,
		"./scripts/ops/run-and-archive-hosted-m5.sh",
		{
			MOCK_INGESTION_ROW: "ingestion-run\thourly\t2026-04-21 00:00:00+00\t2026-04-21 00:05:00+00\tt",
			MOCK_PRICING_ROW: "pricing-refresh\tpricing-run\t2026-04-21 01:00:00+00\t2026-04-21 01:05:00+00\tt"
		}
	);

	const output = parseKeyValueOutput(stdout);
	const archivedDirectory = output.get("archived_dir");
	assert.ok(archivedDirectory);

	const archivedFiles = await fs.readdir(path.join(workspaceDirectory, archivedDirectory));
	assert.equal(archivedFiles.some((fileName) => fileName.endsWith(".txt")), true);
	assert.equal(archivedFiles.some((fileName) => fileName.endsWith(".json")), true);
	assert.equal(archivedFiles.some((fileName) => fileName.endsWith(".status.json")), true);
});

test("hosted verification runbook and readme reference the canonical script", async () => {
	const runbook = await load("docs/operations/production-readiness-minimum.md");
	const readme = await load("README.md");
	const evidenceReadme = await load("docs/operations/evidence/README.md");
	const archiveScript = await load("scripts/ops/run-and-archive-hosted-m5.sh");
	assert.equal(runbook.includes("./scripts/ops/verify-hosted-m5.sh"), true);
	assert.equal(runbook.includes("./scripts/ops/run-and-archive-hosted-m5.sh"), true);
	assert.equal(runbook.includes("Fallback manual checks"), true);
	assert.equal(readme.includes("./scripts/ops/verify-hosted-m5.sh"), true);
	assert.equal(readme.includes("./scripts/ops/run-and-archive-hosted-m5.sh"), true);
	assert.equal(evidenceReadme.includes("./scripts/ops/run-and-archive-hosted-m5.sh"), true);
	assert.equal(archiveScript.includes("verify-hosted-m5.sh"), true);
	assert.equal(archiveScript.includes("archived_dir="), true);
});
