import { Hono } from "hono";
import { migrateD1 } from "@/server/db/migrations";
import { ensureDefaultBanner } from "@/server/services/images/banner";
import { checkoutData, checkSubmittedPayment, selectCheckoutPayment, submitPaymentReview } from "@/server/services/orders/checkout";
import { publicOrder } from "@/server/services/orders/repository";
import { getOrder } from "@/server/services/orders/repository";
import { orderQrPng } from "@/server/services/images/qr";
import { handleTelegramWebhook } from "@/server/services/telegram/bot";
import { appState } from "@/server/services/app";
import type { HonoEnv } from "@/server/types/env";

const app = new Hono<HonoEnv>();

app.get("/health", (c) => c.json({ ok: true, service: "hashpay", ts: new Date().toISOString() }));

app.get("/banner.webp", async (c) => {
  const banner = await ensureDefaultBanner(c.env);
  return new Response(banner, { headers: { "cache-control": "public, max-age=300", "content-type": "image/webp" } });
});
app.get("/order/:id/qr.png", async (c) => {
  const png = await orderQrPng(c.env, c.req.param("id"));
  if (!png) return new Response("QR is not available", { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "cache-control": "no-store", "content-type": "image/png" } });
});

app.get("/api/state", async (c) => c.json(await appState(c.env, c.req.url)));

app.get("/api/checkout/:orderId", async (c) => c.json(await checkoutData(c.env, c.req.param("orderId"))));
app.get("/api/checkout/:orderId/status", async (c) => c.json(publicOrder(await getOrder(c.env, c.req.param("orderId")))));
app.put("/api/checkout/:orderId/payment", async (c) => {
  const body = (await c.req.json()) as { asset?: string; network?: string };
  return c.json(await selectCheckoutPayment(c.env, c.req.param("orderId"), String(body.asset ?? ""), String(body.network ?? "")));
});
app.post("/api/checkout/:orderId/check", async (c) => {
  return c.json(await checkSubmittedPayment(c.env, c.req.param("orderId"), await c.req.json()));
});
app.post("/api/checkout/:orderId/review", async (c) => {
  return c.json(await submitPaymentReview(c.env, c.req.param("orderId"), (await c.req.json()) as Record<string, unknown>));
});

app.post("/telegram/webhook/:secret", async (c) => {
  await migrateD1(c.env);
  return handleTelegramWebhook(c);
});

export default app;
