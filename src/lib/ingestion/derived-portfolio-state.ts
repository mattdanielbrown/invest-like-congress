import type { NormalizedTransaction, PositionStatus, VerificationStatus } from "@/lib/domain/types";

export interface DerivedHoldingSnapshotInput {
	memberId: string;
	assetId: string;
	sharesHeld: number;
	averageCostBasisPerShare: number;
	status: PositionStatus;
	verificationStatus: VerificationStatus;
}

export interface DerivedRealizedProfitEventInput {
	memberId: string;
	assetId: string;
	sourceTransactionId: string;
	realizedProfitLoss: number;
}

export interface DerivedPositionStateEventInput {
	sourceTransactionId: string;
	positionStatus: PositionStatus;
}

export interface DerivedPositionChangeEventInput {
	memberId: string;
	assetId: string;
	action: "position-opened" | "position-increased" | "position-partially-sold" | "position-closed";
	shareDelta: number;
	realizedProfitLoss: number | null;
	sourceTransactionId: string;
}

export interface DerivedPortfolioState {
	holdingSnapshots: DerivedHoldingSnapshotInput[];
	realizedProfitEvents: DerivedRealizedProfitEventInput[];
	positionStateEvents: DerivedPositionStateEventInput[];
	positionChangeEvents: DerivedPositionChangeEventInput[];
}

interface PositionLot {
	shares: number;
	costBasisPerShare: number;
}

interface EstimatedTrade {
	shares: number;
	pricePerShare: number;
}

function toPositiveNumber(value: number | null): number | null {
	if (value === null) {
		return null;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}

	return parsed;
}

function toMidpointAmount(transaction: NormalizedTransaction): number | null {
	const minimumAmount = toPositiveNumber(transaction.totalAmountMin);
	const maximumAmount = toPositiveNumber(transaction.totalAmountMax);
	if (!minimumAmount && !maximumAmount) {
		return null;
	}
	if (minimumAmount && maximumAmount) {
		return (minimumAmount + maximumAmount) / 2;
	}
	return minimumAmount ?? maximumAmount;
}

function estimateTrade(transaction: NormalizedTransaction): EstimatedTrade | null {
	let shares = toPositiveNumber(transaction.shareQuantity);
	let pricePerShare = toPositiveNumber(transaction.pricePerShare);
	const midpointAmount = toMidpointAmount(transaction);

	if (!shares && midpointAmount && pricePerShare) {
		shares = midpointAmount / pricePerShare;
	}
	if (!shares && midpointAmount) {
		shares = 1;
	}
	if (!pricePerShare && midpointAmount) {
		pricePerShare = midpointAmount / (shares ?? 1);
	}
	if (!shares || !pricePerShare) {
		return null;
	}

	return {
		shares,
		pricePerShare
	};
}

function getPositionChangeAction(
	action: NormalizedTransaction["action"],
	sharesBefore: number,
	sharesAfter: number
): DerivedPositionChangeEventInput["action"] {
	if (action === "buy") {
		return sharesBefore <= 0 ? "position-opened" : "position-increased";
	}
	return sharesAfter <= 0 ? "position-closed" : "position-partially-sold";
}

function sortTransactions(transactions: NormalizedTransaction[]): NormalizedTransaction[] {
	return [...transactions]
		.filter((transaction) => transaction.verificationStatus === "verified")
		.sort((left, right) => {
			const memberOrder = left.memberId.localeCompare(right.memberId);
			if (memberOrder !== 0) {
				return memberOrder;
			}

			const assetOrder = left.assetId.localeCompare(right.assetId);
			if (assetOrder !== 0) {
				return assetOrder;
			}

			const tradeDateOrder = new Date(left.tradeDate).getTime() - new Date(right.tradeDate).getTime();
			if (tradeDateOrder !== 0) {
				return tradeDateOrder;
			}

			return left.id.localeCompare(right.id);
		});
}

export function derivePortfolioStateFromTransactions(transactions: NormalizedTransaction[]): DerivedPortfolioState {
	const orderedTransactions = sortTransactions(transactions);
	const transactionsByPair = new Map<string, NormalizedTransaction[]>();

	for (const transaction of orderedTransactions) {
		const pairKey = `${transaction.memberId}:${transaction.assetId}`;
		const currentPairTransactions = transactionsByPair.get(pairKey) ?? [];
		currentPairTransactions.push(transaction);
		transactionsByPair.set(pairKey, currentPairTransactions);
	}

	const holdingSnapshots: DerivedHoldingSnapshotInput[] = [];
	const realizedProfitEvents: DerivedRealizedProfitEventInput[] = [];
	const positionStateEvents: DerivedPositionStateEventInput[] = [];
	const positionChangeEvents: DerivedPositionChangeEventInput[] = [];

	for (const [pairKey, pairTransactions] of transactionsByPair.entries()) {
		const [memberId, assetId] = pairKey.split(":");
		const lots: PositionLot[] = [];
		let sharesBefore = 0;

		for (const transaction of pairTransactions) {
			const estimatedTrade = estimateTrade(transaction);
			if (!estimatedTrade) {
				continue;
			}

			const tradeShares = estimatedTrade.shares;
			const tradePrice = estimatedTrade.pricePerShare;
			let realizedProfitLoss: number | null = null;

			if (transaction.action === "buy") {
				lots.push({
					shares: tradeShares,
					costBasisPerShare: tradePrice
				});
			} else {
				let sharesToSell = tradeShares;
				let realizedForTransaction = 0;

				while (sharesToSell > 0 && lots.length > 0) {
					const earliestLot = lots[0];
					const lotSharesToSell = Math.min(earliestLot.shares, sharesToSell);
					realizedForTransaction += lotSharesToSell * (tradePrice - earliestLot.costBasisPerShare);
					earliestLot.shares -= lotSharesToSell;
					sharesToSell -= lotSharesToSell;

					if (earliestLot.shares <= 0.000001) {
						lots.shift();
					}
				}

				realizedProfitLoss = realizedForTransaction;
				realizedProfitEvents.push({
					memberId,
					assetId,
					sourceTransactionId: transaction.id,
					realizedProfitLoss: realizedForTransaction
				});
			}

			const sharesAfter = lots.reduce((sum, lot) => sum + lot.shares, 0);
			positionStateEvents.push({
				sourceTransactionId: transaction.id,
				positionStatus: sharesAfter > 0.000001 ? "open" : "closed"
			});
			positionChangeEvents.push({
				memberId,
				assetId,
				action: getPositionChangeAction(transaction.action, sharesBefore, sharesAfter),
				shareDelta: transaction.action === "buy" ? tradeShares : -tradeShares,
				realizedProfitLoss,
				sourceTransactionId: transaction.id
			});

			sharesBefore = sharesAfter;
		}

		const sharesHeld = lots.reduce((sum, lot) => sum + lot.shares, 0);
		const totalCostBasis = lots.reduce((sum, lot) => sum + lot.shares * lot.costBasisPerShare, 0);
		holdingSnapshots.push({
			memberId,
			assetId,
			sharesHeld,
			averageCostBasisPerShare: sharesHeld > 0.000001 ? totalCostBasis / sharesHeld : 0,
			status: sharesHeld > 0.000001 ? "open" : "closed",
			verificationStatus: "verified"
		});
	}

	return {
		holdingSnapshots,
		realizedProfitEvents,
		positionStateEvents,
		positionChangeEvents
	};
}
