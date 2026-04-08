export function maybeSkipByCheckpoint(recordFiledAt: string, checkpointDate: string | null): boolean {
	if (!checkpointDate) {
		return false;
	}

	const recordDate = new Date(recordFiledAt);
	const knownDate = new Date(checkpointDate);
	return recordDate.getTime() <= knownDate.getTime();
}
