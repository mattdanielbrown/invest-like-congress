import test from "node:test";
import assert from "node:assert/strict";
import {
	resolveDemoDataMode,
	resolveDemoDataModeFromStatusSignals,
	shouldApplyDeterministicFallback
} from "../../scripts/lib/demo-data-mode.js";

test("fallback is required when ingestion fails even if transactions exist", () => {
	assert.equal(shouldApplyDeterministicFallback({
		ingestionFailed: true,
		verifiedTransactionCount: 12
	}), true);
});

test("fallback is required when ingestion succeeds but verified transactions are zero", () => {
	assert.equal(shouldApplyDeterministicFallback({
		ingestionFailed: false,
		verifiedTransactionCount: 0
	}), true);
});

test("fallback is skipped when ingestion succeeds with verified transactions", () => {
	assert.equal(shouldApplyDeterministicFallback({
		ingestionFailed: false,
		verifiedTransactionCount: 7
	}), false);
});

test("demo mode resolves to deterministic fallback when fallback is applied", () => {
	assert.equal(resolveDemoDataMode({
		fallbackApplied: true,
		verifiedTransactionCount: 3
	}), "deterministic-fallback");
});

test("demo mode resolves to official ingestion when fallback is not applied and data exists", () => {
	assert.equal(resolveDemoDataMode({
		fallbackApplied: false,
		verifiedTransactionCount: 3
	}), "official-ingestion");
});

test("demo mode resolves to empty when no verified transactions remain", () => {
	assert.equal(resolveDemoDataMode({
		fallbackApplied: false,
		verifiedTransactionCount: 0
	}), "empty");
});

test("status-signal resolver returns deterministic fallback when only seeded data exists", () => {
	assert.equal(resolveDemoDataModeFromStatusSignals({
		verifiedTransactions: 3,
		demoSeedTransactions: 3,
		officialTransactions: 0,
		latestIngestionRunSuccess: true,
		latestIngestionExtractedTransactions: 0
	}), "deterministic-fallback");
});

test("status-signal resolver returns official ingestion when only official data exists", () => {
	assert.equal(resolveDemoDataModeFromStatusSignals({
		verifiedTransactions: 3,
		demoSeedTransactions: 0,
		officialTransactions: 3,
		latestIngestionRunSuccess: true,
		latestIngestionExtractedTransactions: 3
	}), "official-ingestion");
});

test("status-signal resolver returns mixed when seeded and official data co-exist", () => {
	assert.equal(resolveDemoDataModeFromStatusSignals({
		verifiedTransactions: 6,
		demoSeedTransactions: 2,
		officialTransactions: 4,
		latestIngestionRunSuccess: true,
		latestIngestionExtractedTransactions: 4
	}), "mixed");
});

test("status-signal resolver returns empty when verified transaction count is zero", () => {
	assert.equal(resolveDemoDataModeFromStatusSignals({
		verifiedTransactions: 0,
		demoSeedTransactions: 0,
		officialTransactions: 0,
		latestIngestionRunSuccess: true,
		latestIngestionExtractedTransactions: 0
	}), "empty");
});
