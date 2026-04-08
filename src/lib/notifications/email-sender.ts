import { loadServerEnv } from "@/lib/env/server-env";
import type { PositionChangeEvent } from "@/lib/domain/types";

interface PositionChangeEmailInput {
	emailAddress: string;
	event: PositionChangeEvent;
	idempotencyKey: string;
}

export async function sendPositionChangeEmail(input: PositionChangeEmailInput): Promise<{ deliveryMode: "dry-run" | "provider" }> {
	const env = loadServerEnv();

	const subject = `Congress Portfolio Alert: ${input.event.action}`;
	const body = [
		`Event: ${input.event.action}`,
		`Member: ${input.event.memberId}`,
		`Asset: ${input.event.assetId}`,
		`Share delta: ${input.event.shareDelta}`,
		`Realized P/L: ${input.event.realizedProfitLoss ?? "n/a"}`,
		`Event ID: ${input.event.id}`
	].join("\n");

	if (!env.emailProviderApiKey) {
		console.info("[alert-email:dry-run]", {
			to: input.emailAddress,
			from: env.emailFromAddress,
			subject,
			body,
			idempotencyKey: input.idempotencyKey
		});
		return { deliveryMode: "dry-run" };
	}

	throw new Error("EMAIL_PROVIDER_API_KEY is configured but provider-backed alert delivery is not implemented.");
}
