import Link from "next/link";
import { getMemberTransactions } from "@/lib/domain/member-service";

interface MemberDetailPageProps {
	params: Promise<{
		memberId: string;
	}>;
}

export default async function MemberDetailPage({ params }: MemberDetailPageProps) {
	const { memberId } = await params;
	const transactions = await getMemberTransactions(memberId);

	return (
		<section>
			<h2>Member Transactions</h2>
			<p>
				Viewing verified transaction history for <strong>{memberId}</strong>.
			</p>
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
								<th>Realized P/L</th>
								<th>Status After Trade</th>
							</tr>
						</thead>
						<tbody>
							{transactions.map((row) => (
								<tr key={row.transaction.id}>
									<td>{row.transaction.tradeDate}</td>
									<td>
										<Link href={`/assets/${row.asset.id}`}>{row.asset.displayName}</Link>
									</td>
									<td>{row.transaction.action}</td>
									<td>{row.transaction.shareQuantity ?? "n/a"}</td>
									<td>{row.transaction.pricePerShare ?? "n/a"}</td>
									<td>{row.realizedProfitLoss ?? "n/a"}</td>
									<td>{row.positionStatusAfterTransaction}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
