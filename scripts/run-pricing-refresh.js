import { loadEnvironmentFile } from "./lib/load-environment.js";
import { runPricingRefreshWorkerFromCli } from "@/lib/workers/run-pricing-refresh-worker.ts";

loadEnvironmentFile();

runPricingRefreshWorkerFromCli().catch((error) => {
	console.error("Pricing refresh failed", error);
	process.exit(1);
});
