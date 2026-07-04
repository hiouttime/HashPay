import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupSession } from "@/server/services/app/setup";
import type { AppEnv, HonoEnv } from "@/server/types/env";

const mocks = vi.hoisted(() => ({
  configureBotMiniApp: vi.fn(),
  ensureDefaultBanner: vi.fn(),
  syncMarketRates: vi.fn(),
}));

vi.mock("@/server/services/app/settings", () => ({
  syncMarketRates: mocks.syncMarketRates,
}));

vi.mock("@/server/services/images/banner", () => ({
  ensureDefaultBanner: mocks.ensureDefaultBanner,
}));

vi.mock("@/server/services/telegram/api", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/telegram/api")>("@/server/services/telegram/api");
  return {
    ...actual,
    configureBotMiniApp: mocks.configureBotMiniApp,
  };
});

beforeEach(() => {
  mocks.configureBotMiniApp.mockResolvedValue(undefined);
  mocks.ensureDefaultBanner.mockResolvedValue(new Uint8Array());
  mocks.syncMarketRates.mockResolvedValue({});
});

describe("setup session", () => {
  it("syncs market rates when the admin binding completes setup", async () => {
    const app = new Hono<HonoEnv>();
    app.get("/setup", async (c) => c.json(await setupSession(c)));
    const configs = new Map<string, string | null>([
      ["admin_id", "123"],
      ["admin_user", JSON.stringify({ firstName: "Admin", id: 123, lastName: "" })],
    ]);

    const response = await app.fetch(new Request("https://hashpay.test/setup"), createEnv(configs));
    const body = await response.json<{ bound: boolean }>();

    expect(response.status).toBe(200);
    expect(body.bound).toBe(true);
    expect(mocks.ensureDefaultBanner).toHaveBeenCalledTimes(1);
    expect(mocks.syncMarketRates).toHaveBeenCalledTimes(1);
    expect(mocks.configureBotMiniApp).toHaveBeenCalledTimes(1);
    expect(configs.get("currency")).toBe("CNY");
    expect(configs.get("fast_confirm")).toBe("false");
    expect(configs.get("rate_adjust")).toBe("0");
    expect(configs.get("timeout")).toBe("5");
  });

  it("writes default settings during setup even when stale values exist", async () => {
    const app = new Hono<HonoEnv>();
    app.get("/setup", async (c) => c.json(await setupSession(c)));
    const configs = new Map<string, string | null>([
      ["admin_id", "123"],
      ["admin_user", JSON.stringify({ firstName: "Admin", id: 123, lastName: "" })],
      ["currency", "USD"],
      ["fast_confirm", "true"],
      ["rate_adjust", "20"],
      ["timeout", "15"],
    ]);

    const response = await app.fetch(new Request("https://hashpay.test/setup"), createEnv(configs));

    expect(response.status).toBe(200);
    expect(configs.get("currency")).toBe("CNY");
    expect(configs.get("fast_confirm")).toBe("false");
    expect(configs.get("rate_adjust")).toBe("0");
    expect(configs.get("timeout")).toBe("5");
  });
});

function createEnv(configs: Map<string, string | null>) {
  return {
    APP_SECRET: "test-secret",
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...args: unknown[]) {
            values = args;
            return this;
          },
          async first() {
            if (sql.includes("SELECT value FROM configs")) {
              const key = String(values[0]);
              return configs.has(key) ? { value: configs.get(key) } : null;
            }
            return null;
          },
          async run() {
            if (sql.includes("INSERT INTO configs")) configs.set(String(values[0]), values[1] as string | null);
            return {};
          },
        };
      },
      batch(statements: Array<{ run: () => Promise<unknown> }>) {
        return Promise.all(statements.map((statement) => statement.run()));
      },
    },
  } as unknown as AppEnv;
}
