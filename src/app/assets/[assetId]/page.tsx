import { getAssetActivityById } from "@/lib/domain/asset-service";

interface AssetDetailPageProps {
	params: Promise<{
		assetId: string;
	}>;
}

export default async function AssetDetailPage({ params }: AssetDetailPageProps) {
	const { assetId } = await params;
	const row = await getAssetActivityById(assetId);
	if (!row) {
		return (
			<section>
				<h2>Asset not found</h2>
				<p>There is no verified activity for this asset ID.</p>
			</section>
		);
	}

	return (
		<section>
			<h2>Asset Activity</h2>
			<article>
				<h3>{row.asset.displayName}</h3>
				<dl>
					<dt>Ticker</dt>
					<dd>{row.asset.tickerSymbol ?? "unresolved"}</dd>
					<dt>Holder Count</dt>
					<dd>{row.holderCount}</dd>
					<dt>Buyer Count</dt>
					<dd>{row.buyerCount}</dd>
					<dt>Seller Count</dt>
					<dd>{row.sellerCount}</dd>
					<dt>Open Positions</dt>
					<dd>{row.openPositionCount}</dd>
					<dt>Closed Positions</dt>
					<dd>{row.closedPositionCount}</dd>
					<dt>Latest Activity</dt>
					<dd>{row.latestActivityAt ?? "n/a"}</dd>
				</dl>
			</article>
		</section>
	);
}
