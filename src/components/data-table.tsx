import Link from "next/link";
import type { MemberHoldingsRow } from "@/lib/domain/types";
import { formatTimestampUtc } from "@/lib/presentation/date-format";

interface DataTableProps {
	rows: MemberHoldingsRow[];
}

export function DataTable({ rows }: DataTableProps) {
	return (
		<div className="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Member</th>
						<th>Chamber</th>
						<th>State</th>
						<th>Open Holdings</th>
						<th>Realized P/L</th>
						<th>Unrealized P/L</th>
						<th>Last Verified</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.member.id}>
							<td>
								<Link href={`/members/${row.member.id}`}>{row.member.fullName}</Link>
							</td>
							<td>{row.member.chamber}</td>
							<td>{row.member.stateCode}</td>
							<td>{row.holdingsCount}</td>
							<td>${row.realizedProfitLossTotal.toFixed(2)}</td>
							<td>${row.unrealizedProfitLossTotal.toFixed(2)}</td>
							<td>{formatTimestampUtc(row.lastVerifiedUpdateAt)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
