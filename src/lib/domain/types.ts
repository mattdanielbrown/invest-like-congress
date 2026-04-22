export type Chamber = "house" | "senate";
export type TransactionAction = "buy" | "sell";
export type PositionStatus = "open" | "closed";
export type VerificationStatus = "verified" | "quarantined";
export type ExtractionMode = "html" | "pdf-text" | "metadata";

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
	rawCachePath: string | null;
	rawFetchedAt: string | null;
	rawContentHash: string | null;
	complianceMode: string | null;
}

export interface SourceAttribution {
	id: string;
	entityType: string;
	entityId: string;
	fieldName: string;
	fieldValue: string | null;
	filingDocumentId: string;
	sourceText: string;
	sourceLocation: string | null;
	extractorVersion: string;
	confidence: number;
}

export interface ProvenanceFieldSummary {
	fieldName: string;
	fieldValue: string | null;
	sourceText: string;
	sourceLocation: string | null;
	confidence: number;
}

export interface NormalizedTransaction {
	id: string;
	sourceTransactionKey: string;
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
	parserConfidence: number;
	extractionMode: ExtractionMode;
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
	filingSource: {
		sourceSystem: string;
		sourceDocumentId: string;
		documentUrl: string;
	};
	provenanceFields: ProvenanceFieldSummary[];
}

export interface MemberHoldingsRow {
	member: Member;
	holdingsCount: number;
	realizedProfitLossTotal: number;
	unrealizedProfitLossTotal: number;
	lastVerifiedUpdateAt: string;
}

export interface MemberOpenPositionRow {
	asset: Asset;
	remainingShares: number;
	averageCostBasisPerShare: number;
	lastMarketPrice: number | null;
	unrealizedProfitLoss: number;
	currentPositionValue: number;
}

export interface MemberPortfolioSummary {
	member: Member;
	memberId: string;
	realizedProfitLossTotal: number;
	unrealizedProfitLossTotal: number;
	cumulativeReturnTotal: number;
	currentHeldAssetsValue: number;
	openPositions: MemberOpenPositionRow[];
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
	processingStartedAt?: string | null;
	processingRunId?: string | null;
	deliveryAttemptCount?: number;
	lastDeliveryError?: string | null;
}

export interface ParsedTransactionCandidate {
	assetDisplayName: string;
	tickerSymbol: string | null;
	action: TransactionAction;
	tradeDate: string;
	shareQuantity: number | null;
	pricePerShare: number | null;
	totalAmountMin: number | null;
	totalAmountMax: number | null;
	ownershipType: string | null;
	comment: string | null;
	provenanceFields: ProvenanceFieldSummary[];
	parserConfidence: number;
	extractionMode: ExtractionMode;
	parseIssue?: string | null;
}

export interface IngestionCheckpoint {
	sourceSystem: string;
	cursorKey: string;
	lastSeenFiledAt: string | null;
	lastRunAt: string | null;
}

export interface IngestionRunSummary {
	runId: string;
	mode: "backfill" | "hourly";
	sourceSystem: string;
	cursorKey: string;
	fromYear: number;
	toYear: number;
	startedAt: string;
	finishedAt: string | null;
	success: boolean;
	failureReason: string | null;
	fetchedDocuments: number;
	parsedDocuments: number;
	quarantinedDocuments: number;
	extractedTransactions: number;
	provenanceCoverageRatio: number;
	warnings: string[];
}

export type WorkerName = "pricing-refresh" | "alerts";

export interface WorkerRunSummary {
	runId: string;
	workerName: WorkerName;
	startedAt: string;
	finishedAt: string;
	success: boolean;
	failureReason: string | null;
	metrics: Record<string, unknown>;
	warnings: string[];
}
