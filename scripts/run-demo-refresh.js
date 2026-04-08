import { spawn } from "node:child_process";
import { loadEnvironmentFile } from "./lib/load-environment.js";

loadEnvironmentFile();

function runCommand(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			env: process.env
		});

		child.on("error", (error) => {
			reject(error);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
		});
	});
}

function toYearBounds() {
	const currentYear = new Date().getUTCFullYear();
	const fromYear = Number(process.env.DEMO_FROM_YEAR ?? currentYear);
	const toYear = Number(process.env.DEMO_TO_YEAR ?? currentYear);
	return {
		fromYear: Number.isFinite(fromYear) ? fromYear : currentYear,
		toYear: Number.isFinite(toYear) ? toYear : currentYear
	};
}

async function run() {
	const { fromYear, toYear } = toYearBounds();
	console.info("[demo-refresh] starting", { fromYear, toYear });

	await runCommand("node", ["scripts/setup-database.js"]);
	await runCommand("node", ["scripts/run-ingestion.js", `--mode=backfill`, `--from-year=${fromYear}`, `--to-year=${toYear}`]);
	await runCommand("node", ["scripts/run-demo-seed.js"]);
	await runCommand("node", ["scripts/run-pricing-refresh.js"]);

	console.info("[demo-refresh] completed", { fromYear, toYear });
}

run().catch((error) => {
	console.error("[demo-refresh] failed", error);
	process.exit(1);
});
