import { Hono } from "hono";
import { AppError } from "@/server/http/api-error";
import { createMerchantOrder, getMerchantByApiKey, getOrder, publicOrder } from "@/server/services/orders/service";
import type { AppEnv, AppVariables } from "@/shared/types/env";

export function createMerchantRoutes() {
  const app = new Hono<{ Bindings: AppEnv; Variables: AppVariables }>();
  app.post("/orders", async (c) => {
    const apiKey = c.req.header("x-api-key")?.trim();
    if (!apiKey) throw new AppError(401, "api_key_missing", "API key is missing");
    const { order, reused } = await createMerchantOrder(c.env, apiKey, (await c.req.json()) as Record<string, unknown>);
    return c.json({
      amount: order.amount,
      currency: order.currency,
      expire_at: order.expire_at,
      order_id: order.id,
      pay_url: `${new URL(c.req.url).origin}/pay/${order.id}`,
      reused,
      status: order.status,
    });
  });
  app.get("/orders/:id", async (c) => {
    const apiKey = c.req.header("x-api-key")?.trim();
    if (!apiKey) throw new AppError(401, "api_key_missing", "API key is missing");
    const merchant = await getMerchantByApiKey(c.env, apiKey);
    const order = await getOrder(c.env, c.req.param("id"));
    if (order.merchant_id !== merchant.id) throw new AppError(404, "order_not_found", "Order is not found");
    return c.json(publicOrder(order));
  });
  return app;
}
