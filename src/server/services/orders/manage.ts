import { all, jsonParseObject, now } from "@/server/db";
import { AppError } from "@/server/http/api";
import { getMerchant, listMerchants } from "@/server/services/merchants";
import { createMerchantOrder, deleteOrder } from "@/server/services/orders/create";
import { getDetailedOrder, listOrdersPage as queryOrdersPage, publicOrder } from "@/server/services/orders/repository";
import { checkOrderPayment, confirmOrder } from "@/server/services/orders/checkout";
import { resendOrderNotify } from "@/server/services/orders/notifications";
import { systemSettings } from "@/server/services/app/settings";
import type { DetailedOrder, Order } from "@/server/services/orders/repository";
import type { AppEnv } from "@/server/types/env";

export async function listOrdersPage(env: AppEnv, input: { page?: number; pageSize?: number; q?: string; status?: string } = {}) {
  const result = await queryOrdersPage(env, input);
  return {
    items: result.rows.map(publicOrder),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  };
}

export async function getOrderDetail(env: AppEnv, id: string) {
  const order = await getDetailedOrder(env, id);
  const [merchant, notify] = await Promise.all([
    order.merchant === "INLINE"
      ? Promise.resolve({ id: "INLINE", name: "Telegram Internal Merchant", type: "internal" })
      : getMerchant(env, order.merchant).catch(() => null),
    all<{ attempts: number; created_at: number; id: number; last_error: string | null; next_run_at: number; payload_json: string; status: string; updated_at: number }>(env, "SELECT * FROM notify WHERE order_id = ? ORDER BY created_at DESC LIMIT 20", id),
  ]);
  return {
    merchant,
    notify: notify.map((row) => ({
      attempts: row.attempts,
      createdAt: row.created_at,
      id: row.id,
      lastError: row.last_error,
      nextRunAt: row.next_run_at,
      payload: jsonParseObject(row.payload_json, {}),
      status: row.status,
      updatedAt: row.updated_at,
    })),
    order: publicOrder(order),
    payway: order.payway
        ? {
            driver: order.paywayDriver,
            id: order.payway,
            name: order.paywayName,
            status: order.paywayStatus,
          }
      : null,
    rate: rateDetail(order),
  };
}

function rateDetail(order: DetailedOrder | Order) {
  const payment = jsonParseObject<{ amount?: number; currency?: string }>(order.payment, {});
  const paymentAmount = Number(payment.amount);
  const paymentCurrency = String(payment.currency || "").toLowerCase();
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || !paymentCurrency) {
    return {
      originalAmount: order.amount,
      originalCurrency: order.currency,
      paymentAmount: null,
      paymentCurrency: null,
      rate: null,
    };
  }
  return {
    originalAmount: order.amount,
    originalCurrency: order.currency,
    paymentAmount,
    paymentCurrency,
    rate: order.currency.toLowerCase() === paymentCurrency && order.amount === paymentAmount ? 1 : order.amount / paymentAmount,
  };
}

export async function createCheckoutTestOrder(env: AppEnv, requestUrl: string, input: Record<string, unknown>) {
  const merchants = await listMerchants(env);
  const requestedMerchantId = String(input.merchantId ?? input.merchant ?? "").trim();
  const merchant = requestedMerchantId
    ? merchants.find((item) => item.id === requestedMerchantId)
    : merchants.find((item) => item.status === "active" && item.type === "website") ?? merchants.find((item) => item.status === "active");
  if (!merchant) throw new AppError(400, "errors.merchant_missing");
  if (merchant.status !== "active") throw new AppError(400, "errors.merchant_disabled");
  const amount = Number(input.amount ?? 20);
  const currency = String(input.currency ?? (await systemSettings(env)).currency).trim().toUpperCase();
  const { order, reused } = await createMerchantOrder(env, merchant, {
    amount,
    currency,
    description: String(input.description ?? "Web checkout test order"),
    merchantNo: `web-checkout-${now()}-${crypto.randomUUID().slice(0, 8)}`,
  });
  const checkoutUrl = new URL(`/pay/${order.id}`, requestUrl).toString();
  return { checkoutUrl, merchant, order: publicOrder(order), reused };
}

export { checkOrderPayment, confirmOrder, deleteOrder, resendOrderNotify };
