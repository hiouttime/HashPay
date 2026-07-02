import { all, getConfig, now, one } from "@/server/db";
import { migrateD1 } from "@/server/db/migrations";
import { listPaymentMethods, paymentMethodHealth } from "@/server/payments/channels";
import { listOrders } from "@/server/services/orders/manage";
import { getBotInfo, refreshBotInfo } from "@/server/services/telegram/api";
import type { AppEnv } from "@/shared/types/env";

export async function appState(env: AppEnv, requestUrl: string) {
  let domain: string | null = null;
  let adminId: string | null = null;
  let webhookSecret: string | null = null;
  let botUsername: string | null = null;
  let dbError: string | null = null;
  try {
    await migrateD1(env);
    [domain, adminId, webhookSecret, botUsername] = await Promise.all([
      getConfig(env, "domain"),
      getConfig(env, "admin_id"),
      getConfig(env, "bot_secret"),
      getConfig(env, "bot_username"),
    ]);
  } catch (error) {
    dbError = error instanceof Error ? error.message : "Database is not available";
  }
  let botStatus: "invalid" | "missing" | "ready" = "missing";
  if (!env.TGBOT_TOKEN) {
    botStatus = "missing";
  } else if (botUsername && domain && adminId) {
    botStatus = "ready";
  } else {
    try {
      const bot = dbError ? await getBotInfo(env) : await refreshBotInfo(env);
      botUsername = bot.username ?? null;
      botStatus = "ready";
    } catch {
      botStatus = "invalid";
    }
  }
  const queueReady = Boolean(env.QUEUE_NOTIFY);
  const dbReady = !dbError;
  const botReady = botStatus === "ready" && Boolean(botUsername);
  const origin = new URL(requestUrl).origin;
  return {
    adminBound: Boolean(adminId),
    botReady,
    botStatus,
    botUsername,
    db_error: dbError,
    db_ready: dbReady,
    domain,
    environmentReady: botReady && dbReady && queueReady,
    installed: Boolean(domain && adminId),
    queueError: queueReady ? null : "QUEUE_NOTIFY binding is not configured",
    queueReady,
    suggestedDomain: origin,
    webhookReady: Boolean(webhookSecret),
  };
}

export async function dashboard(env: AppEnv) {
  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const [orderStats, todayOrders, todayPaid, failedNotify, pendingNotify, paymentList, trends, recentOrders] = await Promise.all([
    all<{ status: string; count: number }>(env, "SELECT status, COUNT(*) AS count FROM orders GROUP BY status"),
    one<{ count: number }>(env, "SELECT COUNT(*) AS count FROM orders WHERE created_at >= ?", startOfDay),
    one<{ amount: number; count: number }>(env, "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM orders WHERE status = 'paid' AND paid_at >= ?", startOfDay),
    one<{ count: number }>(env, "SELECT COUNT(*) AS count FROM notify WHERE status = 'failed'"),
    one<{ count: number }>(env, "SELECT COUNT(*) AS count FROM notify WHERE status IN ('pending', 'retry')"),
    listPaymentMethods(env),
    dashboardTrends(env, startOfDay),
    listOrders(env, { limit: 5, status: "all" }),
  ]);
  const counts = Object.fromEntries(orderStats.map((row) => [row.status, row.count]));
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
    paymentHealth: paymentList.filter((payment) => payment.status !== "disabled").map(paymentMethodHealth),
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
