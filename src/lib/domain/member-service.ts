import type { MemberQueryFilters } from "@/lib/db/schema-types";
import { listMembersWithHoldings, listMemberTransactions } from "@/lib/db/repository";

export async function getMembersWithHoldings(filters: MemberQueryFilters) {
	return listMembersWithHoldings(filters);
}

export async function getMemberTransactions(memberId: string) {
	return listMemberTransactions(memberId);
}
