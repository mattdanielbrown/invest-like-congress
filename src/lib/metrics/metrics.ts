export interface MetricPoint {
	name: string;
	value: number;
	timestamp: string;
	tags?: Record<string, string>;
}

export function emitMetric(point: MetricPoint) {
	console.info("[metric]", point);
}
