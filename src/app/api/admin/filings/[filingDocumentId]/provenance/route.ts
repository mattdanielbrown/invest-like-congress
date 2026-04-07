import { getFilingProvenance } from "@/lib/db/repository";
import { internalError, notFound, okJson } from "@/lib/api/http";

interface RouteContext {
	params: Promise<{
		filingDocumentId: string;
	}>;
}

export async function GET(_request: Request, context: RouteContext) {
	try {
		const { filingDocumentId } = await context.params;
		const row = await getFilingProvenance(filingDocumentId);
		if (!row) {
			return notFound("Filing document provenance not found.");
		}

		return okJson({ row });
	} catch (error) {
		console.error("filing-provenance-api-failure", error);
		return internalError("Failed to fetch filing provenance.");
	}
}
