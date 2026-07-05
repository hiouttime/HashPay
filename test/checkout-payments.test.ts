import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOrderPayment, checkPendingPayments, confirmOrder, markPaid, selectCheckoutPayment } from "@/server/services/orders/checkout";
import { trc20Assets } from "@/shared/payments";
import type { AppEnv } from "@/server/types/env";
import type { PaymentSnapshot } from "@/shared/types/domain";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const trc20Snapshot: PaymentSnapshot = {
  address: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
  amount: 10,
  currency: "usdt",
  driver: "trc20",
};

describe("checkout payment selection", () => {
  it("bumps the payable amount when an active order already uses the same amount", async () => {
    const env = checkoutEnv();

    const snapshot = await selectCheckoutPayment(env, "new-order", "usdt", "trc20");

    expect(snapshot.amount).toBe(10.01);
    expect(JSON.parse(env.updatedPayment).amount).toBe(10.01);
  });

  it("ignores the current order amount when the same order changes payment", async () => {
    const env = checkoutEnv({
      currentPayment: trc20Snapshot,
      includeExisting: false,
    });

    const snapshot = await selectCheckoutPayment(env, "new-order", "usdt", "trc20");

    expect(snapshot.amount).toBe(10);
    expect(JSON.parse(env.updatedPayment).amount).toBe(10);
  });
});

describe("checkout payment check", () => {
  it("runs a server-side check instead of trusting browser candidates", async () => {
    const env = checkoutEnv({
      currentPayment: trc20Snapshot,
      includeExisting: false,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }))));

    await expect(checkOrderPayment(env, "new-order")).rejects.toMatchObject({ key: "errors.tx_not_found" });

    expect(env.paidOrders).toEqual(new Set());
  });

  it("rejects manual checks after the payment window expires", async () => {
    const env = checkoutEnv({
      currentPayment: trc20Snapshot,
      expired: true,
      includeExisting: false,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkOrderPayment(env, "new-order")).rejects.toMatchObject({ key: "errors.order_unavailable" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not create duplicate notifications when the paid update loses a race", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const order = orderRow("new-order", {
      callback: "https://merchant.example/callback",
      payment: JSON.stringify(trc20Snapshot),
      payway: 1,
      ts,
    });
    const inserts: string[] = [];
    const env = {
      DB: db({
        first(sql) {
          if (sql.includes("SELECT * FROM orders WHERE id = ?")) return { ...order, status: "paid" };
          return null;
        },
        run(sql) {
          if (sql.startsWith("INSERT INTO notify")) inserts.push(sql);
          if (sql.startsWith("UPDATE orders SET status = 'paid'")) return { meta: { changes: 0 } };
          return { meta: { changes: 1, last_row_id: 1 } };
        },
      }),
    } as unknown as AppEnv;

    await markPaid(env, orderFromRow(order), { txid: "tx" });

    expect(inserts).toEqual([]);
  });
});

describe("admin payment confirmation", () => {
  it("allows expired orders to be confirmed and clears review images", async () => {
    const ts = Math.floor(Date.now() / 1000) - 3600;
    const order = orderRow("expired-order", {
      payment: JSON.stringify(trc20Snapshot),
      payway: 1,
      ts,
    });
    order.expire_at = ts + 60;
    order.status = "expired";
    let paidSql = "";
    let reviewCleared = false;

    const env = {
      DB: db({
        first(sql) {
          if (sql.includes("SELECT * FROM orders WHERE id = ?")) return order;
          return null;
        },
        run(sql) {
          if (sql.startsWith("UPDATE orders SET status = 'paid'")) paidSql = sql;
          if (sql.startsWith("UPDATE review SET image = NULL")) reviewCleared = true;
          return { meta: { changes: 1, last_row_id: 1 } };
        },
      }),
    } as unknown as AppEnv;

    const payment = await confirmOrder(env, "expired-order", {});

    expect(payment.tx).toMatchObject({ confirmedBy: "admin" });
    expect(paidSql).toContain("status IN ('pending', 'expired')");
    expect(reviewCleared).toBe(true);
  });
});

describe("scheduled checkout payment checks", () => {
  it("checks pending orders once per payment channel", async () => {
    const env = scheduledCheckEnv();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        trc20Tx({ hash: "tx-a", value: "10000000" }),
        trc20Tx({ hash: "tx-b", timestamp: 121_000, value: "10010000" }),
      ],
    })));
    vi.stubGlobal("fetch", fetchMock);

    await checkPendingPayments(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(env.paidOrders).toEqual(new Set(["order-a", "order-b"]));
    expect(env.paymentChecks).toBe(1);
  });
});

