import { DataTable } from "@/components/data-table";
import { FilterForm } from "@/components/filter-form";
import { getMembersWithHoldings } from "@/lib/domain/member-service";
import type { MemberQueryFilters } from "@/lib/db/schema-types";

interface HomePageProps {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const sortByValue = resolvedSearchParams?.sortBy;
	const sortDirectionValue = resolvedSearchParams?.sortDirection;
	const filters: MemberQueryFilters = {
		chamber: typeof resolvedSearchParams?.chamber === "string" ? resolvedSearchParams.chamber : undefined,
		party: typeof resolvedSearchParams?.party === "string" ? resolvedSearchParams.party : undefined,
		stateCode: typeof resolvedSearchParams?.stateCode === "string" ? resolvedSearchParams.stateCode : undefined,
		sortBy: sortByValue === "date" || sortByValue === "shares" || sortByValue === "profit_loss" || sortByValue === "co_holder_count"
			? sortByValue
			: "date",
		sortDirection: sortDirectionValue === "asc" || sortDirectionValue === "desc" ? sortDirectionValue : "desc"
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
