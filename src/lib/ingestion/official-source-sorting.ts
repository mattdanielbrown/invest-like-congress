export interface SortableOfficialFilingRecord {
	filedAt: string;
	sourceDocumentId: string;
}

export function sortOfficialFilingRecords<T extends SortableOfficialFilingRecord>(records: T[]): T[] {
	return [...records].sort((left, right) => {
		const dateOrder = left.filedAt.localeCompare(right.filedAt);
		if (dateOrder !== 0) {
			return dateOrder;
		}
		return left.sourceDocumentId.localeCompare(right.sourceDocumentId);
	});
}
