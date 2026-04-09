import type {
	AlertSubscription,
	PositionChangeEvent,
	SubscriptionPreference
} from "@/lib/domain/types";

export interface ProcessClaimedAlertEventsResult {
	metrics: Record<string, unknown>;
	warnings: string[];
	failureReason: string | null;
}

export interface ProcessClaimedAlertEventsOptions {
	runId: string;
	events: PositionChangeEvent[];
	subscriptions: AlertSubscription[];
	isEventInPreference: (event: PositionChangeEvent, preference: SubscriptionPreference) => boolean;
	sendDelivery: (input: {
		emailAddress: string;
		event: PositionChangeEvent;
		idempotencyKey: string;
	}) => Promise<{ deliveryMode?: string | null }>;
	markProcessed: (eventId: string, runId?: string) => Promise<void>;
	markFailed: (eventId: string, failureReason: string) => Promise<void>;
}

export function processClaimedAlertEvents(
	options: ProcessClaimedAlertEventsOptions
): Promise<ProcessClaimedAlertEventsResult>;
