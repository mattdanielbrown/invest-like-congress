import { randomUUID } from "node:crypto";

function toFailureReason(error) {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export async function runSharedWorker(options) {
	const runId = randomUUID();
	const startedAt = new Date().toISOString();
	const logger = options.logger ?? console;
	const hasDatabase = options.hasDatabase !== false;
	const warnings = [];
	const metrics = {};

	logger.info(`[${options.workerName}] starting`, {
		runId,
		startedAt
	});

	if (!hasDatabase) {
		if (!options.allowDryRunWithoutDatabase) {
			throw new Error("DATABASE_URL is required.");
		}

		const finishedAt = new Date().toISOString();
		warnings.push("DATABASE_URL not set; worker exited in dry-run mode.");
		logger.info(`[${options.workerName}:dry-run] DATABASE_URL not set; worker exited.`, {
			runId,
			startedAt,
			finishedAt
		});

		return {
			runId,
			workerName: options.workerName,
			startedAt,
			finishedAt,
			success: true,
			failureReason: null,
			metrics,
			warnings
		};
	}

	try {
		const result = await options.execute({
			runId,
			startedAt,
			logger
		});
		const finishedAt = new Date().toISOString();
		const summary = {
			runId,
			workerName: options.workerName,
			startedAt,
			finishedAt,
			success: result.failureReason == null,
			failureReason: result.failureReason ?? null,
			metrics: result.metrics ?? {},
			warnings: result.warnings ?? []
		};

		await options.persistRunSummary(summary);

		if (!summary.success) {
			logger.error(`[${options.workerName}] failed`, {
				runId,
				failureReason: summary.failureReason,
				metrics: summary.metrics,
				warnings: summary.warnings
			});
			const failureError = new Error(summary.failureReason ?? `${options.workerName} failed.`);
			failureError.summaryPersisted = true;
			throw failureError;
		}

		logger.info(`[${options.workerName}] completed`, {
			runId,
			metrics: summary.metrics,
			warnings: summary.warnings
		});

		return summary;
	} catch (error) {
		if (error?.summaryPersisted) {
			throw error;
		}

		const finishedAt = new Date().toISOString();
		const summary = {
			runId,
			workerName: options.workerName,
			startedAt,
			finishedAt,
			success: false,
			failureReason: toFailureReason(error),
			metrics,
			warnings
		};

		await options.persistRunSummary(summary);
		logger.error(`[${options.workerName}] failed`, {
			runId,
			failureReason: summary.failureReason
		});
		throw error;
	}
}
