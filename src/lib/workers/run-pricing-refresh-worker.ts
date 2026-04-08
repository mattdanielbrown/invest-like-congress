import { persistWorkerRunSummary } from "@/lib/db/repository";
import { loadServerEnv } from "@/lib/env/server-env";
import { refreshPortfolioPricing } from "@/lib/market/pricing-refresh";
import { runSharedWorker } from "@/lib/workers/run-shared-worker.js";

export async function runPricingRefreshWorkerFromCli() {
	const env = loadServerEnv();

	const summary = await runSharedWorker({
		workerName: "pricing-refresh",
		hasDatabase: Boolean(env.databaseUrl),
		allowDryRunWithoutDatabase: process.env.WORKER_ALLOW_DRY_RUN === "1" || process.env.WORKER_ALLOW_DRY_RUN === "true",
		persistRunSummary: persistWorkerRunSummary,
		execute: async () => refreshPortfolioPricing()
	});

	return summary;
}
