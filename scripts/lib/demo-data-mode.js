export function shouldApplyDeterministicFallback(options) {
	return options.ingestionFailed || options.verifiedTransactionCount === 0;
}

export function resolveDemoDataMode(options) {
	return resolveDemoDataModeFromStatusSignals({
		verifiedTransactions: options.verifiedTransactionCount,
		demoSeedTransactions: options.fallbackApplied ? options.verifiedTransactionCount : 0,
		officialTransactions: options.fallbackApplied ? 0 : options.verifiedTransactionCount,
		latestIngestionRunSuccess: options.fallbackApplied ? false : true,
		latestIngestionExtractedTransactions: options.fallbackApplied ? 0 : null
	});
}

export function resolveDemoDataModeFromStatusSignals(options) {
	if (options.verifiedTransactions === 0) {
		return "empty";
	}
	if (options.demoSeedTransactions > 0 && options.officialTransactions === 0) {
		return "deterministic-fallback";
	}
	if (options.demoSeedTransactions > 0 && options.officialTransactions > 0) {
		return "mixed";
	}
	if (options.officialTransactions > 0) {
		return "official-ingestion";
	}
	if (options.latestIngestionRunSuccess === false || options.latestIngestionExtractedTransactions === 0) {
		return "deterministic-fallback";
	}
	return "official-ingestion";
}
