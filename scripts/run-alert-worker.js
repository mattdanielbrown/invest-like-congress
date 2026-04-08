import { loadEnvironmentFile } from "./lib/load-environment.js";
import { runAlertWorker } from "./lib/run-alert-worker-service.js";

loadEnvironmentFile();

runAlertWorker().catch((error) => {
	console.error("Alert worker failed", error);
	process.exit(1);
});
