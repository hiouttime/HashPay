import { all } from "@/server/db";
import { getMerchant } from "@/server/services/merchants";
import { getDetailedOrder, publicOrder, queryOrdersPage } from "@/server/services/orders/repository";
import { getReview } from "@/server/services/orders/review";
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
    review,
  };
}
