import { describe, expect, it } from "vitest";
import { checkPayment } from "@/server/payments/driver";
import { selectCheckoutPayment } from "@/server/services/orders/checkout";
import type { AppEnv } from "@/server/types/env";
import type { PaymentSnapshot } from "@/shared/types/domain";
import { trc20Assets } from "@/shared/payments";

const snapshot: PaymentSnapshot = {
  address: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
  amount: 12.5,
  currency: "usdt",
  currencyName: "USDT",
  driver: "trc20",
  network: "trc20",
  networkName: "TRC20 (TRON)",
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
  createdAt: 100,
  expireAt: 200,
  fastConfirm: false,
  snapshot,
};

describe("TRC20 payment check", () => {
  it("returns paid with txid and time when a submitted transaction matches", async () => {
    await expect(checkPayment(input)).resolves.toMatchObject({
      status: "paid",
      time: 120,
      txid: "tx",
    });
  });

  it("returns pending when the transaction is outside the order window", async () => {
    await expect(checkPayment({ ...input, createdAt: 121 })).resolves.toMatchObject({ status: "pending" });
    await expect(checkPayment({ ...input, expireAt: 119 })).resolves.toMatchObject({ status: "pending" });
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
    })).resolves.toMatchObject({ status: "pending" });
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
        review: {
          answer: "old review",
          image: "data:image/webp;base64,old",
          status: "pending",
          submittedAt: Math.floor(Date.now() / 1000),
        },
      },
      includeExisting: false,
    });

    const next = await selectCheckoutPayment(env, "new-order", "usdt", "trc20");
    const saved = JSON.parse(String(env.updatedPayment));

    expect(next.amount).toBe(10);
    expect(saved.amount).toBe(10);
    expect(saved.review).toBeUndefined();
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
        currencyName: "USDT",
        driver: "trc20",
        network: "trc20",
        networkName: "TRC20 (TRON)",
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
