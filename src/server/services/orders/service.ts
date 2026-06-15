import { db, jsonParseObject, now } from "@/server/db";
import { AppError } from "@/server/http/api-error";
import { createApiKey, sha256Hex } from "@/server/services/crypto";
import { getDriver, snapshotMatchesTx } from "@/server/services/payments/drivers";
import { fetchTronCandidates, parseSubmittedTxCandidates } from "@/server/services/payments/tron";
import type { AppEnv } from "@/shared/types/env";
import type { OrderStatus, PaymentSnapshot, PaymentTxEvidence } from "@/shared/types/domain";

export interface MerchantRow {
  api_key_hash: string;
  api_key_prefix: string;
  callback_url: string | null;
  created_at: number;
  id: string;
  name: string;
  status: string;
  updated_at: number;
}

export interface PaymentRow {
  created_at: number;
  driver: string;
  enabled: number;
  fields_json: string;
  id: number;
  name: string;
  updated_at: number;
}

export interface OrderRow {
  amount: number;
  callback_url: string | null;
  created_at: number;
  currency: string;
  customer_ref: string | null;
  expire_at: number;
  id: string;
  merchant_id: string;
  merchant_order_no: string;
  paid_at: number | null;
  payment: string;
  payway: number | null;
  redirect_url: string | null;
  source: string;
  status: OrderStatus;
  updated_at: number;
}

export function publicOrder(row: OrderRow) {
  return {
    ...row,
    payment: jsonParseObject(row.payment, {}),
  };
}

export async function listPayments(env: AppEnv) {
  const result = await db(env).prepare("SELECT * FROM payments ORDER BY id DESC").all<PaymentRow>();
  return (result.results ?? []).map((row) => ({
    ...row,
    enabled: Boolean(row.enabled),
    fields: jsonParseObject(row.fields_json, {}),
  }));
}

export async function getPayment(env: AppEnv, id: number) {
  const row = await db(env).prepare("SELECT * FROM payments WHERE id = ?").bind(id).first<PaymentRow>();
  if (!row) throw new AppError(404, "payment_not_found", "Payment is not found");
  return row;
}

export async function savePayment(env: AppEnv, input: { driver: string; enabled?: boolean; fields: Record<string, string>; id?: number; name: string }) {
  const driver = getDriver(input.driver);
  const ts = now();
  const name = input.name.trim() || driver.meta.name;
  if (input.id) {
    await db(env)
      .prepare("UPDATE payments SET driver = ?, name = ?, enabled = ?, fields_json = ?, updated_at = ? WHERE id = ?")
      .bind(input.driver, name, input.enabled === false ? 0 : 1, JSON.stringify(input.fields ?? {}), ts, input.id)
      .run();
    return getPayment(env, input.id);
  }
  const result = await db(env)
    .prepare("INSERT INTO payments(driver, name, enabled, fields_json, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)")
    .bind(input.driver, name, input.enabled === false ? 0 : 1, JSON.stringify(input.fields ?? {}), ts, ts)
    .run();
  return getPayment(env, Number(result.meta.last_row_id));
}

export async function deletePayment(env: AppEnv, id: number) {
  await db(env).prepare("DELETE FROM payments WHERE id = ?").bind(id).run();
}

export async function listMerchants(env: AppEnv) {
  const result = await db(env).prepare("SELECT * FROM merchants ORDER BY created_at DESC").all<MerchantRow>();
  return result.results ?? [];
}

