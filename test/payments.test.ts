import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPayment, createPayment } from "@/server/payments/driver";
import type { PaymentChannel } from "@/server/payments/channels";
import { checkPendingPayments, selectCheckoutPayment } from "@/server/services/orders/checkout";
import type { AppEnv } from "@/server/types/env";
import type { PaymentSnapshot } from "@/shared/types/domain";
import { aptosAssets, evmAssets, tonAssets, trc20Assets } from "@/shared/payments";
import type { Order } from "@/server/services/orders/repository";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const snapshot: PaymentSnapshot = {
  address: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
  amount: 12.5,
  currency: "usdt",
  driver: "trc20",
};

const input = {
  candidates: {
    candidates: [{
      amount: 12.5,
      currency: "USDT",
      hash: "tx",
      raw: {
        token_info: {
          address: trc20Assets.usdt.contract,
        },
      },
      timestamp: 120,
      to: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
    }],
  },
  fastConfirm: false,
  orders: [{ createdAt: 100, expireAt: 200, id: "order", snapshot }],
};

describe("TRC20 payment check", () => {
  it("returns paid with txid and time when a submitted transaction matches", async () => {
    await expect(checkPayment(input)).resolves.toMatchObject({
      matches: [{ orderId: "order", time: 120, txid: "tx" }],
      status: "ok",
    });
  });

  it("returns pending when the transaction is outside the order window", async () => {
    await expect(checkPayment({ ...input, orders: [{ ...input.orders[0], createdAt: 121 }] })).resolves.toMatchObject({ matches: [], status: "ok" });
    await expect(checkPayment({ ...input, orders: [{ ...input.orders[0], expireAt: 119 }] })).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("rejects a submitted USDT candidate with the wrong contract", async () => {
    await expect(checkPayment({
      ...input,
      candidates: {
        candidates: [{
          amount: 12.5,
          currency: "USDT",
          hash: "tx",
          raw: {
            token_info: {
              address: "TFakeUsdtContract",
            },
          },
          timestamp: 120,
          to: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
        }],
      },
    })).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("matches multiple orders from one transaction scan", async () => {
    await expect(checkPayment({
      candidates: {
        candidates: [
          {
            amount: 12.5,
            currency: "USDT",
            hash: "tx-a",
            raw: { token_info: { address: trc20Assets.usdt.contract } },
            timestamp: 120,
            to: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
          },
          {
            amount: 12.51,
            currency: "USDT",
            hash: "tx-b",
            raw: { token_info: { address: trc20Assets.usdt.contract } },
            timestamp: 125,
            to: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
          },
        ],
      },
      fastConfirm: false,
      orders: [
        { createdAt: 100, expireAt: 200, id: "order-a", snapshot },
        { createdAt: 100, expireAt: 200, id: "order-b", snapshot: { ...snapshot, amount: 12.51 } },
      ],
    })).resolves.toMatchObject({
      matches: [
        { orderId: "order-a", txid: "tx-a" },
        { orderId: "order-b", txid: "tx-b" },
      ],
      status: "ok",
    });
  });

  it("bumps the payable amount when an active order already uses the same amount", async () => {
    const env = paymentSelectionEnv();

    const snapshot = await selectCheckoutPayment(env, "new-order", "usdt", "trc20");

    expect(snapshot.amount).toBe(10.01);
    expect(JSON.parse(String(env.updatedPayment)).amount).toBe(10.01);
  });

  it("releases the previous amount when the same order changes payment", async () => {
    const env = paymentSelectionEnv({
      currentPayment: {
        ...snapshot,
        amount: 10,
      },
      includeExisting: false,
    });

    const next = await selectCheckoutPayment(env, "new-order", "usdt", "trc20");
    const saved = JSON.parse(String(env.updatedPayment));

    expect(next.amount).toBe(10);
    expect(saved.amount).toBe(10);
  });

  it("checks pending orders once per payment channel during scheduled jobs", async () => {
    const env = pendingCheckEnv();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          block_timestamp: 120_000,
          to: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
          token_info: { address: trc20Assets.usdt.contract, decimals: 6, symbol: "USDT" },
          transaction_id: "tx-a",
          value: "10000000",
        },
        {
          block_timestamp: 121_000,
          to: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
          token_info: { address: trc20Assets.usdt.contract, decimals: 6, symbol: "USDT" },
          transaction_id: "tx-b",
          value: "10010000",
        },
      ],
    })));
    vi.stubGlobal("fetch", fetchMock);

    await checkPendingPayments(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(env.paidOrders).toEqual(new Set(["order-a", "order-b"]));
    expect(env.paymentChecks).toBe(1);
  });
});

