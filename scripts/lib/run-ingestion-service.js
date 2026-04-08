import { runLiveIngestion } from "@/lib/ingestion/live-ingestion.ts";

function parseArgument(name, fallbackValue) {
	const prefix = `--${name}=`;
	const match = process.argv.find((argument) => argument.startsWith(prefix));
	if (!match) {
		return fallbackValue;
	}
	return match.slice(prefix.length);
}

export async function runIngestionWorkerFromCli() {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required.");
	}

	const fromYear = Number(parseArgument("from-year", "2019"));
	const toYear = Number(parseArgument("to-year", String(new Date().getUTCFullYear())));
	const mode = parseArgument("mode", "hourly");
	if (!Number.isFinite(fromYear) || !Number.isFinite(toYear) || toYear < fromYear) {
		throw new Error("Invalid from-year/to-year values.");
	}
	if (mode !== "hourly" && mode !== "backfill") {
		throw new Error("mode must be either 'hourly' or 'backfill'.");
	}

	const summary = await runLiveIngestion({
		mode,
		fromYear,
		toYear
	});

	console.info("[ingestion] completed", {
		runId: summary.runId,
		mode,
		fromYear,
		toYear,
		fetchedDocuments: summary.fetchedDocuments,
		parsedDocuments: summary.parsedDocuments,
		quarantinedDocuments: summary.quarantinedDocuments,
		extractedTransactions: summary.extractedTransactions,
		provenanceCoverageRatio: summary.provenanceCoverageRatio,
		warnings: summary.warnings
	});
}
