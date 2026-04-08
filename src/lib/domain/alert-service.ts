import {
	listVerifiedSubscriptions,
	upsertAlertSubscription,
	unsubscribeAlertEmail,
	verifyAlertSubscriptionByToken
} from "@/lib/db/repository";
import type { PositionChangeEvent, SubscriptionPreference } from "@/lib/domain/types";
import { sendPositionChangeEmail } from "@/lib/notifications/email-sender";
import { processClaimedAlertEvents } from "@/lib/workers/process-alert-events.js";

export function isEventInPreference(event: PositionChangeEvent, preference: SubscriptionPreference): boolean {
	const matchesMember = preference.memberIds.length === 0 || preference.memberIds.includes(event.memberId);
	const matchesAsset = preference.assetIds.length === 0 || preference.assetIds.includes(event.assetId);
	return matchesMember && matchesAsset;
}

export async function subscribeAlertEmail(emailAddress: string, preference: SubscriptionPreference) {
	return upsertAlertSubscription(emailAddress, preference);
}

export async function unsubscribeAlertAddress(emailAddress: string) {
	return unsubscribeAlertEmail(emailAddress);
}

export async function verifyAlertSubscription(token: string) {
	return verifyAlertSubscriptionByToken(token);
}

interface DeliverPendingAlertEventsDependencies {
	runId: string;
	claimPendingPositionEvents: (limit: number) => Promise<PositionChangeEvent[]>;
	listVerifiedSubscriptions: typeof listVerifiedSubscriptions;
	markPositionEventProcessed: (eventId: string) => Promise<void>;
	markPositionEventDeliveryFailed: (eventId: string, failureReason: string) => Promise<void>;
	isEventInPreference?: typeof isEventInPreference;
	sendPositionChangeEmail?: typeof sendPositionChangeEmail;
}

export async function deliverPendingAlertEvents(dependencies: DeliverPendingAlertEventsDependencies) {
	const [events, subscriptions] = await Promise.all([
		dependencies.claimPendingPositionEvents(250),
		dependencies.listVerifiedSubscriptions()
	]);

	return processClaimedAlertEvents({
		runId: dependencies.runId,
		events,
		subscriptions,
		isEventInPreference: dependencies.isEventInPreference ?? isEventInPreference,
		sendDelivery: dependencies.sendPositionChangeEmail ?? sendPositionChangeEmail,
		markProcessed: dependencies.markPositionEventProcessed,
		markFailed: dependencies.markPositionEventDeliveryFailed
	});
}
