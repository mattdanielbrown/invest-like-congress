import { getAssetActivity, listAssetsWithActivity } from "@/lib/db/repository";

export async function getAssetActivityById(assetId: string) {
	return getAssetActivity(assetId);
}

export async function getAssetsWithActivity() {
	return listAssetsWithActivity();
}