describe("EVM payment check", () => {
  it("validates token contracts before marking an EVM payment as paid", async () => {
    await expect(checkPayment({
      candidates: {
        candidates: [{
          amount: 2.5,
          currency: "USDT",
          hash: "0xpaid",
          raw: { contract: evmAssets.bep20.usdt.contract },
          timestamp: 120,
          to: "0x78235da44022c614cbf25a26200cca47e2a61752",
        }],
      },
      fastConfirm: false,
      orders: [{
        createdAt: 100,
        expireAt: 200,
        id: "evm-order",
        snapshot: {
          address: "0x78235da44022c614cbf25a26200cca47e2a61752",
          amount: 2.5,
          currency: "usdt",
          driver: "bep20",
        },
      }],
    })).resolves.toMatchObject({ matches: [{ orderId: "evm-order", txid: "0xpaid" }], status: "ok" });
  });

  it("rejects fake EVM token contracts", async () => {
    await expect(checkPayment({
      candidates: {
        candidates: [{
          amount: 2.5,
          currency: "USDT",
          hash: "0xfake",
          raw: { contract: "0x0000000000000000000000000000000000000000" },
          timestamp: 120,
          to: "0x78235da44022c614cbf25a26200cca47e2a61752",
        }],
      },
      fastConfirm: false,
      orders: [{
        createdAt: 100,
        expireAt: 200,
        id: "evm-order",
        snapshot: {
          address: "0x78235da44022c614cbf25a26200cca47e2a61752",
          amount: 2.5,
          currency: "usdt",
          driver: "bep20",
        },
      }],
    })).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("validates Base token contracts before marking a payment as paid", async () => {
    await expect(checkPayment({
      candidates: {
        candidates: [{
          amount: 8.8,
          currency: "USDC",
          hash: "0xbase-paid",
          raw: { contract: evmAssets.base.usdc.contract },
          timestamp: 120,
          to: "0x78235da44022c614cbf25a26200cca47e2a61752",
        }],
      },
      fastConfirm: false,
      orders: [{
        createdAt: 100,
        expireAt: 200,
        id: "base-order",
        snapshot: {
          address: "0x78235da44022c614cbf25a26200cca47e2a61752",
          amount: 8.8,
          currency: "usdc",
          driver: "base",
        },
      }],
    })).resolves.toMatchObject({ matches: [{ orderId: "base-order", txid: "0xbase-paid" }], status: "ok" });

    await expect(checkPayment({
      candidates: {
        candidates: [{
          amount: 8.8,
          currency: "USDC",
          hash: "0xbase-fake",
          raw: { contract: evmAssets.erc20.usdc.contract },
          timestamp: 120,
          to: "0x78235da44022c614cbf25a26200cca47e2a61752",
        }],
      },
      fastConfirm: false,
      orders: [{
        createdAt: 100,
        expireAt: 200,
        id: "base-order",
        snapshot: {
          address: "0x78235da44022c614cbf25a26200cca47e2a61752",
          amount: 8.8,
          currency: "usdc",
          driver: "base",
        },
      }],
    })).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("checks BSC token payments without extra block timestamp requests", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (body.method === "eth_blockNumber") return new Response(JSON.stringify({ result: "0x64" }));
      if (body.method === "eth_getLogs") {
        return new Response(JSON.stringify({
          result: [{
            data: "0x2386f26fc10000",
            transactionHash: "0xbsc-paid",
          }],
        }));
      }
      return new Response(JSON.stringify({ result: null }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkPayment({
      channel: {
        address: "0x78235da44022c614cbf25a26200cca47e2a61752",
        assets: ["usdt"],
        createdAt: now,
        credentials: {},
        driver: "bep20",
        id: 5,
        name: "BSC",
        status: "enabled",
        updatedAt: now,
      },
      fastConfirm: false,
      orders: [{
        createdAt: now - 10,
        expireAt: now + 100,
        id: "bsc-order",
        snapshot: {
          address: "0x78235da44022c614cbf25a26200cca47e2a61752",
          amount: 0.01,
          currency: "usdt",
          driver: "bep20",
        },
      }],
    })).resolves.toMatchObject({ matches: [{ orderId: "bsc-order", txid: "0xbsc-paid" }], status: "ok" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("TON payment check", () => {
  it("validates the USDT jetton master before marking a TON payment as paid", async () => {
    await expect(checkPayment({
      candidates: {
        candidates: [{
          amount: 3,
          currency: "USDT",
          hash: "ton-paid",
          raw: { jetton_master: tonAssets.usdt.contract },
          timestamp: 120,
          to: "UQDbHHVzyqDwUe1Mv8wuZvMwI9XpTsUGSvMno6znkhcEwGM3",
        }],
      },
      fastConfirm: false,
      orders: [{
        createdAt: 100,
        expireAt: 200,
        id: "ton-order",
        snapshot: {
          address: "UQDbHHVzyqDwUe1Mv8wuZvMwI9XpTsUGSvMno6znkhcEwGM3",
          amount: 3,
          currency: "usdt",
          driver: "ton",
        },
      }],
    })).resolves.toMatchObject({ matches: [{ orderId: "ton-order", txid: "ton-paid" }], status: "ok" });
  });

  it("rejects fake TON jetton masters", async () => {
    await expect(checkPayment({
      candidates: {
        candidates: [{
          amount: 3,
          currency: "USDT",
          hash: "ton-fake",
          raw: { jetton_master: "0:fake" },
          timestamp: 120,
          to: "UQDbHHVzyqDwUe1Mv8wuZvMwI9XpTsUGSvMno6znkhcEwGM3",
        }],
      },
      fastConfirm: false,
      orders: [{
        createdAt: 100,
        expireAt: 200,
        id: "ton-order",
        snapshot: {
          address: "UQDbHHVzyqDwUe1Mv8wuZvMwI9XpTsUGSvMno6znkhcEwGM3",
          amount: 3,
          currency: "usdt",
          driver: "ton",
        },
      }],
    })).resolves.toMatchObject({ matches: [], status: "ok" });
  });
});

describe("Aptos payment check", () => {
  const address = "0x1111111111111111111111111111111111111111111111111111111111111111";

  it("validates Aptos asset metadata before marking a payment as paid", async () => {
    await expect(checkPayment({
      candidates: {
        candidates: [{
          amount: 4.2,
          currency: "USDC",
          hash: "12345",
          raw: { asset_type: aptosAssets.usdc.contract },
          timestamp: 120,
          to: address,
        }],
      },
      fastConfirm: false,
      orders: [{
        createdAt: 100,
        expireAt: 200,
        id: "aptos-order",
        snapshot: {
          address,
          amount: 4.2,
          currency: "usdc",
          driver: "aptos",
        },
      }],
    })).resolves.toMatchObject({ matches: [{ orderId: "aptos-order", txid: "12345" }], status: "ok" });
  });

  it("rejects fake Aptos assets", async () => {
    await expect(checkPayment({
      candidates: {
        candidates: [{
          amount: 4.2,
          currency: "USDC",
          hash: "12345",
          raw: { asset_type: "0xfake" },
          timestamp: 120,
          to: address,
        }],
      },
      fastConfirm: false,
      orders: [{
        createdAt: 100,
        expireAt: 200,
        id: "aptos-order",
        snapshot: {
          address,
          amount: 4.2,
          currency: "usdc",
          driver: "aptos",
        },
      }],
    })).resolves.toMatchObject({ matches: [], status: "ok" });
  });
});

describe("OKPay payment check", () => {
  it("creates an OKPay payment link for the selected order", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: { order_id: "ok-order", pay_url: "https://okpay.example/pay" },
    })));
    vi.stubGlobal("fetch", fetchMock);

    const payment = await createPayment(okpayChannel(), order(), {
      amount: 3.5,
      currency: "usdt",
      driver: "okpay",
    });

    expect(payment).toMatchObject({
      out_id: "ok-order",
      url: "https://okpay.example/pay",
    });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(call[1].body);
    expect(body).toContain("id=12345");
    expect(body).toContain("unique_id=okpay-order");
    expect(body).toMatch(/sign=[A-F0-9]{32}/);
  });

  it("checks OKPay order status with channel credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: { amount: "3.5", coin: "USDT", order_id: "ok-order", status: 1 },
    }))));

    await expect(checkPayment({
      channel: okpayChannel(),
      fastConfirm: false,
      orders: [{
        createdAt: 100,
        expireAt: 200,
        id: "okpay-order",
        snapshot: {
          amount: 3.5,
          currency: "usdt",
          driver: "okpay",
          out_id: "ok-order",
        },
      }],
    })).resolves.toMatchObject({ matches: [{ orderId: "okpay-order", txid: "ok-order" }], status: "ok" });
  });
});

