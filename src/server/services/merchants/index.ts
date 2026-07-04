import { all, now, one, run } from "@/server/db";
import { AppError } from "@/server/http/api";
import { generateRsaKeyPair, verifyRsaSha256 } from "@/server/utils/crypto";
import { normalizeCallbackUrl } from "@/server/utils/url";
import type { Merchant as ApiMerchant } from "@/shared/types/api";
import type { AppEnv } from "@/server/types/env";

interface MerchantRow {
  callback: string | null;
  created_at: number;
  id: string;
  name: string;
  public_key: string;
  status: string;
  type: string;
  updated_at: number;
}

export type Merchant = ApiMerchant;

function merchant(row: MerchantRow): Merchant {
  return {
    callback: row.callback,
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    status: row.status as Merchant["status"],
    type: row.type as Merchant["type"],
    updatedAt: row.updated_at,
  };
}

export async function listMerchants(env: AppEnv) {
  return (await all<MerchantRow>(env, "SELECT * FROM merchants ORDER BY created_at DESC")).map(merchant);
}

export async function getMerchant(env: AppEnv, id: string) {
  const row = await one<MerchantRow>(env, "SELECT * FROM merchants WHERE id = ?", id);
  if (!row) throw new AppError(404, "errors.merchant_not_found");
  return merchant(row);
}

export async function saveMerchant(env: AppEnv, input: { callback?: string; id?: string; name: string; status?: string; type?: string }) {
  const time = now();
  const name = input.name.trim();
  const type = input.type === "telegram" ? "telegram" : "website";
  const callback = normalizeCallbackUrl(input.callback);
  const status = input.status === "disabled" ? "disabled" : "enabled";
  if (!name) throw new AppError(400, "errors.merchant_name_missing");
  if (input.id) {
    const row = await one<MerchantRow>(env, "UPDATE merchants SET type = ?, name = ?, callback = ?, status = ?, updated_at = ? WHERE id = ? RETURNING *", type, name, callback, status, time, input.id);
    if (!row) throw new AppError(404, "errors.merchant_not_found");
    return { merchant: merchant(row) };
  }
  const id = crypto.randomUUID();
  const pair = await generateRsaKeyPair();
  const row = await one<MerchantRow>(env, "INSERT INTO merchants(id, type, name, public_key, callback, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?) RETURNING *", id, type, name, pair.publicKeyPem, callback, status, time, time);
  if (!row) throw new AppError(500, "errors.merchant_create_failed");
  return { merchant: merchant(row), privateKey: pair.privateKeyPem };
}

export async function rotateMerchantKey(env: AppEnv, id: string) {
  const pair = await generateRsaKeyPair();
  const row = await one<MerchantRow>(env, "UPDATE merchants SET public_key = ?, updated_at = ? WHERE id = ? RETURNING *", pair.publicKeyPem, now(), id);
  if (!row) throw new AppError(404, "errors.merchant_not_found");
  return { merchant: merchant(row), privateKey: pair.privateKeyPem };
}

export async function deleteMerchant(env: AppEnv, id: string) {
  await run(env, "DELETE FROM merchants WHERE id = ?", id);
}

export async function requireSignedMerchant(
  env: AppEnv,
  request: { header(name: string): string | undefined; method: string; url: string },
  body: string,
) {
  const merchantId = request.header("x-merchant-id")?.trim();
  const signature = request.header("x-signature")?.trim();
  const timestamp = request.header("x-timestamp")?.trim();
  if (!merchantId) throw new AppError(401, "errors.merchant_id_missing");
  if (!signature) throw new AppError(401, "errors.signature_missing");
  if (!timestamp) throw new AppError(401, "errors.timestamp_missing");
  const unix = Number(timestamp);
  if (!Number.isFinite(unix) || Math.abs(Math.floor(Date.now() / 1000) - unix) > 300) {
    throw new AppError(401, "errors.timestamp_invalid");
  }
  const merchant = await getMerchant(env, merchantId);
  if (merchant.status !== "enabled") throw new AppError(401, "errors.merchant_disabled");
  if (!merchant.publicKey.trim()) throw new AppError(401, "errors.merchant_public_key_missing");
  const url = new URL(request.url);
  const signedPayload = [request.method.toUpperCase(), `${url.pathname}${url.search}`, timestamp, body].join("\n");
  if (!await verifyRsaSha256(merchant.publicKey, signature, signedPayload)) {
    throw new AppError(401, "errors.signature_invalid");
  }
  return merchant;
}
