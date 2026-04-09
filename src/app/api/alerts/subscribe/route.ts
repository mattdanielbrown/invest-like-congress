import { subscribeAlertEmail, verifyAlertSubscription } from "@/lib/domain/alert-service";
import { badRequest, databaseSetupRequired, internalError, okJson } from "@/lib/api/http";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";
import { loadServerEnv } from "@/lib/env/server-env";

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
		const memberIds = Array.isArray(body?.memberIds) ? body.memberIds.filter((item: unknown) => typeof item === "string") : [];
		const assetIds = Array.isArray(body?.assetIds) ? body.assetIds.filter((item: unknown) => typeof item === "string") : [];

		if (!isEmailAddress(emailAddress)) {
			return badRequest("A valid emailAddress is required.");
		}

		const subscription = await subscribeAlertEmail(emailAddress, {
			memberIds,
			assetIds
		});

		const env = loadServerEnv();
		const verificationUrl = `${env.applicationBaseUrl}/api/alerts/subscribe?token=${subscription.verificationToken}`;

		return okJson({
			subscriptionId: subscription.id,
			isVerified: subscription.isVerified,
			verificationUrl,
			alerts: alertsTruthfulness
		});
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return databaseSetupRequired();
		}
		console.error("subscribe-api-failure", error);
		return internalError("Failed to create alert subscription.");
	}
}

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const token = searchParams.get("token");
		if (!token) {
			return badRequest("Verification token is required.");
		}

		const verified = await verifyAlertSubscription(token);
		return okJson({ verified });
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return databaseSetupRequired();
		}
		console.error("subscribe-verify-api-failure", error);
		return internalError("Failed to verify subscription token.");
	}
}
