import { runIngestionWorkerFromCli } from "./lib/run-ingestion-service.js";

runIngestionWorkerFromCli().catch((error) => {
	console.error("Ingestion failed", error);
	process.exit(1);
});
