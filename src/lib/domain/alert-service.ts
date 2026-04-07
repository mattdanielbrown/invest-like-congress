import {
	listPendingPositionEvents,
	listVerifiedSubscriptions,
	markPositionEventProcessed,
	upsertAlertSubscription,
	unsubscribeAlertEmail,
	verifyAlertSubscriptionByToken
} from "@/lib/db/repository";
import type { PositionChangeEvent, SubscriptionPreference } from "@/lib/domain/types";
import { sendPositionChangeEmail } from "@/lib/notifications/email-sender";

function isEventInPreference(event: PositionChangeEvent, preference: SubscriptionPreference): boolean {
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

export async function deliverPendingAlertEvents(): Promise<number> {
	const [events, subscriptions] = await Promise.all([
		listPendingPositionEvents(250),
		listVerifiedSubscriptions()
	]);

	let deliveredCount = 0;
	for (const event of events) {
		for (const subscription of subscriptions) {
			if (!isEventInPreference(event, subscription.preference)) {
				continue;
			}

			await sendPositionChangeEmail({
				emailAddress: subscription.emailAddress,
				event,
				idempotencyKey: `${event.id}:${subscription.id}`
			});
			deliveredCount += 1;
		}

		await markPositionEventProcessed(event.id);
	}

	return deliveredCount;
}
