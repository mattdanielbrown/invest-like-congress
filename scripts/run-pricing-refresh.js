import { loadEnvironmentFile } from "./lib/load-environment.js";
import { runPricingRefreshWorker } from "./lib/run-pricing-refresh-service.js";

loadEnvironmentFile();

runPricingRefreshWorker().catch((error) => {
	console.error("Pricing refresh failed", error);
	process.exit(1);
});
