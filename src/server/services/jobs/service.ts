import { db, now } from "@/server/db";
import { checkOrderPayment, expireOrders, pendingTronOrders } from "@/server/services/orders/service";
import { syncMarketRates } from "@/server/services/rates";
import type { AppEnv } from "@/shared/types/env";

export async function runScheduledJobs(env: AppEnv) {
  await syncMarketRates(env).catch(() => undefined);
  await expireOrders(env);
  const orders = await pendingTronOrders(env);
  for (const order of orders) {
    await checkOrderPayment(env, order.id, "cron").catch(() => undefined);
  }
  const due = await db(env)
    .prepare("SELECT id FROM notify WHERE status IN ('pending', 'retry') AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT 20")
    .bind(now())
    .all<{ id: number }>();
  for (const item of due.results ?? []) {
    await env.QUEUE_NOTIFY?.send({ notifyId: item.id });
  }
}

export async function handleNotifyQueue(batch: MessageBatch<unknown>, env: AppEnv) {
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

async function deliverNotify(env: AppEnv, id: number) {
  const row = await db(env)
    .prepare(
      `
      SELECT n.*, o.callback_url
      FROM notify n
      JOIN orders o ON o.id = n.order_id
      WHERE n.id = ?
      `,
    )
    .bind(id)
    .first<{ attempts: number; callback_url: string | null; payload_json: string; status: string }>();
  if (!row || row.status === "done") return;
  if (!row.callback_url) {
    await db(env).prepare("UPDATE notify SET status = 'done', updated_at = ? WHERE id = ?").bind(now(), id).run();
    return;
  }
  const response = await fetch(row.callback_url, {
    body: row.payload_json,
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const attempts = row.attempts + 1;
    const failed = attempts >= 8;
    await db(env)
      .prepare("UPDATE notify SET status = ?, attempts = ?, next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?")
      .bind(failed ? "failed" : "retry", attempts, now() + attempts * 60, `HTTP ${response.status}`, now(), id)
      .run();
    throw new Error(`notify ${id} failed`);
  }
  await db(env)
    .prepare("UPDATE notify SET status = 'done', attempts = attempts + 1, updated_at = ? WHERE id = ?")
    .bind(now(), id)
    .run();
}
