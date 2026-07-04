import { all, getConfig, one } from "@/server/db";
import { migrateD1 } from "@/server/db/migrations";
import { listPayments, paymentHealth } from "@/server/payments/channels";
import { listOrders, listReviewOrders, publicOrder } from "@/server/services/orders/repository";
import { getBotInfo, refreshBotInfo } from "@/server/services/telegram/api";
import type { AppEnv } from "@/server/types/env";

export async function appState(env: AppEnv, _requestUrl: string) {
  let db: string | null = null;
  let domain: string | null = null;
  let adminId: string | null = null;
  let webhookSecret: string | null = null;
  let username = "";
  try {
    await migrateD1(env);
    const configs = await Promise.all([
      getConfig(env, "domain"),
      getConfig(env, "admin_id"),
      getConfig(env, "bot_secret"),
      getConfig(env, "bot_username"),
    ]);
    [domain, adminId, webhookSecret] = configs;
    username = configs[3] || "";
  } catch (error) {
    db = error instanceof Error ? error.message : "Database is not available";
  }
  let bot: "admin" | "domain" | "invalid" | "missing" | "ready" = "missing";
  if (!env.TGBOT_TOKEN) {
    bot = "missing";
  } else {
    try {
      username = username || (db ? await getBotInfo(env) : await refreshBotInfo(env)).username;
      bot = !domain || !webhookSecret ? "domain" : !adminId ? "admin" : "ready";
    } catch {
      bot = "invalid";
    }
  }
  return {
    db,
    bot,
    domain,
    queue: env.QUEUE_NOTIFY ? null : "QUEUE_NOTIFY binding is not configured",
    ready: bot === "ready",
    username,
  };
}

export async function dashboard(env: AppEnv) {
  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const [pending, paymentList, trends, actions, orders] = await Promise.all([
    one<{ count: number }>(env, "SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'"),
    listPayments(env),
    dashboardTrends(env, startOfDay),
    listReviewOrders(env).then((orders) => orders.map(publicOrder)),
    listOrders(env, { limit: 5, status: "all" }).then((orders) => orders.map(publicOrder)),
  ]);
  return {
    actions,
    health: paymentList.filter((payment) => payment.status !== "disabled").map(paymentHealth),
    orders,
    pending: pending?.count ?? 0,
    trends,
  };
}

async function dashboardTrends(env: AppEnv, startOfDay: number) {
  const day = 86400;
  return {
    "15d": await dailyTrend(env, startOfDay - 14 * day, 15),
    "30d": await dailyTrend(env, startOfDay - 29 * day, 30),
    "7d": await dailyTrend(env, startOfDay - 6 * day, 7),
    td: await hourlyTrend(env, startOfDay),
    yd: await hourlyTrend(env, startOfDay - day),
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
    amount: 0,
    label: label(start + bucket * bucketSize),
    orders: 0,
    paidOrders: 0,
    timestamp: start + bucket * bucketSize,
  }));
  const [orders, paid] = await Promise.all([
    all<{ bucket: number; count: number }>(env, "SELECT CAST((created_at - ?) / ? AS INTEGER) AS bucket, COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY bucket", start, bucketSize, start, end),
    all<{ amount: number; bucket: number; count: number }>(env, "SELECT CAST((paid_at - ?) / ? AS INTEGER) AS bucket, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM orders WHERE status = 'paid' AND paid_at >= ? AND paid_at < ? GROUP BY bucket", start, bucketSize, start, end),
  ]);
  for (const row of orders) {
    const point = points[Number(row.bucket)];
    if (point) point.orders = Number(row.count) || 0;
  }
  for (const row of paid) {
    const point = points[Number(row.bucket)];
    if (point) {
      point.amount = Number(row.amount) || 0;
      point.paidOrders = Number(row.count) || 0;
    }
  }
  return points;
}
