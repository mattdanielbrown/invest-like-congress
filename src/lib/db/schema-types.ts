export interface MemberQueryFilters {
	chamber?: string;
	party?: string;
	stateCode?: string;
	assetId?: string;
	dateFrom?: string;
	dateTo?: string;
	sortBy?: "date" | "shares" | "profit_loss" | "co_holder_count";
	sortDirection?: "asc" | "desc";
	page?: number;
	pageSize?: number;
}
