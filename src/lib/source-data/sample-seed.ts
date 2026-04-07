import type {
	AlertSubscription,
	Asset,
	AssetActivityRow,
	HoldingSnapshot,
	Member,
	MemberHoldingsRow,
	NormalizedTransaction,
	PositionChangeEvent
} from "@/lib/domain/types";

const nowIso = new Date().toISOString();

export const sampleMembers: Member[] = [
	{
		id: "member-nancy-pelosi",
		fullName: "Nancy Pelosi",
		party: "D",
		stateCode: "CA",
		chamber: "house"
	},
	{
		id: "member-mitt-romney",
		fullName: "Mitt Romney",
		party: "R",
		stateCode: "UT",
		chamber: "senate"
	}
];

export const sampleAssets: Asset[] = [
	{
		id: "asset-amzn",
		displayName: "Amazon.com, Inc.",
		tickerSymbol: "AMZN",
		assetType: "equity",
		isSymbolResolved: true
	},
	{
		id: "asset-spy",
		displayName: "SPDR S&P 500 ETF Trust",
		tickerSymbol: "SPY",
		assetType: "etf",
		isSymbolResolved: true
	}
];

export const sampleTransactions: NormalizedTransaction[] = [
	{
		id: "txn-1",
		memberId: "member-nancy-pelosi",
		assetId: "asset-amzn",
		action: "buy",
		tradeDate: "2026-03-11",
		filingDate: "2026-03-21",
		shareQuantity: 10,
		pricePerShare: 178,
		totalAmountMin: 1780,
		totalAmountMax: 1780,
		filingDocumentId: "doc-house-001",
		verificationStatus: "verified",
		isNewPosition: true
	},
	{
		id: "txn-2",
		memberId: "member-nancy-pelosi",
		assetId: "asset-amzn",
		action: "sell",
		tradeDate: "2026-03-27",
		filingDate: "2026-04-02",
		shareQuantity: 5,
		pricePerShare: 190,
		totalAmountMin: 950,
		totalAmountMax: 950,
		filingDocumentId: "doc-house-002",
		verificationStatus: "verified",
		isNewPosition: false
	},
	{
		id: "txn-3",
		memberId: "member-mitt-romney",
		assetId: "asset-spy",
		action: "buy",
		tradeDate: "2026-03-19",
		filingDate: "2026-03-30",
		shareQuantity: 15,
		pricePerShare: 522,
		totalAmountMin: 7830,
		totalAmountMax: 7830,
		filingDocumentId: "doc-senate-001",
		verificationStatus: "verified",
		isNewPosition: true
	}
];

export const sampleHoldingSnapshots: HoldingSnapshot[] = [
	{
		id: "holding-1",
		memberId: "member-nancy-pelosi",
		assetId: "asset-amzn",
		sharesHeld: 5,
		averageCostBasisPerShare: 178,
		lastMarketPrice: 196,
		unrealizedProfitLoss: 90,
		status: "open",
		verifiedUpdatedAt: nowIso
	},
	{
		id: "holding-2",
		memberId: "member-mitt-romney",
		assetId: "asset-spy",
		sharesHeld: 15,
		averageCostBasisPerShare: 522,
		lastMarketPrice: 531,
		unrealizedProfitLoss: 135,
		status: "open",
		verifiedUpdatedAt: nowIso
	}
];

export const sampleMemberRows: MemberHoldingsRow[] = [
	{
		member: sampleMembers[0],
		holdingsCount: 1,
		realizedProfitLossTotal: 60,
		unrealizedProfitLossTotal: 90,
		lastVerifiedUpdateAt: nowIso
	},
	{
		member: sampleMembers[1],
		holdingsCount: 1,
		realizedProfitLossTotal: 0,
		unrealizedProfitLossTotal: 135,
		lastVerifiedUpdateAt: nowIso
	}
];

export const sampleAssetActivityRows: AssetActivityRow[] = [
	{
		asset: sampleAssets[0],
		holderCount: 1,
		buyerCount: 1,
		sellerCount: 1,
		openPositionCount: 1,
		closedPositionCount: 0,
		latestActivityAt: "2026-03-27"
	},
	{
		asset: sampleAssets[1],
		holderCount: 1,
		buyerCount: 1,
		sellerCount: 0,
		openPositionCount: 1,
		closedPositionCount: 0,
		latestActivityAt: "2026-03-19"
	}
];

export const sampleAlertSubscriptions: AlertSubscription[] = [];
export const samplePositionChangeEvents: PositionChangeEvent[] = [];

export const sampleStatus = {
	lastIngestionAt: nowIso,
	lastPricingRefreshAt: nowIso,
	nextPricingRefreshAt: nowIso,
	marketSessionState: "open"
};
