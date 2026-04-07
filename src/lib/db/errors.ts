export class DatabaseNotConfiguredError extends Error {
	code: string;

	constructor(message = "Database is not configured. Set DATABASE_URL and run migrations.") {
		super(message);
		this.name = "DatabaseNotConfiguredError";
		this.code = "database_not_configured";
	}
}

export function isDatabaseNotConfiguredError(error: unknown): error is DatabaseNotConfiguredError {
	return error instanceof DatabaseNotConfiguredError
		|| (typeof error === "object"
			&& error !== null
			&& "code" in error
			&& (error as { code?: string }).code === "database_not_configured");
}
