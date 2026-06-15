import type { AppEnv } from "@/shared/types/env";

export function db(env: AppEnv) {
  if (!env.DB) throw new Error("DB binding is not configured");
  return env.DB;
}

export function now() {
  return Math.floor(Date.now() / 1000);
}

export function jsonParseObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function getConfig(env: AppEnv, key: string) {
  const row = await db(env)
    .prepare("SELECT value FROM configs WHERE key = ?")
    .bind(key)
    .first<{ value: string | null }>();
  return row?.value ?? null;
}

export async function getConfigBlob(env: AppEnv, key: string) {
  const row = await db(env)
    .prepare("SELECT blob_value FROM configs WHERE key = ?")
    .bind(key)
    .first<{ blob_value: ArrayBuffer | null }>();
  return row?.blob_value ?? null;
}

export async function setConfig(env: AppEnv, key: string, value: string | null, blob?: ArrayBuffer | null) {
  await db(env)
    .prepare(
      `
      INSERT INTO configs(key, value, blob_value, updated_at)
      VALUES(?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        blob_value = excluded.blob_value,
        updated_at = excluded.updated_at
      `,
    )
    .bind(key, value, blob ?? null, now())
    .run();
}

export async function deleteConfig(env: AppEnv, key: string) {
  await db(env).prepare("DELETE FROM configs WHERE key = ?").bind(key).run();
}

export async function listConfigs(env: AppEnv) {
  const result = await db(env)
    .prepare("SELECT key, value FROM configs ORDER BY key")
    .all<{ key: string; value: string | null }>();
  const out: Record<string, string> = {};
  for (const row of result.results ?? []) {
    if (row.value != null) out[row.key] = row.value;
  }
  return out;
}

export async function setConfigs(env: AppEnv, values: Record<string, string>) {
  const batch = Object.entries(values).map(([key, value]) =>
    db(env)
      .prepare(
        `
        INSERT INTO configs(key, value, updated_at)
        VALUES(?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        `,
      )
      .bind(key, value, now()),
  );
  if (batch.length) await db(env).batch(batch);
}
