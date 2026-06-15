import { Hono } from "hono";
import { getConfig, getConfigBlob, listConfigs, setConfig, setConfigs } from "@/server/db";
import { jsonParseObject } from "@/server/db";
import { AppError } from "@/server/http/api-error";
import { requireAdmin, setSessionCookie, setSetupCookie, setupCookie, signSession } from "@/server/services/auth/session";
import { paymentDrivers, paymentSchemas } from "@/server/services/payments/drivers";
import {
  checkOrderPayment,
  deleteMerchant,
  deletePayment,
  listMerchants,
  listOrders,
  listPayments,
  manualConfirmOrder,
  saveMerchant,
  savePayment,
} from "@/server/services/orders/service";
import { configureBotMiniApp, startTelegramSetup } from "@/server/services/telegram/service";
import type { AppEnv, AppVariables, TelegramUser } from "@/shared/types/env";

export function createAdminRoutes() {
  const app = new Hono<{ Bindings: AppEnv; Variables: AppVariables }>();

  app.post("/setup", async (c) => {
    if (!c.env.TGBOT_TOKEN) throw new AppError(500, "bot_token_missing", "未配置环境变量 TGBOT_TOKEN");
    const adminId = await getConfig(c.env, "admin_id");
    if (adminId) throw new AppError(409, "setup_completed", "HashPay 已完成初始化");
    const body = (await c.req.json()) as Record<string, unknown>;
    const domain = normalizePublicDomain(body.domain);
    const token = crypto.randomUUID().replaceAll("-", "");
    const setup = await startTelegramSetup(c.env, domain, token);
    setSetupCookie(c, token);
    return c.json({ domain, ...setup });
  });

  app.get("/setup/status", async (c) => {
    const token = setupCookie(c);
    const expected = await getConfig(c.env, "setup_token");
    const expiresAt = Number(await getConfig(c.env, "setup_expires_at"));
    if (!token || !expected || token !== expected || !Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
      throw new AppError(401, "setup_session_invalid", "安装会话已失效");
    }
    const adminId = Number(await getConfig(c.env, "admin_id"));
    if (!adminId) return c.json({ admin: null, bound: false });
    const admin = jsonParseObject<TelegramUser>(await getConfig(c.env, "admin_user"), { id: adminId });
    setSessionCookie(c, await signSession(c.env, admin));
    await setConfig(c.env, "setup_token", "");
    await setConfig(c.env, "setup_expires_at", "0");
    return c.json({ admin, bound: true });
  });

  app.post("/setup/finalize", async (c) => {
    await requireAdmin(c);
    return c.json(await configureBotMiniApp(c.env));
  });

  app.use("*", async (c, next) => {
    await requireAdmin(c);
    await next();
  });

  app.get("/settings", async (c) => c.json(await listConfigs(c.env)));
  app.put("/settings", async (c) => {
    await setConfigs(c.env, (await c.req.json()) as Record<string, string>);
    return c.json(await listConfigs(c.env));
  });
  app.put("/banner", async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.includes("image/png")) throw new AppError(400, "banner_type_invalid", "Only PNG banner is supported");
    await setConfig(c.env, "banner", "png", await c.req.arrayBuffer());
    return c.json({ url: "/site/banner.png" });
  });
  app.get("/banner", async (c) => {
    const blob = await getConfigBlob(c.env, "banner");
    return c.json({ exists: Boolean(blob), url: "/site/banner.png" });
  });

  app.get("/payments/catalog", (c) => c.json({ drivers: paymentDrivers(), schema: paymentSchemas() }));
  app.get("/payments", async (c) => c.json(await listPayments(c.env)));
  app.post("/payments", async (c) => c.json(await savePayment(c.env, (await c.req.json()) as never)));
  app.put("/payments/:id", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    return c.json(await savePayment(c.env, { ...(body as { driver: string; enabled?: boolean; fields: Record<string, string>; name: string }), id: Number(c.req.param("id")) }));
  });
  app.delete("/payments/:id", async (c) => {
    await deletePayment(c.env, Number(c.req.param("id")));
    return c.json({ ok: true });
  });

  app.get("/merchants", async (c) => c.json(await listMerchants(c.env)));
  app.post("/merchants", async (c) => c.json(await saveMerchant(c.env, (await c.req.json()) as never)));
  app.put("/merchants/:id", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    return c.json(await saveMerchant(c.env, { ...(body as { callbackUrl?: string; name: string; status?: string }), id: c.req.param("id") }));
  });
  app.delete("/merchants/:id", async (c) => {
    await deleteMerchant(c.env, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/orders", async (c) => c.json(await listOrders(c.env, c.req.query("status") ?? "all", Number(c.req.query("limit") ?? 100))));
  app.post("/orders/:id/check", async (c) => c.json(await checkOrderPayment(c.env, c.req.param("id"), "admin")));
  app.post("/orders/:id/confirm", async (c) => c.json(await manualConfirmOrder(c.env, c.req.param("id"), (await c.req.json()) as Record<string, unknown>)));

  return app;
}

function normalizePublicDomain(value: unknown) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !isPublicHostname(url.hostname)) throw new Error("Domain must use public https");
    return url.origin;
  } catch {
    throw new AppError(400, "domain_invalid", "请填写合法的公网 HTTPS 站点地址");
  }
}

function isPublicHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".local")) return false;
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(lower) ? lower.split(".").map(Number) : null;
  if (ipv4) {
    const [a, b] = ipv4;
    if (ipv4.some((part) => part < 0 || part > 255)) return false;
    return !(a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254));
  }
  return lower.includes(".");
}
