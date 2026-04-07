import { DataTable } from "@/components/data-table";
import { FilterForm } from "@/components/filter-form";
import { getMembersWithHoldings } from "@/lib/domain/member-service";

interface HomePageProps {
	searchParams?: Record<string, string | string[] | undefined>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
	const filters = {
		chamber: typeof searchParams?.chamber === "string" ? searchParams.chamber : undefined,
		party: typeof searchParams?.party === "string" ? searchParams.party : undefined,
		stateCode: typeof searchParams?.stateCode === "string" ? searchParams.stateCode : undefined,
		sortBy: typeof searchParams?.sortBy === "string" ? searchParams.sortBy : "date",
		sortDirection: typeof searchParams?.sortDirection === "string" ? searchParams.sortDirection : "desc"
	};

	const rows = await getMembersWithHoldings(filters);

	return (
		<>
			<section>
				<h2>Member Holdings</h2>
				<p>
					Browse verified congressional disclosures across Senate and House members. Results are designed for sorting and filtering
					by chamber, party, location, and portfolio profit/loss metrics.
				</p>
				<FilterForm current={filters} />
			</section>
			<section>
				<DataTable rows={rows} />
			</section>
		</>
	);
}
