import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteEnv } from "./sqlite";

vi.mock("@/server/payments/channels", () => ({
  checkChannels: vi.fn(async () => ({})),
  listPayments: vi.fn(async () => []),
  paymentHealth: vi.fn(),
}));

vi.mock("@/server/services/orders/repository", () => ({
  listOrders: vi.fn(async () => []),
  listReviewOrders: vi.fn(async () => []),
  publicOrder: vi.fn((order) => order),
}));

import { checkChannels, listPayments, paymentHealth } from "@/server/payments/channels";
import { checkDashboard, dashboard } from "@/server/services/app";

beforeEach(() => {
  vi.mocked(checkChannels).mockResolvedValue({});
  vi.mocked(listPayments).mockResolvedValue([]);
  vi.mocked(paymentHealth).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("dashboard", () => {
  it("rechecks only abnormal payment channels", async () => {
    const target = env(new Map(), []);
    vi.mocked(checkChannels).mockResolvedValue({ 7: "TON API HTTP 502" });
    vi.mocked(listPayments).mockResolvedValue([{ status: "error" }] as never);
    vi.mocked(paymentHealth).mockReturnValue({
      details: "",
      driver: "ton",
      id: 7,
      name: "TON",
      network: "ton",
      status: "warn",
    });

    const stats = await checkDashboard(target);

    expect(checkChannels).toHaveBeenCalledWith(target, "error");
    expect(stats.health).toEqual([{
      details: "TON API HTTP 502",
      driver: "ton",
      id: 7,
      name: "TON",
      network: "ton",
      status: "warn",
    }]);
  });

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
  const { env, sqlite } = sqliteEnv();
  const insertConfig = sqlite.prepare("INSERT INTO configs(key, value, updated_at) VALUES(?, ?, 0)");
  for (const [key, value] of configs) insertConfig.run(key, value);
  const insertOrder = sqlite.prepare("INSERT INTO orders(id, merchant, merchant_no, status, amount, currency, expire_at, paid_at, created_at, updated_at) VALUES(?, 'INLINE', ?, ?, ?, ?, ?, ?, ?, ?)");
  orders.forEach((order, index) => {
    const createdAt = Number(order.created_at);
    insertOrder.run(`order-${index}`, `order-${index}`, String(order.status), Number(order.amount), String(order.currency), createdAt + 300, order.paid_at == null ? null : Number(order.paid_at), createdAt, createdAt);
  });
  return env;
}
