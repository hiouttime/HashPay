import { all, jsonParseObject, now, one, run } from "@/server/db";
import { AppError } from "@/server/http/api";
import { getOrder, listPendingPaymentOrders } from "@/server/services/orders/repository";
import type { AppEnv } from "@/shared/types/env";

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
  const result = await run(env, "INSERT INTO notify(order_id, status, attempts, next_run_at, payload_json, created_at, updated_at) VALUES(?, 'pending', 0, ?, ?, ?, ?)", orderId, ts, JSON.stringify(payload), ts, ts);
  await env.QUEUE_NOTIFY?.send({ notifyId: Number(result.meta.last_row_id) });
  return Number(result.meta.last_row_id);
}

export async function resendOrderNotify(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  if (order.status !== "paid") throw new AppError(400, "order_not_paid", "Order is not paid");
  if (!order.callback) throw new AppError(400, "callback_missing", "Callback is missing");
  return { notifyId: await createNotify(env, orderId) };
}

export async function expireOrders(env: AppEnv) {
  await run(env, "UPDATE orders SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expire_at < ?", now(), now());
}

export async function pendingTronOrders(env: AppEnv) {
  return (await listPendingPaymentOrders(env)).filter((order) => jsonParseObject<{ network?: string }>(order.payment, {}).network === "trc20");
}

export async function dueNotifyIds(env: AppEnv) {
  return (await all<{ id: number }>(env, "SELECT id FROM notify WHERE status IN ('pending', 'retry') AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT 20", now())).map((item) => item.id);
}

export async function deliverNotify(env: AppEnv, id: number) {
  const row = await one<{ attempts: number; callback: string | null; payload_json: string; status: string }>(
    env,
    `
      SELECT n.*, o.callback
      FROM notify n
      JOIN orders o ON o.id = n.order_id
      WHERE n.id = ?
      `,
    id,
  );
  if (!row || row.status === "done") return;
  if (!row.callback) {
    await run(env, "UPDATE notify SET status = 'done', updated_at = ? WHERE id = ?", now(), id);
    return;
  }
  const response = await fetch(row.callback, {
    body: row.payload_json,
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const attempts = row.attempts + 1;
    const failed = attempts >= 8;
    await run(env, "UPDATE notify SET status = ?, attempts = ?, next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?", failed ? "failed" : "retry", attempts, now() + attempts * 60, `HTTP ${response.status}`, now(), id);
    throw new Error(`notify ${id} failed`);
  }
  await run(env, "UPDATE notify SET status = 'done', attempts = attempts + 1, updated_at = ? WHERE id = ?", now(), id);
}
