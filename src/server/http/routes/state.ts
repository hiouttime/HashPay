import { Hono } from "hono";
import { db, getConfig } from "@/server/db";
import { initSchemaSql, migrationSql, requiredColumns, requiredTables } from "@/server/db/schema";
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
  await database.exec(migrationSql).catch(() => undefined);
  await ensureKnownColumnMigrations(env);
  const missing = requiredTables.filter((table) => !existing.has(table));
  if (missing.length) throw new Error(`D1 schema is incomplete: ${missing.join(", ")}`);
  await verifyRequiredColumns(env);
  await database.prepare("SELECT key FROM configs LIMIT 1").first();
}

async function ensureKnownColumnMigrations(env: AppEnv) {
  const merchantColumns = await tableColumns(env, "merchants");
  if (!merchantColumns.has("public_key") || merchantColumns.has("api_key_hash") || merchantColumns.has("api_key_prefix")) await rebuildMerchantsTable(env, merchantColumns);
  const orderColumns = await tableColumns(env, "orders");
  if (!orderColumns.has("description")) {
    await db(env).prepare("ALTER TABLE orders ADD COLUMN description TEXT").run();
  }
  await db(env)
    .prepare("UPDATE orders SET description = 'Telegram 内收款' WHERE source = 'telegram_inline' AND (description IS NULL OR description = '')")
    .run();
}

async function rebuildMerchantsTable(env: AppEnv, columns: Set<string>) {
  const typeExpr = columns.has("type") ? "COALESCE(type, 'website')" : "'website'";
  await db(env).batch([
    db(env).prepare(`
      CREATE TABLE IF NOT EXISTS merchants_next (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'website',
        name TEXT NOT NULL,
        public_key TEXT NOT NULL DEFAULT '',
        callback_url TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    db(env).prepare(`
      INSERT OR REPLACE INTO merchants_next(id, type, name, public_key, callback_url, status, created_at, updated_at)
      SELECT id, ${typeExpr}, name, '', callback_url, status, created_at, updated_at FROM merchants
    `),
    db(env).prepare("DROP TABLE merchants"),
    db(env).prepare("ALTER TABLE merchants_next RENAME TO merchants"),
  ]);
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
    const columns = await tableColumns(env, table);
    const missing = requiredColumns[table].filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`D1 table ${table} is missing columns: ${missing.join(", ")}`);
  }
}

async function tableColumns(env: AppEnv, table: (typeof requiredTables)[number]) {
  const result = await db(env).prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set((result.results ?? []).map((row) => row.name));
}
