import { Hono } from "hono";
import { db, getConfig, now, setConfig, setConfigs } from "@/server/db";
import { jsonParseObject } from "@/server/db";
import { AppError } from "@/server/http/api-error";
import { requireAdmin, setSessionCookie, setSetupCookie, setupCookie, signSession } from "@/server/services/auth/session";
import { ensureDefaultBanner, restoreDefaultBanner, saveBanner } from "@/server/services/banner";
import { paymentDrivers, paymentSchemas } from "@/server/services/payments/drivers";
import { normalizeSettingsPayload, settingsPreview, systemSettings } from "@/server/services/rates";
import {
  checkOrderPayment,
  createMerchantOrder,
  deleteMerchant,
  deleteOrder,
  deletePayment,
  getOrderDetail,
  listMerchants,
  listOrders,
  listOrdersPage,
  listPayments,
  manualConfirmOrder,
  resetMerchantKey,
  resendOrderNotify,
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
    await ensureDefaultBanner(c.env, c.req.url);
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

  app.get("/dashboard", async (c) => c.json(await dashboard(c.env)));
  app.get("/settings", async (c) => c.json({
    ...(await systemSettings(c.env)),
    banner_url: "/site/banner.webp",
    domain: await getConfig(c.env, "domain") || "",
    rate_preview: await settingsPreview(c.env),
  }));
  app.get("/settings/preview", async (c) => c.json(await settingsPreview(c.env, c.req.query("currency"), c.req.query("rate_adjust"))));
  app.put("/settings", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const settings = normalizeSettingsPayload(body);
    await setConfigs(c.env, {
      ...settings,
      domain: String(body.domain ?? "").trim(),
    });
    return c.json({
      ...settings,
      banner_url: "/site/banner.webp",
      domain: await getConfig(c.env, "domain") || "",
      rate_preview: await settingsPreview(c.env, settings.currency, settings.rate_adjust),
    });
  });
  app.put("/banner", async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.includes("image/webp")) throw new AppError(400, "banner_type_invalid", "Only WebP banner is supported");
    await saveBanner(c.env, await c.req.arrayBuffer());
    return c.json({ url: "/site/banner.webp" });
  });
  app.post("/banner/default", async (c) => {
    await restoreDefaultBanner(c.env, c.req.url);
    return c.json({ url: "/site/banner.webp" });
  });
  app.get("/banner", async (c) => {
    await ensureDefaultBanner(c.env, c.req.url);
    return c.json({ exists: true, url: "/site/banner.webp" });
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
    return c.json(await saveMerchant(c.env, { ...(body as { callback_url?: string; name: string; status?: string; type?: string }), id: c.req.param("id") }));
  });
  app.post("/merchants/:id/key", async (c) => {
    return c.json(await resetMerchantKey(c.env, c.req.param("id")));
  });
  app.delete("/merchants/:id", async (c) => {
    await deleteMerchant(c.env, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/orders", async (c) =>
    c.json(
      await listOrdersPage(c.env, {
        page: Number(c.req.query("page") ?? 1),
        pageSize: Number(c.req.query("pageSize") ?? c.req.query("page_size") ?? 20),
        q: c.req.query("q") ?? "",
        status: c.req.query("status") ?? "all",
      }),
    ),
  );
  app.post("/orders/test-checkout", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const merchants = await listMerchants(c.env);
    const requestedMerchantId = String(body.merchant_id ?? "").trim();
    const merchant = requestedMerchantId
      ? merchants.find((item) => item.id === requestedMerchantId)
      : merchants.find((item) => item.status === "active" && item.type === "website") ?? merchants.find((item) => item.status === "active");
    if (!merchant) throw new AppError(400, "merchant_missing", "请先创建并启用一个商户");
    if (merchant.status !== "active") throw new AppError(400, "merchant_disabled", "商户未启用");
    const amount = Number(body.amount ?? 20);
    const currency = String(body.currency ?? (await systemSettings(c.env)).currency).trim().toUpperCase();
    const { order, reused } = await createMerchantOrder(c.env, merchant, {
      amount,
      currency,
      customer_ref: "网页测试",
      description: String(body.description ?? "网页收银台测试订单"),
      merchant_order_no: `web-checkout-${now()}-${crypto.randomUUID().slice(0, 8)}`,
    });
    const payUrl = new URL(`/pay/${order.id}`, c.req.url).toString();
    return c.json({ merchant, order, pay_url: payUrl, reused });
  });
  app.get("/orders/:id", async (c) => c.json(await getOrderDetail(c.env, c.req.param("id"))));
  app.post("/orders/:id/check", async (c) => c.json(await checkOrderPayment(c.env, c.req.param("id"), "button")));
  app.post("/orders/:id/confirm", async (c) => c.json(await manualConfirmOrder(c.env, c.req.param("id"), (await c.req.json()) as Record<string, unknown>)));
  app.post("/orders/:id/notify", async (c) => c.json(await resendOrderNotify(c.env, c.req.param("id"))));
  app.delete("/orders/:id", async (c) => c.json(await deleteOrder(c.env, c.req.param("id"))));

  return app;
}

