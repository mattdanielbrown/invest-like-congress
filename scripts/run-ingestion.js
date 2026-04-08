import { loadEnvironmentFile } from "./lib/load-environment.js";
import { runIngestionWorkerFromCli } from "./lib/run-ingestion-service.js";

loadEnvironmentFile();

runIngestionWorkerFromCli().catch((error) => {
	console.error("Ingestion failed", error);
	process.exit(1);
});
