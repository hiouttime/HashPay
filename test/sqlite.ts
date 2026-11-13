import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { AppEnv } from "@/server/types/env";

const migrationsDir = fileURLToPath(new URL("../src/server/db/d1/migrations/", import.meta.url));

// A D1-shaped binding over real SQLite with every migration applied, so tests exercise the
// actual SQL (json_extract, RETURNING, GROUP BY) instead of string-matching fakes.
export function sqliteEnv(extra: Partial<AppEnv> = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${migrationsDir}${file}`, "utf8"));
    sqlite.prepare("INSERT INTO d1_migrations(name) VALUES(?)").run(file);
  }
  const env = {
    ...extra,
    DB: {
      async exec(sql: string) {
        sqlite.exec(sql);
        return { count: 1, duration: 0 };
      },
      prepare(sql: string) {
        let values: SQLInputValue[] = [];
        const statement = {
          bind(...args: unknown[]) {
            values = args.map(sqlValue);
            return statement;
          },
          async first() {
            return sqlite.prepare(sql).get(...values) ?? null;
          },
          async all() {
            return { results: sqlite.prepare(sql).all(...values) };
          },
          async run() {
            const result = sqlite.prepare(sql).run(...values);
            return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
          },
        };
        return statement;
      },
    },
  } as unknown as AppEnv;
  return { env, sqlite };
}

function sqlValue(value: unknown): SQLInputValue {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  return value as SQLInputValue;
}
