export function shouldApplyDeterministicFallback(options) {
	return options.ingestionFailed || options.verifiedTransactionCount === 0;
}

export function resolveDemoDataMode(options) {
	if (options.verifiedTransactionCount === 0) {
		return "empty";
	}
	if (options.fallbackApplied) {
		return "deterministic-fallback";
	}
	return "official-ingestion";
}
