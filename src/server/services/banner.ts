import { getConfigBlob, setConfig } from "@/server/db";
import type { AppEnv } from "@/shared/types/env";

export async function ensureDefaultBanner(env: AppEnv, requestUrl: string) {
  const existing = await getConfigBlob(env, "banner");
  if (existing && existing.byteLength > 0) return new Uint8Array(existing);
  const banner = await readDefaultBanner(env, requestUrl);
  await setConfig(env, "banner", "webp", banner.buffer);
  return banner;
}

export async function saveBanner(env: AppEnv, banner: ArrayBuffer) {
  await setConfig(env, "banner", "webp", banner);
}

export async function restoreDefaultBanner(env: AppEnv, requestUrl: string) {
  const banner = await readDefaultBanner(env, requestUrl);
  await setConfig(env, "banner", "webp", banner.buffer);
  return banner;
}

async function readDefaultBanner(env: AppEnv, requestUrl: string) {
  if (!env.ASSETS) throw new Error("ASSETS binding is not configured");
  const assetUrl = new URL("/default-banner.webp", requestUrl);
  const response = await env.ASSETS.fetch(assetUrl);
  if (!response.ok) throw new Error("Default banner asset is missing");
  return new Uint8Array(await response.arrayBuffer());
}
