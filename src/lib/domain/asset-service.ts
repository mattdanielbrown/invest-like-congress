import { getAssetActivity } from "@/lib/db/repository";

export async function getAssetActivityById(assetId: string) {
	return getAssetActivity(assetId);
}
