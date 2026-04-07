import { getMembersWithHoldings } from "@/lib/domain/member-service";
import { databaseSetupRequired, internalError, okJson } from "@/lib/api/http";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const rows = await getMembersWithHoldings({
			chamber: searchParams.get("chamber") ?? undefined,
			party: searchParams.get("party") ?? undefined,
			stateCode: searchParams.get("stateCode") ?? undefined,
			assetId: searchParams.get("assetId") ?? undefined,
			dateFrom: searchParams.get("dateFrom") ?? undefined,
			dateTo: searchParams.get("dateTo") ?? undefined,
			sortBy: (searchParams.get("sortBy") as "date" | "shares" | "profit_loss" | "co_holder_count" | null) ?? undefined,
			sortDirection: (searchParams.get("sortDirection") as "asc" | "desc" | null) ?? undefined,
			page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
			pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined
		});

		return okJson({ rows, count: rows.length });
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return databaseSetupRequired();
		}
		console.error("members-api-failure", error);
		return internalError("Failed to fetch member holdings.");
	}
}
