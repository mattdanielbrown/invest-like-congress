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
	const maxRetries = options.maxRetries ?? 3;
	const retryDelayMs = options.retryDelayMs ?? 800;

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

		await sleep(retryDelayMs * (attempt + 1));
	}

	throw new Error(`Failed to fetch ${url} after retries.`);
}

export async function rateLimitPause(): Promise<void> {
	await sleep(300);
}