function paymentSelectionEnv(options: { currentPayment?: PaymentSnapshot; includeExisting?: boolean } = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const includeExisting = options.includeExisting ?? true;
  const orders = new Map<string, Record<string, unknown>>([
    ["new-order", {
      amount: 10,
      callback: null,
      created_at: ts,
      currency: "USDT",
      description: "new",
      expire_at: ts + 1800,
      id: "new-order",
      merchant: "INLINE",
      merchant_no: "new-order",
      paid_at: null,
      payment: options.currentPayment ? JSON.stringify(options.currentPayment) : "{}",
      payway: options.currentPayment ? 1 : null,
      redirect_url: null,
      status: "pending",
      updated_at: ts,
    }],
  ]);
  if (includeExisting) {
    orders.set("existing-order", {
      amount: 10,
      callback: null,
      created_at: ts,
      currency: "USDT",
      description: "existing",
      expire_at: ts + 1800,
      id: "existing-order",
      merchant: "INLINE",
      merchant_no: "existing-order",
      paid_at: null,
      payment: JSON.stringify({
        address: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
        amount: 10,
        currency: "usdt",
        driver: "trc20",
      }),
      payway: 1,
      redirect_url: null,
      status: "pending",
      updated_at: ts,
    });
  }
  const payments = [{
    address: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
    assets: JSON.stringify(["usdt"]),
    createdAt: ts,
    credentials: "{}",
    driver: "trc20",
    id: 1,
    name: "TRON",
    status: "enabled",
    updatedAt: ts,
  }];
  const env = {
    updatedPayment: "",
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...args: unknown[]) {
            values = args;
            return this;
          },
          async all() {
            if (sql.includes("FROM payments")) return { results: payments };
            if (sql.includes("FROM orders WHERE status = 'pending'")) {
              const [currentTime, payway, orderId] = values;
              return {
                results: Array.from(orders.values())
                  .filter((order) => order.status === "pending")
                  .filter((order) => Number(order.expire_at) > Number(currentTime))
                  .filter((order) => order.payway === payway)
                  .filter((order) => order.id !== orderId)
                  .map((order) => ({
                    id: order.id,
                    payment: order.payment,
                  })),
              };
            }
            return { results: [] };
          },
          async first() {
            if (sql.includes("SELECT * FROM orders WHERE id = ?")) return orders.get(String(values[0])) ?? null;
            return null;
          },
          async run() {
            if (sql.startsWith("UPDATE orders SET payway = ?")) {
              env.updatedPayment = String(values[1]);
            }
            return { meta: { last_row_id: 1 } };
          },
        };
      },
    },
  } as unknown as AppEnv & { updatedPayment: string };
  return env;
}

