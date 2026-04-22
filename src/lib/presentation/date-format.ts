export function formatTimestampUtc(value: string | null): string {
	if (!value) {
		return "n/a";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
