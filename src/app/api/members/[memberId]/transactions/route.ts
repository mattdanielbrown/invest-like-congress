import { getMemberTransactions } from "@/lib/domain/member-service";
import { databaseSetupRequired, internalError, okJson } from "@/lib/api/http";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";

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
		if (isDatabaseNotConfiguredError(error)) {
			return databaseSetupRequired();
		}
		console.error("member-transactions-api-failure", error);
		return internalError("Failed to fetch member transactions.");
	}
}
