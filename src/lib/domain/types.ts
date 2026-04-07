export type Chamber = "house" | "senate";
export type TransactionAction = "buy" | "sell";
export type PositionStatus = "open" | "closed";
export type VerificationStatus = "verified" | "quarantined";

export interface Member {
	id: string;
	fullName: string;
	party: string;
	stateCode: string;
	chamber: Chamber;
}

export interface Asset {
	id: string;
	displayName: string;
	tickerSymbol: string | null;
	assetType: string;
	isSymbolResolved: boolean;
}

export interface FilingDocument {
	id: string;
	sourceSystem: string;
	sourceDocumentId: string;
	documentUrl: string;
	filedAt: string;
	publishedAt: string | null;
	verificationStatus: VerificationStatus;
	ingestionChecksum: string;
}

export interface SourceAttribution {
	id: string;
	entityType: string;
	entityId: string;
	fieldName: string;
	filingDocumentId: string;
	sourceText: string;
}

export interface NormalizedTransaction {
	id: string;
	memberId: string;
	assetId: string;
	action: TransactionAction;
	tradeDate: string;
	filingDate: string;
	shareQuantity: number | null;
	pricePerShare: number | null;
	totalAmountMin: number | null;
	totalAmountMax: number | null;
	filingDocumentId: string;
	verificationStatus: VerificationStatus;
	isNewPosition: boolean;
}

export interface PositionLot {
	id: string;
	memberId: string;
	assetId: string;
	sourceTransactionId: string;
	openedAt: string;
	remainingShares: number;
	costBasisPerShare: number;
}

export interface HoldingSnapshot {
	id: string;
	memberId: string;
	assetId: string;
	sharesHeld: number;
	averageCostBasisPerShare: number;
	lastMarketPrice: number | null;
	unrealizedProfitLoss: number | null;
	status: PositionStatus;
	verifiedUpdatedAt: string;
}

export interface TransactionWithPresentation {
	transaction: NormalizedTransaction;
	asset: Asset;
	realizedProfitLoss: number | null;
	positionStatusAfterTransaction: PositionStatus;
}

export interface MemberHoldingsRow {
	member: Member;
	holdingsCount: number;
	realizedProfitLossTotal: number;
	unrealizedProfitLossTotal: number;
	lastVerifiedUpdateAt: string;
}

export interface AssetActivityRow {
	asset: Asset;
	holderCount: number;
	buyerCount: number;
	sellerCount: number;
	openPositionCount: number;
	closedPositionCount: number;
	latestActivityAt: string | null;
}

export interface SubscriptionPreference {
	memberIds: string[];
	assetIds: string[];
}

export interface AlertSubscription {
	id: string;
	emailAddress: string;
	isVerified: boolean;
	verificationToken: string;
	unsubscribedAt: string | null;
	preference: SubscriptionPreference;
	createdAt: string;
}

export interface PositionChangeEvent {
	id: string;
	memberId: string;
	assetId: string;
	action: "position-opened" | "position-increased" | "position-partially-sold" | "position-closed";
	shareDelta: number;
	realizedProfitLoss: number | null;
	createdAt: string;
	sourceTransactionId: string;
}