function checkoutEnv(options: { currentPayment?: PaymentSnapshot; expired?: boolean; includeExisting?: boolean } = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const orders = new Map<string, Record<string, unknown>>([
    ["new-order", orderRow("new-order", {
      payment: options.currentPayment ? JSON.stringify(options.currentPayment) : "{}",
      payway: options.currentPayment ? 1 : null,
      ts: options.expired ? ts - 3600 : ts,
    })],
  ]);

  if (options.includeExisting ?? true) {
    orders.set("existing-order", orderRow("existing-order", {
      payment: JSON.stringify(trc20Snapshot),
      payway: 1,
      ts,
    }));
  }

  const env = {
    paidOrders: new Set<string>(),
    updatedPayment: "",
    DB: db({
      all(sql, values) {
        if (sql.includes("FROM payments")) return [paymentRow(ts)];
        if (sql.includes("FROM orders WHERE status = 'pending'")) {
          const [currentTime, payway, orderId] = values;
          return Array.from(orders.values())
            .filter((order) => order.status === "pending")
            .filter((order) => Number(order.expire_at) > Number(currentTime))
            .filter((order) => order.payway === payway)
            .filter((order) => order.id !== orderId)
            .map(({ id, payment }) => ({ id, payment }));
        }
        return [];
      },
      first(sql, values) {
        if (sql.includes("SELECT * FROM orders WHERE id = ?")) return orders.get(String(values[0])) ?? null;
        return null;
      },
      run(sql, values) {
        if (sql.startsWith("UPDATE orders SET payway = ?")) env.updatedPayment = String(values[1]);
        if (sql.startsWith("UPDATE orders SET status = 'paid'")) env.paidOrders.add(String(values[3]));
        return { meta: { changes: 1, last_row_id: 1 } };
      },
    }),
  } as unknown as AppEnv & { paidOrders: Set<string>; updatedPayment: string };

  return env;
}

function scheduledCheckEnv() {
  const orders = new Map<string, Record<string, unknown>>([
    ["order-a", orderRow("order-a", { amount: 20, payment: JSON.stringify({ ...trc20Snapshot, amount: 10 }), payway: 1, ts: 100 })],
    ["order-b", orderRow("order-b", { amount: 20, payment: JSON.stringify({ ...trc20Snapshot, amount: 10.01 }), payway: 1, ts: 100 })],
  ]);

  const env = {
    paidOrders: new Set<string>(),
    paymentChecks: 0,
    DB: db({
      all(sql) {
        if (sql.includes("FROM payments")) return [paymentRow(100)];
        if (sql.includes("FROM orders WHERE status = 'pending'")) return Array.from(orders.values());
        return [];
      },
      first(sql, values) {
        if (sql.includes("SELECT value FROM configs")) return null;
        if (sql.includes("SELECT * FROM orders WHERE id = ?")) return orders.get(String(values[0])) ?? null;
        return null;
      },
      run(sql, values) {
        if (sql.startsWith("UPDATE payments SET status")) env.paymentChecks += 1;
        if (sql.startsWith("UPDATE orders SET status = 'paid'")) {
          const id = String(values[3]);
          env.paidOrders.add(id);
          const order = orders.get(id);
          if (order) {
            order.status = "paid";
            order.payment = values[0];
          }
          return { meta: { changes: 1, last_row_id: 1 } };
        }
        return { meta: { changes: 1, last_row_id: 1 } };
      },
    }),
  } as unknown as AppEnv & { paidOrders: Set<string>; paymentChecks: number };

  return env;
}

function db(handlers: {
  all?: (sql: string, values: unknown[]) => unknown[];
  first?: (sql: string, values: unknown[]) => unknown;
  run?: (sql: string, values: unknown[]) => unknown;
}) {
  return {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async all() {
          return { results: handlers.all?.(sql, values) ?? [] };
        },
        async first() {
          return handlers.first?.(sql, values) ?? null;
        },
        async run() {
          return handlers.run?.(sql, values) ?? { meta: { changes: 1, last_row_id: 1 } };
        },
      };
    },
  };
}

function orderRow(id: string, input: { amount?: number; callback?: string | null; payment: string; payway: number | null; ts: number }) {
  return {
    amount: input.amount ?? 10,
    callback: input.callback ?? null,
    created_at: input.ts,
    currency: "USDT",
    description: id,
    expire_at: input.ts + 1800,
    id,
    merchant: "INLINE",
    merchant_no: id,
    paid_at: null,
    payment: input.payment,
    payway: input.payway,
    redirect_url: null,
    status: "pending",
    updated_at: input.ts,
  };
}

function orderFromRow(row: Record<string, unknown>) {
  return {
    amount: Number(row.amount),
    callback: row.callback as string | null,
    createdAt: Number(row.created_at),
    currency: String(row.currency),
    description: row.description as string | null,
    expireAt: Number(row.expire_at),
    id: String(row.id),
    merchant: String(row.merchant),
    merchantNo: String(row.merchant_no),
    paidAt: row.paid_at as number | null,
    payment: String(row.payment),
    payway: row.payway as number | null,
    redirectUrl: row.redirect_url as string | null,
    status: row.status as "pending",
    updatedAt: Number(row.updated_at),
  };
}

function paymentRow(ts: number) {
  return {
    address: trc20Snapshot.address,
    assets: JSON.stringify(["usdt"]),
    createdAt: ts,
    credentials: "{}",
    driver: "trc20",
    id: 1,
    name: "TRON",
    status: "enabled",
    updatedAt: ts,
  };
}

function trc20Tx(input: { hash: string; timestamp?: number; value: string }) {
  return {
    block_timestamp: input.timestamp ?? 120_000,
    to: trc20Snapshot.address,
    token_info: { address: trc20Assets.usdt.contract, decimals: 6, symbol: "USDT" },
    transaction_id: input.hash,
    value: input.value,
  };
}
