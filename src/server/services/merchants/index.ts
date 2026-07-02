import { all, now, one, run } from "@/server/db";
import { AppError } from "@/server/http/api";
import { generateRsaKeyPair, verifyRsaSha256 } from "@/server/utils/crypto";
import type { AppEnv } from "@/shared/types/env";

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

export interface Merchant {
  callback: string | null;
  createdAt: number;
  id: string;
  name: string;
  publicKey: string;
  status: string;
  type: string;
  updatedAt: number;
}

function merchant(row: MerchantRow): Merchant {
  return {
    callback: row.callback,
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    status: row.status,
    type: row.type,
    updatedAt: row.updated_at,
  };
}

export async function listMerchants(env: AppEnv) {
  return (await all<MerchantRow>(env, "SELECT * FROM merchants ORDER BY created_at DESC")).map(merchant);
}

export async function getMerchant(env: AppEnv, id: string) {
  const row = await one<MerchantRow>(env, "SELECT * FROM merchants WHERE id = ?", id);
  if (!row) throw new AppError(404, "merchant_not_found", "Merchant is not found");
  return merchant(row);
}

export async function saveMerchant(env: AppEnv, input: { callback?: string; id?: string; name: string; status?: string; type?: string }) {
  const time = now();
  const name = input.name.trim();
  const type = input.type === "telegram" ? "telegram" : "website";
  const callback = input.callback?.trim() || null;
  const status = input.status === "paused" ? "paused" : "active";
  if (!name) throw new AppError(400, "merchant_name_missing", "Merchant name is required");
  if (input.id) {
    const row = await one<MerchantRow>(env, "UPDATE merchants SET type = ?, name = ?, callback = ?, status = ?, updated_at = ? WHERE id = ? RETURNING *", type, name, callback, status, time, input.id);
    if (!row) throw new AppError(404, "merchant_not_found", "Merchant is not found");
    return { merchant: merchant(row) };
  }
  const id = crypto.randomUUID();
  const pair = await generateRsaKeyPair();
  const row = await one<MerchantRow>(env, "INSERT INTO merchants(id, type, name, public_key, callback, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?) RETURNING *", id, type, name, pair.publicKeyPem, callback, status, time, time);
  if (!row) throw new AppError(500, "merchant_create_failed", "Merchant create failed");
  return { merchant: merchant(row), privateKey: pair.privateKeyPem };
}

export async function rotateMerchantKey(env: AppEnv, id: string) {
  const pair = await generateRsaKeyPair();
  const row = await one<MerchantRow>(env, "UPDATE merchants SET public_key = ?, updated_at = ? WHERE id = ? RETURNING *", pair.publicKeyPem, now(), id);
  if (!row) throw new AppError(404, "merchant_not_found", "Merchant is not found");
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
  if (!merchantId) throw new AppError(401, "merchant_id_missing", "X-Merchant-Id is missing");
  if (!signature) throw new AppError(401, "signature_missing", "X-Signature is missing");
  if (!timestamp) throw new AppError(401, "timestamp_missing", "X-Timestamp is missing");
  const unix = Number(timestamp);
  if (!Number.isFinite(unix) || Math.abs(Math.floor(Date.now() / 1000) - unix) > 300) {
    throw new AppError(401, "timestamp_invalid", "X-Timestamp is invalid");
  }
  const merchant = await getMerchant(env, merchantId);
  if (merchant.status !== "active") throw new AppError(401, "merchant_disabled", "Merchant is disabled");
  if (!merchant.publicKey.trim()) throw new AppError(401, "merchant_public_key_missing", "Merchant public key is missing");
  const url = new URL(request.url);
  const signedPayload = [request.method.toUpperCase(), `${url.pathname}${url.search}`, timestamp, body].join("\n");
  if (!await verifyRsaSha256(merchant.publicKey, signature, signedPayload)) {
    throw new AppError(401, "signature_invalid", "Signature is invalid");
  }
  return merchant;
}
