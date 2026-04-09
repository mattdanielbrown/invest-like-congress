import type { WorkerName, WorkerRunSummary } from "@/lib/domain/types";

export interface SharedWorkerExecutionResult {
	metrics?: Record<string, unknown>;
	warnings?: string[];
	failureReason?: string | null;
}

export interface SharedWorkerExecutionContext {
	runId: string;
	startedAt: string;
	logger: Console;
}

export interface RunSharedWorkerOptions {
	workerName: WorkerName;
	hasDatabase?: boolean;
	allowDryRunWithoutDatabase?: boolean;
	logger?: Console;
	persistRunSummary: (summary: WorkerRunSummary) => Promise<void>;
	execute: (context: SharedWorkerExecutionContext) => Promise<SharedWorkerExecutionResult>;
}

export function runSharedWorker(options: RunSharedWorkerOptions): Promise<WorkerRunSummary>;
