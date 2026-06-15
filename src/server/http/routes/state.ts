import { Hono } from "hono";
import { db, getConfig } from "@/server/db";
import { initSchemaSql, requiredColumns, requiredTables } from "@/server/db/schema";
import { getBotInfo } from "@/server/services/telegram/service";
import type { AppEnv, AppVariables } from "@/shared/types/env";

export function createStateRoutes() {
  const app = new Hono<{ Bindings: AppEnv; Variables: AppVariables }>();
  app.get("/", async (c) => {
    let domain: string | null = null;
    let adminId: string | null = null;
    let webhookSecret: string | null = null;
    let d1Error: string | null = null;
    try {
      await ensureD1Schema(c.env);
      [domain, adminId, webhookSecret] = await Promise.all([
        getConfig(c.env, "domain"),
        getConfig(c.env, "admin_id"),
        getConfig(c.env, "webhook_secret"),
      ]);
    } catch (error) {
      d1Error = error instanceof Error ? error.message : "D1 is not available";
    }
    let bot: Awaited<ReturnType<typeof getBotInfo>> | null = null;
    let botStatus: "invalid" | "missing" | "ready" = "missing";
    if (!c.env.TGBOT_TOKEN) {
      botStatus = "missing";
    } else {
      try {
        bot = await getBotInfo(c.env);
        botStatus = "ready";
      } catch (error) {
        botStatus = "invalid";
      }
    }
    const queueError = c.env.QUEUE_NOTIFY ? null : "QUEUE_NOTIFY binding is not configured";
    const d1Ready = !d1Error;
    const botReady = Boolean(bot?.username);
    const queueReady = Boolean(c.env.QUEUE_NOTIFY);
    const origin = new URL(c.req.url).origin;
    return c.json({
      adminBound: Boolean(adminId),
      botReady,
      botStatus,
      botUsername: bot?.username ?? null,
      d1Error,
      d1Ready,
      domain,
      environmentReady: botReady && d1Ready && queueReady,
      installed: Boolean(domain && adminId),
      queueError,
      queueReady,
      suggestedDomain: origin,
      webhookReady: Boolean(webhookSecret),
    });
  });
  return app;
}

async function ensureD1Schema(env: AppEnv) {
  const database = db(env);
  let existing = await listExistingTables(env);
  if (existing.size !== requiredTables.length) {
    await database.exec(initSchemaSql);
    existing = await listExistingTables(env);
  }
  const missing = requiredTables.filter((table) => !existing.has(table));
  if (missing.length) throw new Error(`D1 schema is incomplete: ${missing.join(", ")}`);
  await verifyRequiredColumns(env);
  await database.prepare("SELECT key FROM configs LIMIT 1").first();
}

async function listExistingTables(env: AppEnv) {
  const placeholders = requiredTables.map(() => "?").join(",");
  const result = await db(env)
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
    .bind(...requiredTables)
    .all<{ name: string }>();
  return new Set((result.results ?? []).map((row) => row.name));
}

async function verifyRequiredColumns(env: AppEnv) {
  for (const table of requiredTables) {
    const result = await db(env).prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const columns = new Set((result.results ?? []).map((row) => row.name));
    const missing = requiredColumns[table].filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`D1 table ${table} is missing columns: ${missing.join(", ")}`);
  }
}
