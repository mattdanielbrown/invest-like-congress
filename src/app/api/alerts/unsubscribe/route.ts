import { unsubscribeAlertAddress } from "@/lib/domain/alert-service";
import { badRequest, databaseSetupRequired, internalError, okJson } from "@/lib/api/http";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";

const alertsTruthfulness = {
	deliveryMode: "dry-run-only",
	mvpStatus: "not-provider-backed",
	message: "Alert subscriptions are active for MVP evaluation, but provider-backed email delivery is not yet implemented."
} as const;

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
		return okJson({
			unsubscribed,
			alerts: alertsTruthfulness
		});
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return databaseSetupRequired();
		}
		console.error("unsubscribe-api-failure", error);
		return internalError("Failed to unsubscribe email address.");
	}
}
