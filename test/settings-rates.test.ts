import { afterEach, describe, expect, it, vi } from "vitest";
import { convertAmountWithContext, currentMarketRates, syncMarketRates } from "@/server/services/app/settings";
import type { AppEnv } from "@/server/types/env";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("market rates", () => {
  it("syncs fiat rates and keeps stablecoins fixed at 1 USD", async () => {
    const syncedAt = Math.floor(Date.parse("2026-07-04T06:00:00Z") / 1000);
    vi.useFakeTimers();
    vi.setSystemTime(syncedAt * 1000);
    const configs = new Map<string, string | null>();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("open.er-api.com")) {
        return jsonResponse({
          rates: { CNY: 7.18, EUR: 0.91, GBP: 0.78, TWD: 31.5 },
          result: "success",
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const rates = await syncMarketRates(createEnv(configs));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rates.fiatPerUSD.CNY).toBe(7.18);
    expect(convertAmountWithContext(71.8, "CNY", "USDT", context(rates))).toBe(10);
    expect(convertAmountWithContext(71.8, "CNY", "USDC", context(rates))).toBe(10);
    expect(JSON.parse(configs.get("market_rates") || "{}")).toEqual({
      fiatPerUSD: { CNY: 7.18, EUR: 0.91, GBP: 0.78, TWD: 31.5, USD: 1 },
      syncedAt,
    });

    await expect(currentMarketRates(createEnv(configs))).resolves.toMatchObject({
      syncedAt,
    });
  });

  it("does not mark default rates as freshly synced when the fiat API fails", async () => {
    const configs = new Map<string, string | null>();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network failed"));

    const rates = await syncMarketRates(createEnv(configs));

    expect(rates.messageKey).toBe("settings.rate_error_fiat");
    expect(rates.fiatPerUSD.CNY).toBe(7.2);
    await expect(currentMarketRates(createEnv(configs))).resolves.toMatchObject({
      messageKey: "settings.rate_error_fiat",
      syncedAt: 0,
    });
  });

  it("keeps the last successful fiat rate when a later sync fails", async () => {
    const configs = new Map<string, string | null>([
      ["market_rates", JSON.stringify({
        fiatPerUSD: { CNY: 6.8, EUR: 0.9, GBP: 0.77, TWD: 31, USD: 1 },
        syncedAt: 1_783_148_400,
      })],
    ]);
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-04T08:00:00Z"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network failed"));

    const rates = await syncMarketRates(createEnv(configs));

    expect(rates.messageKey).toBe("settings.rate_error_fiat");
    expect(rates.fiatPerUSD.CNY).toBe(6.8);
    expect(rates.syncedAt).toBe(1_783_148_400);
    await expect(currentMarketRates(createEnv(configs))).resolves.toMatchObject({
      messageKey: "settings.rate_error_fiat",
      syncedAt: 1_783_148_400,
    });
  });

});

function createEnv(configs: Map<string, string | null>) {
  return {
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
    },
  } as unknown as AppEnv;
}

function context(rates: Awaited<ReturnType<typeof syncMarketRates>>) {
  return {
    rateAdjust: 0,
    rates,
    settings: {
      currency: "CNY",
      fastConfirm: true,
      rateAdjust: 0,
      timeout: 5,
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
