interface FilterFormProps {
	current: {
		chamber?: string;
		party?: string;
		stateCode?: string;
		sortBy?: string;
		sortDirection?: string;
	};
}

export function FilterForm({ current }: FilterFormProps) {
	return (
		<form className="filter-form" method="get">
			<label>
				<span>Chamber</span>
				<select name="chamber" defaultValue={current.chamber ?? ""}>
					<option value="">All</option>
					<option value="house">House</option>
					<option value="senate">Senate</option>
				</select>
			</label>
			<label>
				<span>Party</span>
				<select name="party" defaultValue={current.party ?? ""}>
					<option value="">All</option>
					<option value="D">Democrat</option>
					<option value="R">Republican</option>
					<option value="I">Independent</option>
				</select>
			</label>
			<label>
				<span>State</span>
				<input name="stateCode" defaultValue={current.stateCode ?? ""} maxLength={2} />
			</label>
			<label>
				<span>Sort By</span>
				<select name="sortBy" defaultValue={current.sortBy ?? "date"}>
					<option value="date">Date</option>
					<option value="shares">Shares</option>
					<option value="profit_loss">Profit/Loss</option>
					<option value="co_holder_count">Co-holder Count</option>
				</select>
			</label>
			<label>
				<span>Direction</span>
				<select name="sortDirection" defaultValue={current.sortDirection ?? "desc"}>
					<option value="desc">Descending</option>
					<option value="asc">Ascending</option>
				</select>
			</label>
			<button type="submit">Apply</button>
		</form>
	);
}
