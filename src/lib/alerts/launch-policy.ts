export type AlertsLaunchState = "deferred";

export interface AlertsLaunchPolicy {
	launchState: AlertsLaunchState;
	deliveryMode: "deferred";
	mvpStatus: "deferred-from-launch";
	subscriptionsApiEnabled: boolean;
	workerDispatchEnabled: boolean;
	message: string;
}

export const alertsLaunchPolicy: AlertsLaunchPolicy = {
	launchState: "deferred",
	deliveryMode: "deferred",
	mvpStatus: "deferred-from-launch",
	subscriptionsApiEnabled: false,
	workerDispatchEnabled: false,
	message: "Alert delivery is deferred from launch until provider-backed delivery is implemented and validated."
};
