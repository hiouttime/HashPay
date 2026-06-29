import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { errorBody } from "@/server/http/api-error";
import { apiEnvelope } from "@/server/http/api-response";
import { createRequestId } from "@/server/http/request-id";
import { createAdminRoutes } from "@/server/http/routes/admin";
import { createAuthRoutes } from "@/server/http/routes/auth";
import { createCheckoutRoutes } from "@/server/http/routes/checkout";
import { createMerchantRoutes } from "@/server/http/routes/merchant";
import { createStateRoutes } from "@/server/http/routes/state";
import { ensureDefaultBanner } from "@/server/services/banner";
import { orderQrPng } from "@/server/services/qr";
import { handleTelegramWebhook } from "@/server/services/telegram/service";
import type { AppEnv, AppVariables } from "@/shared/types/env";

export function createApp() {
  const app = new Hono<{ Bindings: AppEnv; Variables: AppVariables }>();

  app.onError((error, c) => {
    const { body, status } = errorBody(error);
    if (status === 500) console.error(error);
    return c.json(body, status as never);
  });
  app.use("*", async (c, next) => {
    c.set("requestId", createRequestId());
    await next();
  });
  app.use("/api/*", secureHeaders());
  app.use("/api/*", cors({ credentials: true, origin: (origin) => origin }));
  app.use("/api/*", apiEnvelope);

  app.get("/health", (c) => c.json({ ok: true, service: "hashpay", ts: new Date().toISOString() }));
  app.get("/site/banner.webp", async (c) => {
    const banner = await ensureDefaultBanner(c.env, c.req.url);
    return new Response(banner, { headers: { "cache-control": "public, max-age=300", "content-type": "image/webp" } });
  });
  app.get("/site/orders/:id/qr.png", async (c) => {
    const png = await orderQrPng(c.env, c.req.param("id"));
    if (!png) return new Response("QR is not available", { status: 404 });
    return new Response(new Uint8Array(png), { headers: { "cache-control": "no-store", "content-type": "image/png" } });
  });

  app.route("/api/state", createStateRoutes());
  app.route("/api/auth", createAuthRoutes());
  app.route("/api/admin", createAdminRoutes());
  app.route("/api/merchant", createMerchantRoutes());
  app.route("/api/checkout", createCheckoutRoutes());
  app.post("/telegram/webhook/:secret", handleTelegramWebhook);

  app.all("*", async (c) => {
    if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
    return new Response("HashPay client is not built yet.", { status: 503 });
  });

  return app;
}
