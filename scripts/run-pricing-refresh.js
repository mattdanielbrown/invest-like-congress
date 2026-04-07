import { runPricingRefreshWorker } from "./lib/run-pricing-refresh-service.js";

runPricingRefreshWorker().catch((error) => {
	console.error("Pricing refresh failed", error);
	process.exit(1);
});
