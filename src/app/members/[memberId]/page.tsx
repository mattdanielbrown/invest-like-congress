import { DatabaseSetupRequired } from "@/components/database-setup-required";
import Link from "next/link";
import { getMemberPortfolioSummaryById, getMemberTransactions } from "@/lib/domain/member-service";
import { isDatabaseNotConfiguredError } from "@/lib/db/errors";

interface MemberDetailPageProps {
	params: Promise<{
		memberId: string;
	}>;
}

function formatTextCell(value: unknown): string {
	if (value === null || value === undefined) {
		return "n/a";
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	return String(value);
}

function formatDateCell(value: unknown): string {
	if (!value) {
		return "n/a";
	}
	if (value instanceof Date) {
		return value.toISOString().slice(0, 10);
	}
	if (typeof value === "string") {
		return value.includes("T") ? value.slice(0, 10) : value;
	}
	return String(value);
}

function formatNumberCell(value: unknown): string {
	if (value === null || value === undefined || value === "") {
		return "n/a";
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? value.toFixed(2) : "n/a";
	}
	const parsed = Number(value);
	if (Number.isFinite(parsed)) {
		return parsed.toFixed(2);
	}
	return String(value);
}

export default async function MemberDetailPage({ params }: MemberDetailPageProps) {
	const { memberId } = await params;
	let transactions;
	let summary;
	try {
		[transactions, summary] = await Promise.all([
			getMemberTransactions(memberId),
			getMemberPortfolioSummaryById(memberId)
		]);
	} catch (error) {
		if (isDatabaseNotConfiguredError(error)) {
			return (
				<DatabaseSetupRequired
					title="Database setup required"
					description="Member transaction history is unavailable until the database is configured."
				/>
			);
		}
		throw error;
	}

	return (
		<section>
			<h2>Member Portfolio and Transactions</h2>
			<p>
				Viewing verified transaction history for <strong>{formatTextCell(memberId)}</strong>.
			</p>
			<article>
				<h3>All-Time Portfolio Summary While in Office</h3>
				<dl>
					<dt>All-Time Total Return While in Office (Realized + Unrealized)</dt>
					<dd>${summary.cumulativeReturnTotal.toFixed(2)}</dd>
					<dt>All-Time Realized Profit/Loss While in Office</dt>
					<dd>${summary.realizedProfitLossTotal.toFixed(2)}</dd>
					<dt>Current Unrealized Profit/Loss on Remaining Holdings</dt>
					<dd>${summary.unrealizedProfitLossTotal.toFixed(2)}</dd>
					<dt>Combined Value of Currently Held Assets (Purchased While in Office)</dt>
					<dd>${summary.currentHeldAssetsValue.toFixed(2)}</dd>
				</dl>
			</article>
			{summary.openPositions.length > 0 ? (
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Currently Held Asset</th>
								<th>Remaining Held Shares</th>
								<th>Avg Cost Basis</th>
								<th>Last Market Price</th>
								<th>Current Position Value</th>
								<th>Unrealized P/L</th>
							</tr>
						</thead>
						<tbody>
							{summary.openPositions.map((position) => (
								<tr key={position.asset.id}>
									<td>
										<Link href={`/assets/${position.asset.id}`}>{formatTextCell(position.asset.displayName)}</Link>
									</td>
									<td>{position.remainingShares.toFixed(2)}</td>
									<td>${position.averageCostBasisPerShare.toFixed(2)}</td>
									<td>{position.lastMarketPrice === null ? "n/a" : `$${position.lastMarketPrice.toFixed(2)}`}</td>
									<td>${position.currentPositionValue.toFixed(2)}</td>
									<td>${position.unrealizedProfitLoss.toFixed(2)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p>No open positions currently held.</p>
			)}
			{transactions.length === 0 ? (
				<p>No verified transactions found for this member.</p>
			) : (
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Trade Date</th>
								<th>Asset</th>
								<th>Action</th>
								<th>Shares</th>
								<th>Price/Share</th>
								<th>Realized Profit/Loss on Sell</th>
								<th>Status After Trade</th>
							</tr>
						</thead>
						<tbody>
							{transactions.map((row) => (
								<tr key={row.transaction.id}>
									<td>{formatDateCell(row.transaction.tradeDate)}</td>
									<td>
										<Link href={`/assets/${row.asset.id}`}>{formatTextCell(row.asset.displayName)}</Link>
									</td>
									<td>{formatTextCell(row.transaction.action)}</td>
									<td>{formatNumberCell(row.transaction.shareQuantity)}</td>
									<td>{formatNumberCell(row.transaction.pricePerShare)}</td>
									<td>{formatNumberCell(row.realizedProfitLoss)}</td>
									<td>{formatTextCell(row.positionStatusAfterTransaction)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
