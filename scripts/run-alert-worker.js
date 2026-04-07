import { runAlertWorker } from "./lib/run-alert-worker-service.js";

runAlertWorker().catch((error) => {
	console.error("Alert worker failed", error);
	process.exit(1);
});
