import { loadEnvironmentFile } from "./lib/load-environment.js";
import { runAlertWorkerFromCli } from "@/lib/workers/run-alert-worker.ts";

loadEnvironmentFile();

runAlertWorkerFromCli().catch((error) => {
	console.error("Alert worker failed", error);
	process.exit(1);
});
