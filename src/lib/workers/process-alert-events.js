export async function processClaimedAlertEvents(options) {
	const metrics = {
		claimedEvents: options.events.length,
		processedEvents: 0,
		failedEvents: 0,
		deliveriesAttempted: 0,
		deliveriesCompleted: 0,
		dryRunDeliveries: 0
	};
	const warnings = [];

	for (const event of options.events) {
		try {
			const matchingSubscriptions = options.subscriptions.filter((subscription) => options.isEventInPreference(event, subscription.preference));
			for (const subscription of matchingSubscriptions) {
				metrics.deliveriesAttempted += 1;
				const deliveryResult = await options.sendDelivery({
					emailAddress: subscription.emailAddress,
					event,
					idempotencyKey: `${event.id}:${subscription.id}`
				});
				metrics.deliveriesCompleted += 1;
				if (deliveryResult.deliveryMode === "dry-run") {
					metrics.dryRunDeliveries += 1;
				}
			}

			await options.markProcessed(event.id, options.runId);
			metrics.processedEvents += 1;
		} catch (error) {
			const failureReason = error instanceof Error ? error.message : String(error);
			await options.markFailed(event.id, failureReason);
			metrics.failedEvents += 1;
		}
	}

	if (metrics.dryRunDeliveries > 0) {
		warnings.push("Email provider not configured; alert deliveries ran in dry-run mode.");
	}

	return {
		metrics,
		warnings,
		failureReason: metrics.failedEvents > 0 ? `${metrics.failedEvents} alert event deliveries failed.` : null
	};
}
