import { getAssetActivityById } from "@/lib/domain/asset-service";
import { internalError, notFound, okJson } from "@/lib/api/http";

interface RouteContext {
	params: Promise<{
		assetId: string;
	}>;
}

export async function GET(_request: Request, context: RouteContext) {
	try {
		const { assetId } = await context.params;
		const row = await getAssetActivityById(assetId);
		if (!row) {
			return notFound("Asset activity not found.");
		}

		return okJson({ row });
	} catch (error) {
		console.error("asset-activity-api-failure", error);
		return internalError("Failed to fetch asset activity.");
	}
}
