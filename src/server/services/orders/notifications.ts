import { jsonParseObject, now, one, run } from "@/server/db";
import { AppError } from "@/server/http/api";
import { getOrder } from "@/server/services/orders/repository";
import { encryptCallbackEnvelope } from "@/server/utils/crypto";
import type { AppEnv } from "@/server/types/env";

export async function createNotify(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  if (!order.callback) return null;
  const payload = {
    amount: order.amount,
    currency: order.currency,
    merchantNo: order.merchantNo,
    orderId: order.id,
    payment: jsonParseObject(order.payment, {}),
    status: order.status,
  };
  const ts = now();
  const result = await run(env, "INSERT INTO notify(order_id, status, attempts, next_run_at, payload_json, created_at, updated_at) VALUES(?, 'pending', 0, ?, ?, ?, ?)", orderId, ts + 60, JSON.stringify(payload), ts, ts);
  await env.QUEUE_NOTIFY?.send({ notifyId: Number(result.meta.last_row_id) });
  return Number(result.meta.last_row_id);
}

export async function resendNotify(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  if (order.status !== "paid") throw new AppError(400, "errors.order_not_paid");
  if (!order.callback) throw new AppError(400, "errors.callback_missing");
  return { notifyId: await createNotify(env, orderId) };
}

export async function deliverNotify(env: AppEnv, notifyId: number) {
  const notify = await one<{ attempts: number; callback: string | null; merchant: string; payload_json: string; publicKey: string | null }>(
    env,
    `
      SELECT n.*, o.callback, o.merchant, m.public_key AS publicKey
      FROM notify n
      JOIN orders o ON o.id = n.order_id
      LEFT JOIN merchants m ON m.id = o.merchant
      WHERE n.id = ? AND n.status IN ('pending', 'retry')
      `,
    notifyId,
  );
  if (!notify) return;
  if (!notify.callback) {
    await run(env, "UPDATE notify SET status = 'done', updated_at = ? WHERE id = ?", now(), notifyId);
    return;
  }
  if (!notify.publicKey?.trim()) {
    await recordFailure(env, notifyId, notify.attempts, "Merchant public key is missing");
    return;
  }
  const error = await deliveryError(notify.callback, notify.payload_json, notify.merchant, notify.publicKey);
  if (error) {
    await recordFailure(env, notifyId, notify.attempts, error);
    return;
  }
  await run(env, "UPDATE notify SET status = 'done', attempts = attempts + 1, updated_at = ? WHERE id = ?", now(), notifyId);
}

async function deliveryError(callback: string, payload: string, merchant: string, publicKey: string) {
  try {
    const timestamp = String(now());
    const body = JSON.stringify(await encryptCallbackEnvelope(publicKey, JSON.stringify({
      payload: jsonParseObject(payload, {}),
      timestamp: Number(timestamp),
    })));
    const response = await fetch(callback, {
      body,
      headers: {
        "content-type": "application/json",
        "x-hashpay-encryption": "RSA-OAEP-256+A256GCM",
        "x-hashpay-merchant": merchant,
        "x-hashpay-timestamp": timestamp,
      },
      method: "POST",
    });
    return response.ok ? null : `HTTP ${response.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : "Notify request failed";
  }
}

async function recordFailure(env: AppEnv, notifyId: number, attemptCount: number, error: string) {
  const attempts = attemptCount + 1;
  const failed = attempts >= 8;
  const ts = now();
  await run(env, "UPDATE notify SET status = ?, attempts = ?, next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?", failed ? "failed" : "retry", attempts, ts + attempts * 60, error, ts, notifyId);
}
