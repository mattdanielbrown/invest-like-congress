import { getMemberTransactions } from "@/lib/domain/member-service";
import { internalError, okJson } from "@/lib/api/http";

interface RouteContext {
	params: Promise<{
		memberId: string;
	}>;
}

export async function GET(_request: Request, context: RouteContext) {
	try {
		const { memberId } = await context.params;
		const rows = await getMemberTransactions(memberId);
		return okJson({ rows, count: rows.length });
	} catch (error) {
		console.error("member-transactions-api-failure", error);
		return internalError("Failed to fetch member transactions.");
	}
}