function pendingCheckEnv() {
  const orders = new Map<string, Record<string, unknown>>([
    ["order-a", pendingOrder("order-a", 10)],
    ["order-b", pendingOrder("order-b", 10.01)],
  ]);
  const payments = [{
    address: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
    assets: JSON.stringify(["usdt"]),
    createdAt: 100,
    credentials: "{}",
    driver: "trc20",
    id: 1,
    name: "TRON",
    status: "enabled",
    updatedAt: 100,
  }];
  const env = {
    paidOrders: new Set<string>(),
    paymentChecks: 0,
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...args: unknown[]) {
            values = args;
            return this;
          },
          async all() {
            if (sql.includes("FROM payments")) return { results: payments };
            if (sql.includes("FROM orders WHERE status = 'pending'")) return { results: Array.from(orders.values()) };
            return { results: [] };
          },
          async first() {
            if (sql.includes("SELECT value FROM configs")) return null;
            if (sql.includes("SELECT * FROM orders WHERE id = ?")) return orders.get(String(values[0])) ?? null;
            return null;
          },
          async run() {
            if (sql.startsWith("UPDATE payments SET status")) env.paymentChecks += 1;
            if (sql.startsWith("UPDATE orders SET status = 'paid'")) {
              const id = String(values[3]);
              env.paidOrders.add(id);
              const order = orders.get(id);
              if (order) {
                order.status = "paid";
                order.payment = values[0];
              }
            }
            return { meta: { last_row_id: 1 } };
          },
        };
      },
    },
  } as unknown as AppEnv & { paidOrders: Set<string>; paymentChecks: number };
  return env;
}

function pendingOrder(id: string, amount: number) {
  return {
    amount: 20,
    callback: null,
    created_at: 100,
    currency: "CNY",
    description: id,
    expire_at: 200,
    id,
    merchant: "INLINE",
    merchant_no: id,
    paid_at: null,
    payment: JSON.stringify({ ...snapshot, amount }),
    payway: 1,
    redirect_url: null,
    status: "pending",
    updated_at: 100,
  };
}

function okpayChannel(): PaymentChannel {
  return {
    address: "12345",
    assets: ["usdt", "trx"],
    createdAt: 100,
    credentials: { key: "secret" },
    driver: "okpay",
    id: 9,
    name: "OKPay",
    status: "enabled",
    updatedAt: 100,
  };
}

function order(): Order {
  return {
    amount: 20,
    callback: null,
    createdAt: 100,
    currency: "CNY",
    description: "OKPay test",
    expireAt: 200,
    id: "okpay-order",
    merchant: "merchant",
    merchantNo: "merchant-order",
    paidAt: null,
    payment: "{}",
    payway: 9,
    redirectUrl: "https://merchant.example/return",
    status: "pending",
    updatedAt: 100,
  };
}
