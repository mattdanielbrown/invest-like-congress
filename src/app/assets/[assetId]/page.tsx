import { DatabaseSetupRequired } from "@/components/database-setup-required";
import { getAssetActivityById } from "@/lib/domain/asset-service";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";
import { formatTimestampUtc } from "@/lib/presentation/date-format";

export const dynamic = "force-dynamic";

interface AssetDetailPageProps {
	params: Promise<{
		assetId: string;
	}>;
}

export default async function AssetDetailPage({ params }: AssetDetailPageProps) {
	const { assetId } = await params;
	let row;
	try {
		row = await getAssetActivityById(assetId);
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return (
				<DatabaseSetupRequired
					title="Database setup required"
					description="Asset activity cannot be loaded until a Postgres database is configured."
				/>
			);
		}
		throw error;
	}
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
					<dd>{formatTimestampUtc(row.latestActivityAt)}</dd>
				</dl>
			</article>
		</section>
	);
}
