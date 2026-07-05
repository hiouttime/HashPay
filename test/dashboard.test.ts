import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "@/server/types/env";

vi.mock("@/server/payments/channels", () => ({
  listPayments: vi.fn(async () => []),
  paymentHealth: vi.fn(),
}));

vi.mock("@/server/services/orders/repository", () => ({
  listOrders: vi.fn(async () => []),
  listReviewOrders: vi.fn(async () => []),
  publicOrder: vi.fn((order) => order),
}));

import { dashboard } from "@/server/services/app";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("dashboard", () => {
  it("converts paid order amounts to the admin currency before summarizing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2030-01-02T10:20:00+08:00"));

    const now = Math.floor(Date.now() / 1000);
    const configs = new Map<string, string | null>([
      ["currency", "CNY"],
      ["fast_confirm", "true"],
      ["market_rates", JSON.stringify({
        assetUSD: { BNB: 610, ETH: 3200, GRAM: 3, MATIC: 0.9, TRX: 0.12, USDC: 1, USDT: 1 },
        fiatPerUSD: { CNY: 7.2, EUR: 0.93, GBP: 0.79, TWD: 32, USD: 1 },
        syncedAt: now,
      })],
      ["rate_adjust", "2"],
      ["timeout", "5"],
    ]);
    const orders = [
      { amount: 1, created_at: now - 60, currency: "USD", paid_at: now - 30, status: "paid" },
      { amount: 72, created_at: now - 50, currency: "CNY", paid_at: now - 20, status: "paid" },
    ];

    const stats = await dashboard(env(configs, orders));
    const point = stats.trends.td.find((item) => item.paidOrders === 2);

    expect(point?.amount).toBe(79.2);
    expect(point?.orders).toBe(2);
  });
});

function env(configs: Map<string, string | null>, orders: Array<Record<string, unknown>>) {
  return {
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...args: unknown[]) {
            values = args;
            return this;
          },
          async all() {
            if (sql.includes("FROM orders WHERE created_at")) return { results: rowsByCreatedAt(orders, values) };
            if (sql.includes("FROM orders WHERE status = 'paid'")) return { results: paidRows(orders, values) };
            return { results: [] };
          },
          async first() {
            if (sql.includes("SELECT value FROM configs")) {
              const key = String(values[0]);
              return configs.has(key) ? { value: configs.get(key) } : null;
            }
            if (sql.includes("COUNT(*) AS count FROM orders WHERE status = 'pending'")) {
              return { count: orders.filter((order) => order.status === "pending").length };
            }
            return null;
          },
        };
      },
    },
  } as unknown as AppEnv;
}

function rowsByCreatedAt(orders: Array<Record<string, unknown>>, values: unknown[]) {
  const [start, bucketSize, rangeStart, rangeEnd] = values.map(Number);
  const counts = new Map<number, number>();
  for (const order of orders) {
    const createdAt = Number(order.created_at);
    if (createdAt < rangeStart || createdAt >= rangeEnd) continue;
    const bucket = Math.trunc((createdAt - start) / bucketSize);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return Array.from(counts, ([bucket, count]) => ({ bucket, count }));
}

function paidRows(orders: Array<Record<string, unknown>>, values: unknown[]) {
  const [start, bucketSize, rangeStart, rangeEnd] = values.map(Number);
  return orders
    .filter((order) => {
      const paidAt = Number(order.paid_at);
      return order.status === "paid" && paidAt >= rangeStart && paidAt < rangeEnd;
    })
    .map((order) => ({
      amount: Number(order.amount),
      bucket: Math.trunc((Number(order.paid_at) - start) / bucketSize),
      currency: String(order.currency),
    }));
}
