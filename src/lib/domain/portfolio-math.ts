import type { NormalizedTransaction } from "@/lib/domain/types";

export interface PortfolioComputationResult {
	remainingShares: number;
	realizedProfitLoss: number;
	averageCostBasisPerShare: number;
}

interface Lot {
	shares: number;
	costBasisPerShare: number;
}

export function computePortfolioFromTransactions(transactions: NormalizedTransaction[]): PortfolioComputationResult {
	const orderedTransactions = [...transactions]
		.filter((transaction) => transaction.verificationStatus === "verified")
		.sort((left, right) => new Date(left.tradeDate).getTime() - new Date(right.tradeDate).getTime());

	const lots: Lot[] = [];
	let realizedProfitLoss = 0;

	for (const transaction of orderedTransactions) {
		const shares = Number(transaction.shareQuantity ?? 0);
		const price = Number(transaction.pricePerShare ?? 0);
		if (shares <= 0 || price <= 0) {
			continue;
		}

		if (transaction.action === "buy") {
			lots.push({
				shares,
				costBasisPerShare: price
			});
			continue;
		}

		let remainingToSell = shares;
		while (remainingToSell > 0 && lots.length > 0) {
			const currentLot = lots[0];
			const lotSharesToSell = Math.min(currentLot.shares, remainingToSell);
			realizedProfitLoss += lotSharesToSell * (price - currentLot.costBasisPerShare);
			currentLot.shares -= lotSharesToSell;
			remainingToSell -= lotSharesToSell;

			if (currentLot.shares <= 0) {
				lots.shift();
			}
		}
	}

	const remainingShares = lots.reduce((sum, lot) => sum + lot.shares, 0);
	const totalCostBasis = lots.reduce((sum, lot) => sum + lot.shares * lot.costBasisPerShare, 0);

	return {
		remainingShares,
		realizedProfitLoss,
		averageCostBasisPerShare: remainingShares > 0 ? totalCostBasis / remainingShares : 0
	};
}

export function computeUnrealizedProfitLoss(remainingShares: number, averageCostBasisPerShare: number, marketPricePerShare: number | null): number | null {
	if (marketPricePerShare === null || remainingShares <= 0) {
		return null;
	}

	return remainingShares * (marketPricePerShare - averageCostBasisPerShare);
}
