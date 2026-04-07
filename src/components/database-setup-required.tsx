interface DatabaseSetupRequiredProps {
	title: string;
	description: string;
}

export function DatabaseSetupRequired({ title, description }: DatabaseSetupRequiredProps) {
	return (
		<section>
			<h2>{title}</h2>
			<p>{description}</p>
			<p>
				Configure <code>DATABASE_URL</code>, run <code>npm run db:setup</code>, and run ingestion to load verified records.
			</p>
		</section>
	);
}
