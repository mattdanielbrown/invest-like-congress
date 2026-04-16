import { unsubscribeAlertAddress } from "@/lib/domain/alert-service";
import { badRequest, databaseSetupRequired, internalError, okJson, serviceUnavailable } from "@/lib/api/http";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";
import { alertsLaunchPolicy } from "@/lib/alerts/launch-policy";

function isEmailAddress(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
	try {
		if (!alertsLaunchPolicy.subscriptionsApiEnabled) {
			return serviceUnavailable(
				"alerts_deferred_for_launch",
				alertsLaunchPolicy.message,
				{ alerts: alertsLaunchPolicy }
			);
		}

		const body = await request.json();
		const emailAddress = typeof body?.emailAddress === "string" ? body.emailAddress.trim().toLowerCase() : "";

		if (!isEmailAddress(emailAddress)) {
			return badRequest("A valid emailAddress is required.");
		}

		const unsubscribed = await unsubscribeAlertAddress(emailAddress);
		return okJson({
			unsubscribed,
			alerts: alertsLaunchPolicy
		});
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return databaseSetupRequired();
		}
		console.error("unsubscribe-api-failure", error);
		return internalError("Failed to unsubscribe email address.");
	}
}
