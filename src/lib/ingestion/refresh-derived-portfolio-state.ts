import {
	listVerifiedTransactionsForDerivedState,
	replaceDerivedPortfolioState
} from "@/lib/db/repository";
import { derivePortfolioStateFromTransactions } from "@/lib/ingestion/derived-portfolio-state";

export async function refreshDerivedPortfolioState() {
	const transactions = await listVerifiedTransactionsForDerivedState();
	const derivedState = derivePortfolioStateFromTransactions(transactions);
	await replaceDerivedPortfolioState(derivedState);

	return {
		verifiedTransactions: transactions.length,
		holdingSnapshots: derivedState.holdingSnapshots.length,
		realizedProfitEvents: derivedState.realizedProfitEvents.length,
		positionStateEvents: derivedState.positionStateEvents.length,
		positionChangeEvents: derivedState.positionChangeEvents.length
	};
}
