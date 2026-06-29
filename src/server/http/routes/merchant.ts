import { Hono } from "hono";
import { AppError } from "@/server/http/api-error";
import { verifyRsaSha256 } from "@/server/services/crypto";
import { createMerchantOrder, getMerchant, getOrder, publicOrder } from "@/server/services/orders/service";
import type { AppEnv, AppVariables } from "@/shared/types/env";

export function createMerchantRoutes() {
  const app = new Hono<{ Bindings: AppEnv; Variables: AppVariables }>();
  app.post("/orders", async (c) => {
    const body = await c.req.text();
    const merchant = await requireSignedMerchant(c, body);
    const { order, reused } = await createMerchantOrder(c.env, merchant, JSON.parse(body || "{}") as Record<string, unknown>);
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
    const merchant = await requireSignedMerchant(c, "");
    const order = await getOrder(c.env, c.req.param("id"));
    if (order.merchant_id !== merchant.id) throw new AppError(404, "order_not_found", "Order is not found");
    return c.json(publicOrder(order));
  });
  return app;
}

async function requireSignedMerchant(c: { env: AppEnv; req: { header(name: string): string | undefined; method: string; url: string } }, body: string) {
  const merchantId = c.req.header("x-merchant-id")?.trim();
  const signature = c.req.header("x-signature")?.trim();
  const timestamp = c.req.header("x-timestamp")?.trim();
  if (!merchantId) throw new AppError(401, "merchant_id_missing", "X-Merchant-Id is missing");
  if (!signature) throw new AppError(401, "signature_missing", "X-Signature is missing");
  if (!timestamp) throw new AppError(401, "timestamp_missing", "X-Timestamp is missing");
  const unix = Number(timestamp);
  if (!Number.isFinite(unix) || Math.abs(Math.floor(Date.now() / 1000) - unix) > 300) {
    throw new AppError(401, "timestamp_invalid", "X-Timestamp is invalid");
  }
  const merchant = await getMerchant(c.env, merchantId);
  if (merchant.status !== "active") throw new AppError(401, "merchant_disabled", "Merchant is disabled");
  if (!merchant.public_key.trim()) throw new AppError(401, "merchant_public_key_missing", "Merchant public key is missing");
  const url = new URL(c.req.url);
  const signedPayload = [c.req.method.toUpperCase(), `${url.pathname}${url.search}`, timestamp, body].join("\n");
  if (!await verifyRsaSha256(merchant.public_key, signature, signedPayload)) {
    throw new AppError(401, "signature_invalid", "Signature is invalid");
  }
  return merchant;
}
