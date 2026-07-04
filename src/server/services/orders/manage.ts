import { all, now } from "@/server/db";
import { AppError } from "@/server/http/api";
import { getMerchant, listMerchants } from "@/server/services/merchants";
import { createMerchantOrder, deleteOrder } from "@/server/services/orders/create";
import { getDetailedOrder, listOrdersPage as queryOrdersPage, publicOrder } from "@/server/services/orders/repository";
import { checkOrderPayment, confirmOrder } from "@/server/services/orders/checkout";
import { resendOrderNotify } from "@/server/services/orders/notifications";
import { getReview } from "@/server/services/orders/review";
import { systemSettings } from "@/server/services/app/settings";
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
  const [merchant, notify, review] = await Promise.all([
    order.merchant === "INLINE"
      ? Promise.resolve({ name: "Telegram Internal Merchant" })
      : getMerchant(env, order.merchant).catch(() => null),
    all<{ attempts: number; id: number; last_error: string | null; next_run_at: number; status: string }>(env, "SELECT id, status, attempts, next_run_at, last_error FROM notify WHERE order_id = ? ORDER BY created_at DESC LIMIT 20", id),
    getReview(env, id),
  ]);
  return {
    merchantName: merchant?.name ?? null,
    notify: notify.map((row) => ({
      attempts: row.attempts,
      id: row.id,
      lastError: row.last_error,
      nextRunAt: row.next_run_at,
      status: row.status,
    })),
    order: publicOrder(order),
    review: review ? { answer: review.answer, image: review.image, imageUrl: review.imageUrl } : null,
  };
}

export async function createCheckoutTestOrder(env: AppEnv, requestUrl: string, input: Record<string, unknown>) {
  const merchants = await listMerchants(env);
  const requestedMerchantId = String(input.merchantId ?? input.merchant ?? "").trim();
  const merchant = requestedMerchantId
    ? merchants.find((item) => item.id === requestedMerchantId)
    : merchants.find((item) => item.status === "enabled" && item.type === "website") ?? merchants.find((item) => item.status === "enabled");
  if (!merchant) throw new AppError(400, "errors.merchant_missing");
  if (merchant.status !== "enabled") throw new AppError(400, "errors.merchant_disabled");
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
