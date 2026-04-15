import test from "node:test";
import assert from "node:assert/strict";
import { resolveDemoDataMode, shouldApplyDeterministicFallback } from "../../scripts/lib/demo-data-mode.js";

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
