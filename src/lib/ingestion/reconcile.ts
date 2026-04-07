import { computePortfolioFromTransactions } from "@/lib/domain/portfolio-math";
import type { NormalizedTransaction } from "@/lib/domain/types";

export interface ReconciledHolding {
	memberId: string;
	assetId: string;
	sharesHeld: number;
	averageCostBasisPerShare: number;
	realizedProfitLoss: number;
}

export function reconcileHoldings(transactions: NormalizedTransaction[]): ReconciledHolding[] {
	const transactionsByPair = new Map<string, NormalizedTransaction[]>();

	for (const transaction of transactions) {
		const key = `${transaction.memberId}:${transaction.assetId}`;
		const currentTransactions = transactionsByPair.get(key) ?? [];
		currentTransactions.push(transaction);
		transactionsByPair.set(key, currentTransactions);
	}

	const rows: ReconciledHolding[] = [];
	for (const [key, pairTransactions] of transactionsByPair.entries()) {
		const [memberId, assetId] = key.split(":");
		const computed = computePortfolioFromTransactions(pairTransactions);
		rows.push({
			memberId,
			assetId,
			sharesHeld: computed.remainingShares,
			averageCostBasisPerShare: computed.averageCostBasisPerShare,
			realizedProfitLoss: computed.realizedProfitLoss
		});
	}

	return rows;
}