export async function saveMerchant(env: AppEnv, input: { callbackUrl?: string; id?: string; name: string; status?: string }) {
  const ts = now();
  const name = input.name.trim();
  if (!name) throw new AppError(400, "merchant_name_missing", "Merchant name is required");
  if (input.id) {
    await db(env)
      .prepare("UPDATE merchants SET name = ?, callback_url = ?, status = ?, updated_at = ? WHERE id = ?")
      .bind(name, input.callbackUrl?.trim() || null, input.status || "active", ts, input.id)
      .run();
    return { apiKey: null, merchant: await getMerchant(env, input.id) };
  }
  const apiKey = createApiKey();
  const id = crypto.randomUUID();
  await db(env)
    .prepare("INSERT INTO merchants(id, name, api_key_hash, api_key_prefix, callback_url, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, name, await sha256Hex(apiKey), apiKey.slice(0, 10), input.callbackUrl?.trim() || null, input.status || "active", ts, ts)
    .run();
  return { apiKey, merchant: await getMerchant(env, id) };
}

export async function getMerchant(env: AppEnv, id: string) {
  const row = await db(env).prepare("SELECT * FROM merchants WHERE id = ?").bind(id).first<MerchantRow>();
  if (!row) throw new AppError(404, "merchant_not_found", "Merchant is not found");
  return row;
}

export async function getMerchantByApiKey(env: AppEnv, apiKey: string) {
  const hash = await sha256Hex(apiKey.trim());
  const row = await db(env).prepare("SELECT * FROM merchants WHERE api_key_hash = ? AND status = 'active'").bind(hash).first<MerchantRow>();
  if (!row) throw new AppError(401, "api_key_invalid", "API key is invalid");
  return row;
}

export async function deleteMerchant(env: AppEnv, id: string) {
  await db(env).prepare("DELETE FROM merchants WHERE id = ?").bind(id).run();
}

export async function createMerchantOrder(env: AppEnv, apiKey: string, input: Record<string, unknown>) {
  const merchant = await getMerchantByApiKey(env, apiKey);
  const merchantOrderNo = String(input.merchant_order_no ?? "").trim();
  const amount = Number(input.amount);
  if (!merchantOrderNo) throw new AppError(400, "merchant_order_no_missing", "merchant_order_no is required");
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, "amount_invalid", "Amount is invalid");
  const existing = await db(env)
    .prepare("SELECT * FROM orders WHERE merchant_id = ? AND merchant_order_no = ?")
    .bind(merchant.id, merchantOrderNo)
    .first<OrderRow>();
  if (existing) return { order: existing, reused: true };
  const ts = now();
  const order: OrderRow = {
    amount,
    callback_url: String(input.callback_url ?? merchant.callback_url ?? "").trim() || null,
    created_at: ts,
    currency: String(input.currency ?? "USD").trim().toUpperCase(),
    customer_ref: String(input.customer_ref ?? "").trim() || null,
    expire_at: ts + 1800,
    id: crypto.randomUUID(),
    merchant_id: merchant.id,
    merchant_order_no: merchantOrderNo,
    paid_at: null,
    payment: "{}",
    payway: null,
    redirect_url: String(input.redirect_url ?? "").trim() || null,
    source: "merchant_api",
    status: "pending",
    updated_at: ts,
  };
  await db(env)
    .prepare("INSERT INTO orders(id, merchant_id, merchant_order_no, source, status, amount, currency, payment, callback_url, redirect_url, customer_ref, expire_at, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(order.id, order.merchant_id, order.merchant_order_no, order.source, order.status, order.amount, order.currency, order.payment, order.callback_url, order.redirect_url, order.customer_ref, order.expire_at, order.created_at, order.updated_at)
    .run();
  return { order, reused: false };
}

export async function getOrder(env: AppEnv, id: string) {
  const row = await db(env).prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
  if (!row) throw new AppError(404, "order_not_found", "Order is not found");
  return row;
}

export async function listOrders(env: AppEnv, status = "all", limit = 100) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const result =
    status && status !== "all"
      ? await db(env).prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?").bind(status, normalizedLimit).all<OrderRow>()
      : await db(env).prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?").bind(normalizedLimit).all<OrderRow>();
  return (result.results ?? []).map(publicOrder);
}

export async function checkoutData(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  const merchant = await getMerchant(env, order.merchant_id);
  const payments = (await listPayments(env)).filter((item) => item.enabled);
  const options = payments.flatMap((payment) =>
    getDriver(payment.driver).quote(
      { driver: payment.driver, fields: payment.fields as Record<string, string>, id: payment.id, name: payment.name },
      order.amount,
      order.currency,
    ).map((option) => ({ ...option, name: payment.name, driver: payment.driver })),
  );
  return { merchant: { id: merchant.id, name: merchant.name }, options, order: publicOrder(order) };
}

