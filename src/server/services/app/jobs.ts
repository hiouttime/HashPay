import { migrateD1 } from "@/server/db/migrations";
import { checkPendingPayments } from "@/server/services/orders/checkout";
import { deliverNotify, dueNotifyIds, expireOrders } from "@/server/services/orders/notifications";
import { syncMarketRates } from "@/server/services/app/settings";
import type { AppEnv } from "@/server/types/env";

export async function runScheduledJobs(env: AppEnv) {
  await migrateD1(env);
  await syncMarketRates(env).catch(() => undefined);
  await expireOrders(env);
  await checkPendingPayments(env);
  for (const notifyId of await dueNotifyIds(env)) {
    await env.QUEUE_NOTIFY?.send({ notifyId });
  }
}

export async function handleNotifyQueue(batch: MessageBatch<unknown>, env: AppEnv) {
  await migrateD1(env);
  for (const message of batch.messages) {
    const body = message.body && typeof message.body === "object" ? (message.body as Record<string, unknown>) : {};
    const notifyId = Number(body.notifyId);
    if (!Number.isFinite(notifyId)) {
      message.ack();
      continue;
    }
    try {
      await deliverNotify(env, notifyId);
      message.ack();
    } catch {
      message.retry({ delaySeconds: 60 });
    }
  }
}
