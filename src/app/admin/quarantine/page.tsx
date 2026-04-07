import { listQuarantinedTransactions } from "@/lib/db/repository";

export default async function QuarantinePage() {
	const rows = await listQuarantinedTransactions(200);

	return (
		<section>
			<h2>Quarantine Queue</h2>
			<p>Only verified records are publicly exposed. Rows below require manual review and are withheld.</p>
			{rows.length === 0 ? (
				<p>No quarantined rows at this time.</p>
			) : (
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Transaction ID</th>
								<th>Reason</th>
								<th>Created</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.id}>
									<td>{row.id}</td>
									<td className="notice-danger">{row.reason}</td>
									<td>{new Date(row.createdAt).toLocaleString()}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