export async function selectOrderPayment(env: AppEnv, orderId: string, payway: number, currency: string) {
  const order = await getOrder(env, orderId);
  if (order.status !== "pending" || now() > order.expire_at) throw new AppError(400, "order_unavailable", "Order is unavailable");
  const payment = await getPayment(env, payway);
  if (!payment.enabled) throw new AppError(400, "payment_disabled", "Payment is disabled");
  const fields = jsonParseObject<Record<string, string>>(payment.fields_json, {});
  const snapshot = getDriver(payment.driver).assign(
    { driver: payment.driver, fields, id: payment.id, name: payment.name },
    order.amount,
    order.currency,
    currency,
  );
  await db(env)
    .prepare("UPDATE orders SET payway = ?, payment = ?, updated_at = ? WHERE id = ?")
    .bind(payway, JSON.stringify(snapshot), now(), orderId)
    .run();
  return snapshot;
}

export async function markOrderPaid(env: AppEnv, order: OrderRow, tx: PaymentTxEvidence) {
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  if (!snapshotMatchesTx(snapshot, tx, order.created_at, order.expire_at)) {
    throw new AppError(400, "tx_not_matched", "Transaction does not match order");
  }
  const paidPayment = { ...snapshot, tx };
  const ts = now();
  await db(env)
    .prepare("UPDATE orders SET status = 'paid', payment = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(JSON.stringify(paidPayment), ts, ts, order.id)
    .run();
  await createNotify(env, order.id);
  return paidPayment;
}

export async function submitTxCandidates(env: AppEnv, orderId: string, input: unknown) {
  const order = await getOrder(env, orderId);
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  for (const candidate of parseSubmittedTxCandidates(input)) {
    if (snapshotMatchesTx(snapshot, candidate, order.created_at, order.expire_at)) {
      return markOrderPaid(env, order, candidate);
    }
  }
  throw new AppError(400, "tx_not_found", "No matching transaction is found");
}

export async function checkOrderPayment(env: AppEnv, orderId: string, confirmedBy: PaymentTxEvidence["confirmedBy"]) {
  const order = await getOrder(env, orderId);
  if (order.status !== "pending") return jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  if (!snapshot.driver) throw new AppError(400, "payment_not_selected", "Payment is not selected");
  if (snapshot.network !== "tron") throw new AppError(400, "auto_check_unavailable", "Auto check is unavailable for this payment");
  const candidates = await fetchTronCandidates(snapshot, order.created_at);
  for (const candidate of candidates) {
    candidate.confirmedBy = confirmedBy;
    if (snapshotMatchesTx(snapshot, candidate, order.created_at, order.expire_at)) {
      return markOrderPaid(env, order, candidate);
    }
  }
  throw new AppError(404, "tx_not_found", "No matching transaction is found");
}

export async function manualConfirmOrder(env: AppEnv, orderId: string, input: Record<string, unknown>) {
  const order = await getOrder(env, orderId);
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  if (!snapshot.driver) throw new AppError(400, "payment_not_selected", "Payment is not selected");
  return markOrderPaid(env, order, {
    amount: Number(input.amount ?? snapshot.amount),
    confirmedBy: "admin",
    currency: String(input.currency ?? snapshot.currency),
    from: typeof input.from === "string" ? input.from : undefined,
    hash: String(input.hash ?? `manual-${crypto.randomUUID()}`),
    raw: input,
    timestamp: Number(input.timestamp ?? now()),
    to: typeof input.to === "string" ? input.to : snapshot.address,
  });
}

export async function expireOrders(env: AppEnv) {
  await db(env)
    .prepare("UPDATE orders SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expire_at < ?")
    .bind(now(), now())
    .run();
}

export async function createNotify(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  if (!order.callback_url) return null;
  const payload = {
    amount: order.amount,
    currency: order.currency,
    merchant_order_no: order.merchant_order_no,
    order_id: order.id,
    payment: jsonParseObject(order.payment, {}),
    status: order.status,
  };
  const ts = now();
  const result = await db(env)
    .prepare("INSERT INTO notify(order_id, status, attempts, next_run_at, payload_json, created_at, updated_at) VALUES(?, 'pending', 0, ?, ?, ?, ?)")
    .bind(orderId, ts, JSON.stringify(payload), ts, ts)
    .run();
  await env.QUEUE_NOTIFY?.send({ notifyId: Number(result.meta.last_row_id) });
  return Number(result.meta.last_row_id);
}

export async function pendingTronOrders(env: AppEnv) {
  const result = await db(env)
    .prepare("SELECT * FROM orders WHERE status = 'pending' AND payment <> '{}' ORDER BY created_at ASC LIMIT 20")
    .all<OrderRow>();
  return (result.results ?? []).filter((order) => jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot).network === "tron");
}
