import { unsubscribeAlertAddress } from "@/lib/domain/alert-service";
import { badRequest, internalError, okJson } from "@/lib/api/http";

function isEmailAddress(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const emailAddress = typeof body?.emailAddress === "string" ? body.emailAddress.trim().toLowerCase() : "";

		if (!isEmailAddress(emailAddress)) {
			return badRequest("A valid emailAddress is required.");
		}

		const unsubscribed = await unsubscribeAlertAddress(emailAddress);
		return okJson({ unsubscribed });
	} catch (error) {
		console.error("unsubscribe-api-failure", error);
		return internalError("Failed to unsubscribe email address.");
	}
}
