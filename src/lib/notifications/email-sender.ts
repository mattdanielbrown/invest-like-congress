import { loadServerEnv } from "@/lib/env/server-env";
import type { PositionChangeEvent } from "@/lib/domain/types";

interface PositionChangeEmailInput {
	emailAddress: string;
	event: PositionChangeEvent;
	idempotencyKey: string;
}

export async function sendPositionChangeEmail(input: PositionChangeEmailInput): Promise<void> {
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
		return;
	}

	console.info("[alert-email:provider-not-implemented]", {
		to: input.emailAddress,
		from: env.emailFromAddress,
		subject,
		body,
		idempotencyKey: input.idempotencyKey
	});
}
