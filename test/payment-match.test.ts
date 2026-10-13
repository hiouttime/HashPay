import { describe, expect, it } from "vitest";
import { paymentMatches } from "@/server/payments/match";
import { fitAmount } from "@/shared/amount";
import type { PaymentSnapshot } from "@/shared/types/domain";

const tolerance = { max: 1, min: -0.1 };

describe("payment amount matching", () => {
  it("matches a unique payment inside the tolerance", () => {
    expect(matchOrders([order("a", 15)], [tx("paid", 15.05)])).toEqual([
      { amount: 15.05, orderId: "a", time: 1, txid: "paid" },
    ]);
  });

  it("does not match when two orders fall in range of one payment", () => {
    expect(matchOrders([order("a", 15), order("b", 15.01)], [tx("paid", 15.05)])).toEqual([]);
  });

  it("does not match when one order has two payments in range", () => {
    expect(matchOrders([order("a", 15)], [tx("one", 15.05), tx("two", 14.95)])).toEqual([]);
  });

  it("keeps the exact order when another order only overlaps the range", () => {
    expect(matchOrders([order("a", 15), order("b", 15.01)], [tx("paid", 15)])).toEqual([
      { amount: 15, orderId: "a", time: 1, txid: "paid" },
    ]);
  });

  it("still matches distinct exact payments", () => {
    expect(matchOrders([order("a", 15), order("b", 15.01)], [tx("a", 15), tx("b", 15.01)])).toEqual([
      { amount: 15, orderId: "a", time: 1, txid: "a" },
      { amount: 15.01, orderId: "b", time: 1, txid: "b" },
    ]);
  });

  it("ignores a payment outside the tolerance", () => {
    expect(matchOrders([order("a", 15)], [tx("paid", 16.5)])).toEqual([]);
    expect(fitAmount(16.5, 15, tolerance)).toBeNull();
  });

  it("does not apply tolerance to non-stable assets or exchange channels", () => {
    expect(matchOrders([order("a", 15, { currency: "trx" })], [tx("paid", 15.05)])).toEqual([]);
    expect(matchOrders([order("a", 15, { driver: "binance" })], [tx("paid", 15.05)])).toEqual([]);
  });
});

function matchOrders(orders: ReturnType<typeof order>[], rows: ReturnType<typeof tx>[]) {
  return paymentMatches(
    orders,
    rows,
    (_snapshot, row) => row.amount,
    (row) => ({ time: 1, txid: row.txid }),
    tolerance,
  );
}

function order(id: string, amount: number, patch: Partial<PaymentSnapshot> = {}) {
  return {
    createdAt: 1,
    expireAt: 2,
    id,
    snapshot: { address: "T", amount, currency: "usdt", driver: "trc20", ...patch } satisfies PaymentSnapshot,
  };
}

function tx(txid: string, amount: number) {
  return { amount, txid };
}
