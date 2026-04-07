import { loadServerEnv } from "@/lib/env/server-env";

export interface FetchWithRetryOptions {
	method?: "GET" | "POST";
	headers?: Record<string, string>;
	body?: string;
	maxRetries?: number;
	retryDelayMs?: number;
}

function sleep(delayMs: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, delayMs);
	});
}

export async function fetchWithRetry(url: string, options: FetchWithRetryOptions = {}): Promise<Response> {
	const env = loadServerEnv();
	const maxRetries = options.maxRetries ?? env.ingestionRetryMaxRetries;
	const retryDelayMs = options.retryDelayMs ?? env.ingestionRetryDelayMs;

	for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
		try {
			const response = await fetch(url, {
				method: options.method ?? "GET",
				headers: {
					"User-Agent": env.ingestionUserAgent,
					...(options.headers ?? {})
				},
				body: options.body
			});

			if (response.ok) {
				return response;
			}

			if (response.status >= 400 && response.status < 500 && response.status !== 429) {
				throw new Error(`HTTP ${response.status} for ${url}`);
			}
		} catch (error) {
			if (attempt >= maxRetries) {
				throw error;
			}
		}

		const jitterMs = Math.floor(Math.random() * 100);
		await sleep(retryDelayMs * (attempt + 1) + jitterMs);
	}

	throw new Error(`Failed to fetch ${url} after retries.`);
}

export async function rateLimitPause(): Promise<void> {
	const env = loadServerEnv();
	await sleep(env.ingestionRateLimitPauseMs);
}
