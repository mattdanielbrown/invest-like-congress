import test from "node:test";
import assert from "node:assert/strict";
import { derivePortfolioStateFromTransactions } from "../../src/lib/ingestion/derived-portfolio-state.ts";

test("derivePortfolioStateFromTransactions builds holdings and change events idempotently from verified transactions", () => {
	const derivedState = derivePortfolioStateFromTransactions([
		{
			id: "txn-1",
			sourceTransactionKey: "source-1",
			memberId: "member-1",
			assetId: "asset-1",
			action: "buy",
			tradeDate: "2026-03-01",
			filingDate: "2026-03-05",
			shareQuantity: 10,
			pricePerShare: 100,
			totalAmountMin: 1000,
			totalAmountMax: 1000,
			filingDocumentId: "filing-1",
			verificationStatus: "verified",
			isNewPosition: true,
			parserConfidence: 0.98,
			extractionMode: "html"
		},
		{
			id: "txn-2",
			sourceTransactionKey: "source-2",
			memberId: "member-1",
			assetId: "asset-1",
			action: "sell",
			tradeDate: "2026-03-10",
			filingDate: "2026-03-12",
			shareQuantity: null,
			pricePerShare: 120,
			totalAmountMin: 600,
			totalAmountMax: 600,
			filingDocumentId: "filing-2",
			verificationStatus: "verified",
			isNewPosition: false,
			parserConfidence: 0.95,
			extractionMode: "pdf-text"
		},
		{
			id: "txn-3",
			sourceTransactionKey: "source-3",
			memberId: "member-1",
			assetId: "asset-1",
			action: "buy",
			tradeDate: "2026-03-15",
			filingDate: "2026-03-17",
			shareQuantity: 2,
			pricePerShare: 150,
			totalAmountMin: 300,
			totalAmountMax: 300,
			filingDocumentId: "filing-3",
			verificationStatus: "quarantined",
			isNewPosition: false,
			parserConfidence: 0.2,
			extractionMode: "metadata"
		}
	]);

	assert.deepEqual(derivedState.holdingSnapshots, [
		{
			memberId: "member-1",
			assetId: "asset-1",
			sharesHeld: 5,
			averageCostBasisPerShare: 100,
			status: "open",
			verificationStatus: "verified"
		}
	]);
	assert.deepEqual(derivedState.realizedProfitEvents, [
		{
			memberId: "member-1",
			assetId: "asset-1",
			sourceTransactionId: "txn-2",
			realizedProfitLoss: 100
		}
	]);
	assert.deepEqual(derivedState.positionStateEvents, [
		{
			sourceTransactionId: "txn-1",
			positionStatus: "open"
		},
		{
			sourceTransactionId: "txn-2",
			positionStatus: "open"
		}
	]);
	assert.deepEqual(derivedState.positionChangeEvents, [
		{
			memberId: "member-1",
			assetId: "asset-1",
			action: "position-opened",
			shareDelta: 10,
			realizedProfitLoss: null,
			sourceTransactionId: "txn-1"
		},
		{
			memberId: "member-1",
			assetId: "asset-1",
			action: "position-partially-sold",
			shareDelta: -5,
			realizedProfitLoss: 100,
			sourceTransactionId: "txn-2"
		}
	]);
});
