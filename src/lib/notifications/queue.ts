export interface QueueJob<TPayload> {
	id: string;
	payload: TPayload;
	enqueuedAt: string;
}

const localQueue: QueueJob<unknown>[] = [];

export function enqueueJob<TPayload>(job: QueueJob<TPayload>) {
	localQueue.push(job);
}

export function drainJobs<TPayload>(): QueueJob<TPayload>[] {
	const drained = [...localQueue] as QueueJob<TPayload>[];
	localQueue.length = 0;
	return drained;
}
