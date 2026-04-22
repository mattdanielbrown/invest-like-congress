export function isAdminSurfaceEnabled(): boolean {
	return process.env.ADMIN_SURFACES_ENABLED === "1" || process.env.ADMIN_SURFACES_ENABLED === "true";
}
