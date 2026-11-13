import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { errorBody, rateLimit } from "@/server/http/api";
import { confirmLoginPin, consumeLoginPin, createLoginChallenge } from "@/server/services/auth/pin";
import { signSession, verifySession } from "@/server/services/auth/session";
import type { AppEnv, HonoEnv } from "@/server/types/env";

// Real SQLite so the PIN SQL (json_extract, RETURNING) is exercised as D1 would run it.
function testEnv() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE configs (key TEXT PRIMARY KEY, value TEXT, blob BLOB, updated_at INTEGER NOT NULL)");
  return {
    APP_SECRET: "test-secret",
    DB: {
      prepare(sql: string) {
        let values: Array<string | number | null> = [];
        return {
          bind(...args: Array<string | number | null>) {
            values = args;
            return this;
          },
          async first() {
            return sqlite.prepare(sql).get(...values) ?? null;
          },
          async run() {
            const result = sqlite.prepare(sql).run(...values);
            return { meta: { changes: Number(result.changes) } };
          },
        };
      },
    },
  } as unknown as AppEnv;
}

describe("jwt session", () => {
  it("signs and verifies telegram user", async () => {
    const env = { APP_SECRET: "test-secret" } as AppEnv;
    const token = await signSession(env, { firstName: "Admin", id: 123, lastName: "User" });
    await expect(verifySession(env, token)).resolves.toMatchObject({ firstName: "Admin", id: 123, lastName: "User" });
  });

  it("rejects a tampered or foreign token as an invalid session, not an internal error", async () => {
    const env = { APP_SECRET: "test-secret" } as AppEnv;
    const token = await signSession({ APP_SECRET: "another-secret" } as AppEnv, { firstName: "Admin", id: 123, lastName: "User" });
    await expect(verifySession(env, token)).rejects.toMatchObject({ key: "errors.session_invalid", status: 401 });
    await expect(verifySession(env, "not-a-jwt")).rejects.toMatchObject({ key: "errors.session_invalid", status: 401 });
  });
});

describe("web login pin", () => {
  it("only authenticates after bot confirmation and consumes once", async () => {
    const env = testEnv();
    const { challenge, command } = await createLoginChallenge(env, "123456");

    expect(command).toBe("/login 123456");
    await expect(consumeLoginPin(env, "123456", challenge)).resolves.toBeNull();

    await confirmLoginPin(env, "123456", { firstName: "Admin", id: 123, lastName: "" });
    await expect(consumeLoginPin(env, "123456", challenge)).resolves.toMatchObject({ firstName: "Admin", id: 123 });
    await expect(consumeLoginPin(env, "123456", challenge)).resolves.toBeNull();
  });

  it("keeps the confirmed PIN usable after wrong guesses", async () => {
    const env = testEnv();
    const { challenge } = await createLoginChallenge(env, "123456");
    await confirmLoginPin(env, "123456", { firstName: "Admin", id: 123, lastName: "" });

    for (let guess = 0; guess < 5; guess += 1) {
      const pin = String(100000 + guess);
      const attempt = await createLoginChallenge(env, pin);
      await expect(consumeLoginPin(env, pin, attempt.challenge)).resolves.toBeNull();
    }

    await expect(consumeLoginPin(env, "123456", challenge)).resolves.toMatchObject({ id: 123 });
  });

  it("limits PIN requests per client IP without touching the PIN record", async () => {
    const env = { ...testEnv(), RATE_LIMIT: { limit: async ({ key }: { key: string }) => (keys.push(key), { success: keys.length <= 1 }) } };
    const keys: string[] = [];
    const app = new Hono<HonoEnv>();
    app.onError((error, c) => {
      const { body, status } = errorBody(error);
      return c.json(body, status as never);
    });
    app.use("*", rateLimit("login"));
    app.get("/", (c) => c.json({ ok: true }));

    const headers = { "cf-connecting-ip": "2001:db8:1:2:3:4:5:6" };
    await expect(app.request("/", { headers }, env).then((r) => r.status)).resolves.toBe(200);
    await expect(app.request("/", { headers }, env).then((r) => r.status)).resolves.toBe(429);
    expect(keys).toEqual(["login:2001:db8:1:2", "login:2001:db8:1:2"]);
  });
});
