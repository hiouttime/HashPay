import { db, jsonParseObject, now } from "@/server/db";
import { AppError } from "@/server/http/api-error";
import { createOrderId, generateRsaKeyPair } from "@/server/services/crypto";
import { getDriver, snapshotMatchesTx, validatePaymentConfig } from "@/server/services/payments/drivers";
import { fetchTronCandidates, parseSubmittedTxCandidates } from "@/server/services/payments/tron";
import { baseCurrency, conversionContext, convertAmount, convertAmountWithContext, fastConfirmEnabled, orderTimeoutMinutes } from "@/server/services/rates";
import type { AppEnv } from "@/shared/types/env";
import type { OrderStatus, PaymentReviewEvidence, PaymentSnapshot, PaymentTxEvidence } from "@/shared/types/domain";

export interface MerchantRow {
  callback_url: string | null;
  created_at: number;
  id: string;
  name: string;
  public_key: string;
  status: string;
  type: string;
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
  description: string | null;
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

type ListedOrderRow = OrderRow & { payway_name?: string | null };

type DetailedOrderRow = ListedOrderRow & { payway_driver?: string | null; payway_enabled?: number | null };

interface NotifyRow {
  attempts: number;
  created_at: number;
  id: number;
  last_error: string | null;
  next_run_at: number;
  order_id: string;
  payload_json: string;
  status: string;
  updated_at: number;
}

export function publicOrder(row: OrderRow) {
  const { callback_url, redirect_url, ...order } = row;
  return {
    ...order,
    payment: jsonParseObject(row.payment, {}),
    return_url: redirect_url,
  };
}

function orderExpireAt(createdAt: number, timeoutMinutes: number) {
  return createdAt + timeoutMinutes * 60;
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
  const driver = validatePaymentConfig({ driver: input.driver, fields: input.fields });
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

export async function saveMerchant(env: AppEnv, input: { callback_url?: string; id?: string; name: string; status?: string; type?: string }) {
  const ts = now();
  const name = input.name.trim();
  const type = input.type === "telegram" ? "telegram" : "website";
  if (!name) throw new AppError(400, "merchant_name_missing", "Merchant name is required");
  if (input.id) {
    await db(env)
      .prepare("UPDATE merchants SET type = ?, name = ?, callback_url = ?, status = ?, updated_at = ? WHERE id = ?")
      .bind(type, name, input.callback_url?.trim() || null, input.status || "active", ts, input.id)
      .run();
    return { merchant: await getMerchant(env, input.id) };
  }
  const id = crypto.randomUUID();
  const pair = await generateRsaKeyPair();
  await db(env)
    .prepare("INSERT INTO merchants(id, type, name, public_key, callback_url, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, type, name, pair.publicKeyPem, input.callback_url?.trim() || null, input.status || "active", ts, ts)
    .run();
  return { merchant: await getMerchant(env, id), private_key: pair.privateKeyPem };
}

export async function getMerchant(env: AppEnv, id: string) {
  const row = await db(env).prepare("SELECT * FROM merchants WHERE id = ?").bind(id).first<MerchantRow>();
  if (!row) throw new AppError(404, "merchant_not_found", "Merchant is not found");
  return row;
}

export async function resetMerchantKey(env: AppEnv, id: string) {
  await getMerchant(env, id);
  const pair = await generateRsaKeyPair();
  await db(env)
    .prepare("UPDATE merchants SET public_key = ?, updated_at = ? WHERE id = ?")
    .bind(pair.publicKeyPem, now(), id)
    .run();
  return { merchant: await getMerchant(env, id), private_key: pair.privateKeyPem };
}

export async function deleteMerchant(env: AppEnv, id: string) {
  await db(env).prepare("DELETE FROM merchants WHERE id = ?").bind(id).run();
}

export async function createMerchantOrder(env: AppEnv, merchant: MerchantRow, input: Record<string, unknown>) {
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
  const currency = String(input.currency ?? await baseCurrency(env)).trim().toUpperCase();
  const timeout = await orderTimeoutMinutes(env);
  const order: OrderRow = {
    amount,
    callback_url: String(input.callback_url ?? merchant.callback_url ?? "").trim() || null,
    created_at: ts,
    currency,
    customer_ref: String(input.customer_ref ?? "").trim() || null,
    description: String(input.description ?? "").trim() || null,
    expire_at: orderExpireAt(ts, timeout),
    id: createOrderId(),
    merchant_id: merchant.id,
    merchant_order_no: merchantOrderNo,
    paid_at: null,
    payment: "{}",
    payway: null,
    redirect_url: String(input.return_url ?? "").trim() || null,
    source: "merchant_api",
    status: "pending",
    updated_at: ts,
  };
  try {
    await db(env)
      .prepare("INSERT INTO orders(id, merchant_id, merchant_order_no, description, source, status, amount, currency, payment, callback_url, redirect_url, customer_ref, expire_at, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(order.id, order.merchant_id, order.merchant_order_no, order.description, order.source, order.status, order.amount, order.currency, order.payment, order.callback_url, order.redirect_url, order.customer_ref, order.expire_at, order.created_at, order.updated_at)
      .run();
  } catch (error) {
    const reused = await db(env)
      .prepare("SELECT * FROM orders WHERE merchant_id = ? AND merchant_order_no = ?")
      .bind(merchant.id, merchantOrderNo)
      .first<OrderRow>();
    if (reused) return { order: reused, reused: true };
    throw error;
  }
  return { order, reused: false };
}

export async function createTelegramOrder(env: AppEnv, input: { amount: number; currency?: string; customerRef?: string; description?: string; orderNo?: string; source: "telegram" | "telegram_inline" }) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, "amount_invalid", "Amount is invalid");
  const merchantOrderNo = String(input.orderNo || "").trim() || `${input.source}-${now()}-${crypto.randomUUID().slice(0, 8)}`;
  const existing = await db(env)
    .prepare("SELECT * FROM orders WHERE merchant_id = ? AND merchant_order_no = ?")
    .bind("INLINE", merchantOrderNo)
    .first<OrderRow>();
  if (existing) return { order: existing, reused: true };
  const ts = now();
  const timeout = await orderTimeoutMinutes(env);
  const order: OrderRow = {
    amount,
    callback_url: null,
    created_at: ts,
    currency: String(input.currency || "USDT").trim().toUpperCase(),
    customer_ref: String(input.customerRef || "").trim() || null,
    description: String(input.description || "").trim() || null,
    expire_at: orderExpireAt(ts, timeout),
    id: createOrderId(),
    merchant_id: "INLINE",
    merchant_order_no: merchantOrderNo,
    paid_at: null,
    payment: "{}",
    payway: null,
    redirect_url: null,
    source: input.source,
    status: "pending",
    updated_at: ts,
  };
  try {
    await db(env)
      .prepare("INSERT INTO orders(id, merchant_id, merchant_order_no, description, source, status, amount, currency, payment, callback_url, redirect_url, customer_ref, expire_at, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(order.id, order.merchant_id, order.merchant_order_no, order.description, order.source, order.status, order.amount, order.currency, order.payment, order.callback_url, order.redirect_url, order.customer_ref, order.expire_at, order.created_at, order.updated_at)
      .run();
  } catch (error) {
    const reused = await db(env)
      .prepare("SELECT * FROM orders WHERE merchant_id = ? AND merchant_order_no = ?")
      .bind("INLINE", merchantOrderNo)
      .first<OrderRow>();
    if (reused) return { order: reused, reused: true };
    throw error;
  }
  return { order, reused: false };
}

export async function getOrder(env: AppEnv, id: string) {
  const row = await db(env).prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
  if (!row) throw new AppError(404, "order_not_found", "Order is not found");
  return row;
}

export async function getOrderDetail(env: AppEnv, id: string) {
  const order = await db(env)
    .prepare("SELECT orders.*, payments.name AS payway_name, payments.driver AS payway_driver, payments.enabled AS payway_enabled FROM orders LEFT JOIN payments ON payments.id = orders.payway WHERE orders.id = ?")
    .bind(id)
    .first<DetailedOrderRow>();
  if (!order) throw new AppError(404, "order_not_found", "Order is not found");
  const [merchant, notify] = await Promise.all([
    order.merchant_id === "INLINE"
      ? Promise.resolve({ id: "INLINE", name: "Telegram 内部商户", type: "internal" })
      : getMerchant(env, order.merchant_id).catch(() => null),
    db(env)
      .prepare("SELECT * FROM notify WHERE order_id = ? ORDER BY created_at DESC LIMIT 20")
      .bind(id)
      .all<NotifyRow>(),
  ]);
  return {
    merchant,
    notify: (notify.results ?? []).map((row) => ({
      ...row,
      payload: jsonParseObject(row.payload_json, {}),
    })),
    order: publicOrder(order),
    payway: order.payway
      ? {
          driver: order.payway_driver,
          enabled: Boolean(order.payway_enabled),
          id: order.payway,
          name: order.payway_name,
        }
      : null,
    rate: orderRateDetail(order),
  };
}

function orderRateDetail(order: OrderRow) {
  const payment = jsonParseObject<Partial<PaymentSnapshot>>(order.payment, {});
  const paymentAmount = Number(payment.amount);
  const paymentCurrency = String(payment.currency || "").toUpperCase();
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || !paymentCurrency) {
    return {
      original_amount: order.amount,
      original_currency: order.currency,
      payment_amount: null,
      payment_currency: null,
      rate: null,
    };
  }
  return {
    original_amount: order.amount,
    original_currency: order.currency,
    payment_amount: paymentAmount,
    payment_currency: paymentCurrency,
    rate: order.currency === paymentCurrency && order.amount === paymentAmount ? 1 : order.amount / paymentAmount,
  };
}

function orderListWhere(input: { q?: string; status?: string }) {
  const status = String(input.status || "all");
  const q = String(input.q || "").trim();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (status !== "all") {
    clauses.push("orders.status = ?");
    params.push(status);
  }
  if (q) {
    const like = `%${q}%`;
    clauses.push("(orders.id LIKE ? OR orders.description LIKE ? OR orders.merchant_order_no LIKE ? OR orders.merchant_id LIKE ? OR orders.customer_ref LIKE ? OR orders.payment LIKE ? OR payments.name LIKE ?)");
    params.push(like, like, like, like, like, like, like);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  return { params, where };
}

export async function listOrders(env: AppEnv, input: { limit?: number; q?: string; status?: string } = {}) {
  const normalizedLimit = Math.min(Math.max(Number(input.limit) || 100, 1), 200);
  const { params, where } = orderListWhere(input);
  const result = await db(env)
    .prepare(`SELECT orders.*, payments.name AS payway_name FROM orders LEFT JOIN payments ON payments.id = orders.payway${where} ORDER BY orders.created_at DESC LIMIT ?`)
    .bind(...params, normalizedLimit)
    .all<ListedOrderRow>();
  return (result.results ?? []).map(publicOrder);
}

export async function listOrdersPage(env: AppEnv, input: { page?: number; pageSize?: number; q?: string; status?: string } = {}) {
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 20, 1), 100);
  const page = Math.max(Number(input.page) || 1, 1);
  const offset = (page - 1) * pageSize;
  const { params, where } = orderListWhere(input);
  const [count, rows] = await Promise.all([
    db(env)
      .prepare(`SELECT COUNT(*) AS count FROM orders LEFT JOIN payments ON payments.id = orders.payway${where}`)
      .bind(...params)
      .first<{ count: number }>(),
    db(env)
      .prepare(`SELECT orders.*, payments.name AS payway_name FROM orders LEFT JOIN payments ON payments.id = orders.payway${where} ORDER BY orders.created_at DESC LIMIT ? OFFSET ?`)
      .bind(...params, pageSize, offset)
      .all<ListedOrderRow>(),
  ]);
  return {
    items: (rows.results ?? []).map(publicOrder),
    page,
    pageSize,
    total: count?.count ?? 0,
  };
}

export async function checkoutData(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  const merchant = order.merchant_id === "INLINE" ? { id: "INLINE", name: "Telegram 收款" } : await getMerchant(env, order.merchant_id);
  const payments = (await listPayments(env)).filter((item) => item.enabled);
  const rateContext = await conversionContext(env);
  const options = [];
  for (const payment of payments) {
    const quotes = getDriver(payment.driver).quote(
      { driver: payment.driver, fields: payment.fields as Record<string, string>, id: payment.id, name: payment.name },
      order.amount,
      order.currency,
    );
    for (const option of quotes) {
      options.push({
        amount: convertAmountWithContext(order.amount, order.currency, option.currency, rateContext),
        currency: option.currency,
        network: option.network,
      });
    }
  }
  return { fast_confirm: rateContext.settings.fast_confirm === "true", merchant: { id: merchant.id, name: merchant.name }, options, order: publicOrder(order) };
}

function randomIndex(length: number) {
  const data = new Uint32Array(1);
  crypto.getRandomValues(data);
  return data[0] % length;
}

export async function selectOrderPayment(env: AppEnv, orderId: string, payway: number, currency: string) {
  const order = await getOrder(env, orderId);
  if (order.status !== "pending" || now() > order.expire_at) throw new AppError(400, "order_unavailable", "Order is unavailable");
  const payment = await getPayment(env, payway);
  if (!payment.enabled) throw new AppError(400, "payment_disabled", "Payment is disabled");
  const fields = jsonParseObject<Record<string, string>>(payment.fields_json, {});
  const payAmount = await convertAmount(env, order.amount, order.currency, currency);
  const snapshot = getDriver(payment.driver).assign(
    { driver: payment.driver, fields, id: payment.id, name: payment.name },
    payAmount,
    order.currency,
    currency,
  );
  await db(env)
    .prepare("UPDATE orders SET payway = ?, payment = ?, updated_at = ? WHERE id = ?")
    .bind(payway, JSON.stringify(snapshot), now(), orderId)
    .run();
  return snapshot;
}

export async function selectOrderPaymentByNetwork(env: AppEnv, orderId: string, currency: string, network: string) {
  const order = await getOrder(env, orderId);
  if (order.status !== "pending" || now() > order.expire_at) throw new AppError(400, "order_unavailable", "Order is unavailable");
  return assignOrderPaymentByNetwork(env, order, currency, network, false);
}

export async function selectTelegramOrderPaymentByNetwork(env: AppEnv, orderId: string, currency: string, network: string) {
  const order = await getOrder(env, orderId);
  if (order.source !== "telegram_inline" && order.source !== "telegram") throw new AppError(400, "order_unavailable", "Order is unavailable");
  if (order.status === "paid") throw new AppError(400, "order_paid", "Order is paid");
  if (order.status === "invalid") throw new AppError(400, "order_unavailable", "Order is unavailable");
  return assignOrderPaymentByNetwork(env, order, currency, network, true);
}

async function assignOrderPaymentByNetwork(env: AppEnv, order: OrderRow, currency: string, network: string, refreshWindow: boolean) {
  const targetCurrency = currency.trim().toUpperCase();
  const targetNetwork = network.trim().toLowerCase();
  const candidates = [];
  for (const payment of (await listPayments(env)).filter((item) => item.enabled)) {
    const fields = payment.fields as Record<string, string>;
    const quotes = getDriver(payment.driver).quote(
      { driver: payment.driver, fields, id: payment.id, name: payment.name },
      order.amount,
      order.currency,
    );
    for (const quote of quotes) {
      if (quote.currency.toUpperCase() === targetCurrency && quote.network.toLowerCase() === targetNetwork) {
        candidates.push({ fields, payment });
      }
    }
  }
  if (!candidates.length) throw new AppError(400, "payment_network_unavailable", "Payment network is unavailable");
  const { fields, payment } = candidates[randomIndex(candidates.length)];
  const payAmount = await convertAmount(env, order.amount, order.currency, targetCurrency);
  const snapshot = getDriver(payment.driver).assign(
    { driver: payment.driver, fields, id: payment.id, name: payment.name },
    payAmount,
    order.currency,
    targetCurrency,
  );
  const ts = now();
  if (refreshWindow) {
    const timeout = await orderTimeoutMinutes(env);
    await db(env)
      .prepare("UPDATE orders SET status = 'pending', payway = ?, payment = ?, paid_at = NULL, created_at = ?, expire_at = ?, updated_at = ? WHERE id = ?")
      .bind(payment.id, JSON.stringify(snapshot), ts, orderExpireAt(ts, timeout), ts, order.id)
      .run();
  } else {
    await db(env)
      .prepare("UPDATE orders SET payway = ?, payment = ?, updated_at = ? WHERE id = ?")
      .bind(payment.id, JSON.stringify(snapshot), ts, order.id)
      .run();
  }
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

export async function submitPaymentReview(env: AppEnv, orderId: string, input: Record<string, unknown>) {
  const order = await getOrder(env, orderId);
  if (order.status === "paid") throw new AppError(400, "order_paid", "Order is paid");
  if (order.status === "invalid") throw new AppError(400, "order_unavailable", "Order is unavailable");
  const image = String(input.image ?? "").trim();
  const answer = String(input.answer ?? "").trim();
  if (!answer) throw new AppError(400, "review_answer_required", "Review answer is required");
  if (!image.startsWith("data:image/")) throw new AppError(400, "review_image_invalid", "Review image is invalid");
  if (image.length > 2_800_000) throw new AppError(400, "review_image_too_large", "Review image is too large");
  const snapshot = jsonParseObject<Partial<PaymentSnapshot>>(order.payment, {});
  const review: PaymentReviewEvidence = {
    answer,
    image,
    status: "pending",
    submittedAt: now(),
  };
  const payment = { ...snapshot, review };
  await db(env)
    .prepare("UPDATE orders SET payment = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(payment), review.submittedAt, order.id)
    .run();
  return { review };
}

export async function checkOrderPayment(env: AppEnv, orderId: string, confirmedBy: PaymentTxEvidence["confirmedBy"]) {
  const order = await getOrder(env, orderId);
  if (order.status !== "pending") return jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  if (!snapshot.driver) throw new AppError(400, "payment_not_selected", "Payment is not selected");
  if (snapshot.network !== "tron") throw new AppError(400, "auto_check_unavailable", "Auto check is unavailable for this payment");
  const candidates = await fetchTronCandidates(snapshot, order.created_at, await fastConfirmEnabled(env));
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
  if (order.status !== "pending") throw new AppError(400, "order_unavailable", "Order is unavailable");
  const snapshot = jsonParseObject<Partial<PaymentSnapshot>>(order.payment, {});
  const tx: PaymentTxEvidence = {
    amount: Number(input.amount ?? snapshot.amount ?? order.amount),
    confirmedBy: "admin",
    currency: String(input.currency ?? snapshot.currency ?? order.currency),
    from: typeof input.from === "string" ? input.from : undefined,
    hash: typeof input.hash === "string" ? input.hash.trim() || undefined : undefined,
    raw: input,
    timestamp: Number(input.timestamp ?? now()),
    to: typeof input.to === "string" ? input.to : snapshot.address,
  };
  const paidPayment = { ...snapshot, tx };
  const ts = now();
  await db(env)
    .prepare("UPDATE orders SET status = 'paid', payment = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(JSON.stringify(paidPayment), ts, ts, order.id)
    .run();
  await createNotify(env, order.id);
  return paidPayment;
}

export async function deleteOrder(env: AppEnv, orderId: string) {
  await db(env).batch([
    db(env).prepare("DELETE FROM notify WHERE order_id = ?").bind(orderId),
    db(env).prepare("DELETE FROM orders WHERE id = ?").bind(orderId),
  ]);
  return { ok: true };
}

export async function resendOrderNotify(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  if (order.status !== "paid") throw new AppError(400, "order_not_paid", "Order is not paid");
  if (!order.callback_url) throw new AppError(400, "callback_url_missing", "Callback URL is missing");
  return { notifyId: await createNotify(env, orderId) };
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
