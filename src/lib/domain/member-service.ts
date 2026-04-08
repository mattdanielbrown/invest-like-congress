import type { MemberQueryFilters } from "@/lib/db/schema-types";
import { getMemberPortfolioSummary, listMembersWithHoldings, listMemberTransactions } from "@/lib/db/repository";

export async function getMembersWithHoldings(filters: MemberQueryFilters) {
	return listMembersWithHoldings(filters);
}

export async function getMemberTransactions(memberId: string) {
	return listMemberTransactions(memberId);
}

export async function getMemberPortfolioSummaryById(memberId: string) {
	return getMemberPortfolioSummary(memberId);
}
