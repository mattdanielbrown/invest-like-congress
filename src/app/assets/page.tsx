import Link from "next/link";
import { DatabaseSetupRequired } from "@/components/database-setup-required";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";
import { getAssetsWithActivity } from "@/lib/domain/asset-service";

export const dynamic = "force-dynamic";

function formatDateCell(value: string | null): string {
	if (!value) {
		return "n/a";
	}
	return value.includes("T") ? value.slice(0, 10) : value;
}

export default async function AssetsPage() {
	let rows;
	try {
		rows = await getAssetsWithActivity();
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return (
				<DatabaseSetupRequired
					title="Database setup required"
					description="Asset activity cannot be loaded until the database is configured."
				/>
			);
		}
		throw error;
	}

	return (
		<section>
			<h2>Assets</h2>
			<p>Browse assets with verified congressional activity.</p>
			{rows.length === 0 ? (
				<p>No assets with verified activity found.</p>
			) : (
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Asset</th>
								<th>Ticker</th>
								<th>Holders</th>
								<th>Buyers</th>
								<th>Sellers</th>
								<th>Latest Activity</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.asset.id}>
									<td>
										<Link href={`/assets/${row.asset.id}`}>{row.asset.displayName}</Link>
									</td>
									<td>{row.asset.tickerSymbol ?? "unresolved"}</td>
									<td>{row.holderCount}</td>
									<td>{row.buyerCount}</td>
									<td>{row.sellerCount}</td>
									<td>{formatDateCell(row.latestActivityAt)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
