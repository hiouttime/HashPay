import { describe, expect, it } from "vitest";
import { createTelegramOrder } from "@/server/services/orders/create";
import { publicOrder } from "@/server/services/orders/repository";
import type { AppEnv } from "@/server/types/env";

describe("Telegram inline orders", () => {
  it("uses timestamp as the internal merchant number", async () => {
    const env = telegramEnv();

    const result = await createTelegramOrder(env, {
      amount: 12,
      currency: "USDT",
      description: "Telegram inline payment",
      timestamp: "mabc123",
    });

    expect(result.order).toMatchObject({
      merchant: "INLINE",
      merchantNo: "mabc123",
    });
    expect(env.inserted?.merchant_no).toBe("mabc123");
    expect(publicOrder(result.order).merchantNo).toBe("");
  });
});

function telegramEnv() {
  const configs = new Map<string, string | null>([
    ["timeout", "5"],
    ["currency", "CNY"],
    ["rate_adjust", "0"],
    ["fast_confirm", "false"],
  ]);
  const env = {
    inserted: null as Record<string, unknown> | null,
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
              return { value: configs.get(String(values[0])) ?? null };
            }
            return null;
          },
          async run() {
            if (sql.startsWith("INSERT INTO orders")) {
              env.inserted = {
                amount: values[5],
                merchant: values[1],
                merchant_no: values[2],
              };
            }
            return { meta: { last_row_id: 1 } };
          },
        };
      },
    },
  } as unknown as AppEnv & { inserted: Record<string, unknown> | null };
  return env;
}
