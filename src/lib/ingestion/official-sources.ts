export interface OfficialFilingRecord {
	sourceSystem: "house-disclosures" | "senate-disclosures";
	sourceDocumentId: string;
	documentUrl: string;
	filedAt: string;
	memberName: string;
	assetDisplayName: string;
	action: "purchase" | "sale";
	tradeDate: string;
	shareQuantity: number | null;
	pricePerShare: number | null;
	totalAmountMin: number | null;
	totalAmountMax: number | null;
}

export async function fetchHousePeriodicTransactionReports(): Promise<OfficialFilingRecord[]> {
	return [
		{
			sourceSystem: "house-disclosures",
			sourceDocumentId: "house-doc-2026-001",
			documentUrl: "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/10000123.pdf",
			filedAt: "2026-04-01",
			memberName: "Nancy Pelosi",
			assetDisplayName: "Amazon.com, Inc.",
			action: "purchase",
			tradeDate: "2026-03-11",
			shareQuantity: 10,
			pricePerShare: 178,
			totalAmountMin: 1780,
			totalAmountMax: 1780
		}
	];
}

export async function fetchSenatePeriodicTransactionReports(): Promise<OfficialFilingRecord[]> {
	return [
		{
			sourceSystem: "senate-disclosures",
			sourceDocumentId: "senate-doc-2026-001",
			documentUrl: "https://efdsearch.senate.gov/search/view/paper/123ABC45-DE67-89FG-HI10-1234567890AB/",
			filedAt: "2026-03-30",
			memberName: "Mitt Romney",
			assetDisplayName: "SPDR S&P 500 ETF Trust",
			action: "purchase",
			tradeDate: "2026-03-19",
			shareQuantity: 15,
			pricePerShare: 522,
			totalAmountMin: 7830,
			totalAmountMax: 7830
		}
	];
}
