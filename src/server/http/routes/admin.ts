import { Hono } from "hono";
import type { Context } from "hono";
import { deletePaymentMethod, listPaymentMethods, savePaymentMethod } from "@/server/payments/channels";
import { consumePinLogin, createPinLogin, loginByTelegram, logout } from "@/server/services/auth/login";
import { requireAdmin } from "@/server/services/auth/session";
import { restoreDefaultBanner, uploadBanner } from "@/server/services/images/banner";
import { deleteMerchant, listMerchants, rotateMerchantKey, saveMerchant } from "@/server/services/merchants";
import { checkOrderPayment, createCheckoutTestOrder, deleteOrder, getOrderDetail, listOrdersPage, manualConfirmOrder, resendOrderNotify } from "@/server/services/orders/manage";
import { dashboard } from "@/server/services/app";
import { adminSettings, saveAdminSettings, settingsPreview } from "@/server/services/app/settings";
import { setupSession, startSetup } from "@/server/services/app/setup";
import type { HonoEnv } from "@/shared/types/env";

const app = new Hono<HonoEnv>();
const session = new Hono<HonoEnv>();

function json<T>(handler: (c: Context<HonoEnv>) => T | Promise<T>) {
  return async (c: Context<HonoEnv>) => c.json(await handler(c) as never);
}

function reqJson(c: Context<HonoEnv>) {
  return c.req.json() as Promise<Record<string, unknown>>;
}

// Setup
app.get("/setup", json((c) => setupSession(c)));
app.post("/setup", json(async (c) => startSetup(c, await reqJson(c))));

// Session
session.delete("/", json((c) => logout(c)));
session.get("/", json((c) => requireAdmin(c)));

session.post("/telegram", json(async (c) => loginByTelegram(c, await reqJson(c))));

session.post("/pin", json(async (c) => createPinLogin(c, await reqJson(c))));
session.get("/pin/:pin", json((c) => consumePinLogin(c, c.req.param("pin")!, c.req.query("challenge"))));
app.route("/session", session);

// Admin guard
app.use("*", async (c, next) => {
  await requireAdmin(c);
  await next();
});

// Dashboard
app.get("/dashboard", json((c) => dashboard(c.env)));

// Payments
app.get("/payment", json((c) => listPaymentMethods(c.env)));
app.post("/payment", json(async (c) => savePaymentMethod(c.env, await reqJson(c) as never)));
app.put("/payment/:id", json(async (c) => {
  const body = await reqJson(c);
  return savePaymentMethod(c.env, { ...(body as { address: string; assets: string[]; credentials?: Record<string, string>; driver: string; name: string; status?: "enabled" | "disabled" | "error" }), id: Number(c.req.param("id")!) });
}));
app.delete("/payment/:id", json(async (c) => {
  await deletePaymentMethod(c.env, Number(c.req.param("id")!));
  return { ok: true };
}));

// Merchants
app.get("/merchants", json((c) => listMerchants(c.env)));
app.post("/merchants", json(async (c) => saveMerchant(c.env, await reqJson(c) as never)));
app.put("/merchants/:id", json(async (c) => {
  const body = await reqJson(c);
  return saveMerchant(c.env, { ...(body as { callback?: string; name: string; status?: string; type?: string }), id: c.req.param("id")! });
}));
app.post("/merchants/:id/rotate-key", json((c) => rotateMerchantKey(c.env, c.req.param("id")!)));
app.delete("/merchants/:id", json(async (c) => {
  await deleteMerchant(c.env, c.req.param("id")!);
  return { ok: true };
}));

// Orders
app.get("/orders", json((c) =>
  listOrdersPage(c.env, {
    page: Number(c.req.query("page") ?? 1),
    pageSize: Number(c.req.query("pageSize") ?? 20),
    q: c.req.query("q") ?? "",
    status: c.req.query("status") ?? "all",
  }),
));
app.post("/orders/test", json(async (c) => createCheckoutTestOrder(c.env, c.req.url, await c.req.json().catch(() => ({})) as Record<string, unknown>)));
app.get("/orders/:id", json((c) => getOrderDetail(c.env, c.req.param("id")!)));
app.delete("/orders/:id", json((c) => deleteOrder(c.env, c.req.param("id")!)));
app.post("/orders/:id/check", json((c) => checkOrderPayment(c.env, c.req.param("id")!)));
app.post("/orders/:id/confirm", json(async (c) => manualConfirmOrder(c.env, c.req.param("id")!, await reqJson(c))));
app.post("/orders/:id/notify", json((c) => resendOrderNotify(c.env, c.req.param("id")!)));

// Settings
app.get("/settings", json((c) => adminSettings(c.env)));
app.put("/settings", json(async (c) => saveAdminSettings(c.env, await reqJson(c))));
app.get("/rates/preview", json((c) => settingsPreview(c.env, c.req.query("currency"), c.req.query("rate_adjust"))));
app.put("/banner", json(async (c) => uploadBanner(c.env, await c.req.arrayBuffer())));
app.post("/banner/restore", json(async (c) => {
  await restoreDefaultBanner(c.env);
  return { url: "/banner.webp" };
}));

export default app;
