import { spawn } from "node:child_process";
import pg from "pg";
import { shouldApplyDeterministicFallback, resolveDemoDataModeFromStatusSignals } from "./lib/demo-data-mode.js";
import { loadEnvironmentFile } from "./lib/load-environment.js";

loadEnvironmentFile();
const { Client } = pg;

function runCommand(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			env: process.env
		});

		child.on("error", (error) => {
			reject(error);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
		});
	});
}

function toYearBounds() {
	const currentYear = new Date().getUTCFullYear();
	const fromYear = Number(process.env.DEMO_FROM_YEAR ?? currentYear);
	const toYear = Number(process.env.DEMO_TO_YEAR ?? currentYear);
	return {
		fromYear: Number.isFinite(fromYear) ? fromYear : currentYear,
		toYear: Number.isFinite(toYear) ? toYear : currentYear
	};
}

async function getVerifiedTransactionCount() {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required.");
	}

	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	try {
		const result = await client.query(
			`SELECT COUNT(*)::int AS count
			FROM normalized_transactions
			WHERE verification_status = 'verified'`
		);
		return Number(result.rows[0]?.count ?? 0);
	} finally {
		await client.end();
	}
}

async function getVerifiedDataCounts() {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required.");
	}

	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	try {
		const result = await client.query(
			`SELECT
				(SELECT COUNT(*)::int
					FROM normalized_transactions
					WHERE verification_status = 'verified') AS verified_transactions,
				(SELECT COUNT(*)::int
					FROM normalized_transactions t
					LEFT JOIN filing_documents fd ON fd.source_document_id = t.filing_document_id
					WHERE t.verification_status = 'verified'
						AND fd.source_system = 'demo-seed') AS demo_seed_transactions,
				(SELECT COUNT(*)::int
					FROM normalized_transactions t
					LEFT JOIN filing_documents fd ON fd.source_document_id = t.filing_document_id
					WHERE t.verification_status = 'verified'
						AND COALESCE(fd.source_system, '') <> 'demo-seed') AS official_transactions`
		);
		const row = result.rows[0] ?? {};
		return {
			verifiedTransactions: Number(row.verified_transactions ?? 0),
			demoSeedTransactions: Number(row.demo_seed_transactions ?? 0),
			officialTransactions: Number(row.official_transactions ?? 0)
		};
	} finally {
		await client.end();
	}
}

async function run() {
	const { fromYear, toYear } = toYearBounds();
	const ingestionRuntimeArgs = [
		"--experimental-strip-types",
		"--import",
		"./scripts/lib/register-alias-loader.mjs"
	];
	console.info("[demo-refresh] starting", { fromYear, toYear });

	await runCommand("node", ["scripts/setup-database.js"]);
	let ingestionFailureReason = null;
	try {
		await runCommand("node", [...ingestionRuntimeArgs, "scripts/run-ingestion.js", `--mode=backfill`, `--from-year=${fromYear}`, `--to-year=${toYear}`]);
	} catch (error) {
		ingestionFailureReason = error instanceof Error ? error.message : String(error);
		console.warn("[demo-refresh] ingestion failed; continuing with fallback check", {
			fromYear,
			toYear,
			failureReason: ingestionFailureReason
		});
	}

	const verifiedTransactionCountAfterIngestion = await getVerifiedTransactionCount();
	const fallbackRequired = shouldApplyDeterministicFallback({
		ingestionFailed: ingestionFailureReason !== null,
		verifiedTransactionCount: verifiedTransactionCountAfterIngestion
	});

	let fallbackApplied = false;
	if (fallbackRequired) {
		await runCommand("node", ["scripts/run-demo-seed.js"]);
		fallbackApplied = true;
	}

	await runCommand("node", [...ingestionRuntimeArgs, "scripts/run-pricing-refresh.js"]);

	const finalVerifiedDataCounts = await getVerifiedDataCounts();
	const demoDataMode = resolveDemoDataModeFromStatusSignals({
		...finalVerifiedDataCounts,
		latestIngestionRunSuccess: ingestionFailureReason === null,
		latestIngestionExtractedTransactions: null
	});

	console.info("[demo-refresh] completed", {
		fromYear,
		toYear,
		demoDataMode,
		fallbackApplied,
		counts: finalVerifiedDataCounts,
		ingestion: {
			success: ingestionFailureReason === null,
			failureReason: ingestionFailureReason
		}
	});
}

run().catch((error) => {
	console.error("[demo-refresh] failed", error);
	process.exit(1);
});