async function dashboard(env: AppEnv) {
  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const [orderStats, todayOrders, todayPaid, failedNotify, pendingNotify, paymentList, trends, recentOrders] = await Promise.all([
    db(env)
      .prepare("SELECT status, COUNT(*) AS count FROM orders GROUP BY status")
      .all<{ status: string; count: number }>(),
    db(env)
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE created_at >= ?")
      .bind(startOfDay)
      .first<{ count: number }>(),
    db(env)
      .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM orders WHERE status = 'paid' AND paid_at >= ?")
      .bind(startOfDay)
      .first<{ amount: number; count: number }>(),
    db(env)
      .prepare("SELECT COUNT(*) AS count FROM notify WHERE status = 'failed'")
      .first<{ count: number }>(),
    db(env)
      .prepare("SELECT COUNT(*) AS count FROM notify WHERE status IN ('pending', 'retry')")
      .first<{ count: number }>(),
    listPayments(env),
    dashboardTrends(env, startOfDay),
    listOrders(env, { limit: 5, status: "all" }),
  ]);
  const counts = Object.fromEntries((orderStats.results ?? []).map((row) => [row.status, row.count]));
  const paymentHealth = paymentList.map(paymentHealthState);
  return {
    failedNotifyCount: failedNotify?.count ?? 0,
    now: now(),
    notifyPendingCount: pendingNotify?.count ?? 0,
    orderCounts: {
      expired: counts.expired ?? 0,
      invalid: counts.invalid ?? 0,
      paid: counts.paid ?? 0,
      pending: counts.pending ?? 0,
      total: Object.values(counts).reduce((sum, value) => sum + Number(value), 0),
    },
    paymentHealth,
    recentOrders,
    todayOrderCount: todayOrders?.count ?? 0,
    todayPaidAmount: todayPaid?.amount ?? 0,
    todayPaidCount: todayPaid?.count ?? 0,
    trends,
  };
}

async function dashboardTrends(env: AppEnv, startOfDay: number) {
  const day = 86400;
  return {
    "15d": await dailyTrend(env, startOfDay - 14 * day, 15),
    "30d": await dailyTrend(env, startOfDay - 29 * day, 30),
    "7d": await dailyTrend(env, startOfDay - 6 * day, 7),
    today: await hourlyTrend(env, startOfDay),
    yesterday: await hourlyTrend(env, startOfDay - day),
  };
}

async function hourlyTrend(env: AppEnv, start: number) {
  return trend(env, start, start + 86400, 3600, (timestamp) => `${String(new Date(timestamp * 1000).getHours()).padStart(2, "0")}:00`);
}

async function dailyTrend(env: AppEnv, start: number, days: number) {
  return trend(env, start, start + days * 86400, 86400, (timestamp) => {
    const date = new Date(timestamp * 1000);
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  });
}

async function trend(env: AppEnv, start: number, end: number, bucketSize: number, label: (timestamp: number) => string) {
  const points = Array.from({ length: Math.ceil((end - start) / bucketSize) }, (_, bucket) => ({
    label: label(start + bucket * bucketSize),
    orderCount: 0,
    paidAmount: 0,
    paidCount: 0,
    timestamp: start + bucket * bucketSize,
  }));
  const [orders, paid] = await Promise.all([
    db(env)
      .prepare("SELECT CAST((created_at - ?) / ? AS INTEGER) AS bucket, COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY bucket")
      .bind(start, bucketSize, start, end)
      .all<{ bucket: number; count: number }>(),
    db(env)
      .prepare("SELECT CAST((paid_at - ?) / ? AS INTEGER) AS bucket, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM orders WHERE status = 'paid' AND paid_at >= ? AND paid_at < ? GROUP BY bucket")
      .bind(start, bucketSize, start, end)
      .all<{ amount: number; bucket: number; count: number }>(),
  ]);
  for (const row of orders.results ?? []) {
    const point = points[Number(row.bucket)];
    if (point) point.orderCount = Number(row.count) || 0;
  }
  for (const row of paid.results ?? []) {
    const point = points[Number(row.bucket)];
    if (point) {
      point.paidAmount = Number(row.amount) || 0;
      point.paidCount = Number(row.count) || 0;
    }
  }
  return points;
}

function paymentHealthState(payment: { driver: string; enabled: boolean; fields?: Record<string, unknown>; id: number; name: string }) {
  const fields = payment.fields ?? {};
  const driver = paymentDrivers().find((item) => item.id === payment.driver);
  if (!payment.enabled) {
    return {
      details: "未启用",
      driver: payment.driver,
      id: payment.id,
      name: payment.name,
      network: String(fields.network || driver?.networks?.[0] || payment.driver),
      status: "off",
    };
  }
  if (driver?.kind === "chain" && !String(fields.address || "").trim()) {
    return {
      details: "缺少收款地址",
      driver: payment.driver,
      id: payment.id,
      name: payment.name,
      network: String(fields.network || driver.networks?.[0] || payment.driver),
      status: "warn",
    };
  }
  if (driver && driver.kind !== "chain" && !String(fields.account || "").trim()) {
    return {
      details: "缺少收款账户",
      driver: payment.driver,
      id: payment.id,
      name: payment.name,
      network: String(fields.network || driver.networks?.[0] || payment.driver),
      status: "warn",
    };
  }
  return {
    details: driver?.canAutoCheck ? "自动检查可用" : "人工确认",
    driver: payment.driver,
    id: payment.id,
    name: payment.name,
    network: String(fields.network || driver?.networks?.[0] || payment.driver),
    status: "ok",
  };
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
