import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPayment, createPayment } from "@/server/payments/driver";
import type { PaymentChannel } from "@/server/payments/channels";
import type { Order } from "@/server/services/orders/repository";
import { aptosAssets, evmAssets, tonAssets, trc20Assets } from "@/shared/payments";
import type { PaymentSnapshot } from "@/shared/types/domain";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TRC20 provider", () => {
  const snapshot = payment({ address: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2", driver: "trc20" });
  const candidate = tx({
    raw: { token_info: { address: trc20Assets.usdt.contract } },
    to: snapshot.address,
  });

  it("matches a submitted transaction inside the order window", async () => {
    await expect(check(snapshot, candidate)).resolves.toMatchObject({
      matches: [{ orderId: "order", time: 120, txid: "tx" }],
      status: "ok",
    });
  });

  it("ignores transactions outside the order window", async () => {
    await expect(check(snapshot, candidate, { createdAt: 121 })).resolves.toMatchObject({ matches: [], status: "ok" });
    await expect(check(snapshot, candidate, { expireAt: 119 })).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("rejects a submitted USDT candidate with the wrong contract", async () => {
    await expect(check(snapshot, tx({
      raw: { token_info: { address: "TFakeUsdtContract" } },
      to: snapshot.address,
    }))).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("matches multiple orders from one submitted transaction list", async () => {
    await expect(checkPayment({
      candidates: {
        candidates: [
          tx({ hash: "tx-a", raw: { token_info: { address: trc20Assets.usdt.contract } }, to: snapshot.address }),
          tx({ amount: 12.51, hash: "tx-b", raw: { token_info: { address: trc20Assets.usdt.contract } }, to: snapshot.address }),
        ],
      },
      fastConfirm: false,
      orders: [
        order(snapshot, { id: "order-a" }),
        order({ ...snapshot, amount: 12.51 }, { id: "order-b" }),
      ],
    })).resolves.toMatchObject({
      matches: [
        { orderId: "order-a", txid: "tx-a" },
        { orderId: "order-b", txid: "tx-b" },
      ],
      status: "ok",
    });
  });
});

describe("EVM provider", () => {
  const address = "0x78235da44022c614cbf25a26200cca47e2a61752";

  it("validates token contracts before marking an EVM payment as paid", async () => {
    await expect(check(
      payment({ address, amount: 2.5, driver: "bep20" }),
      tx({ amount: 2.5, hash: "0xpaid", raw: { contract: evmAssets.bep20.usdt.contract }, to: address }),
    )).resolves.toMatchObject({ matches: [{ orderId: "order", txid: "0xpaid" }], status: "ok" });
  });

  it("rejects fake EVM token contracts", async () => {
    await expect(check(
      payment({ address, amount: 2.5, driver: "bep20" }),
      tx({ amount: 2.5, hash: "0xfake", raw: { contract: "0x0000000000000000000000000000000000000000" }, to: address }),
    )).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("validates Base token contracts before marking a payment as paid", async () => {
    const snapshot = payment({ address, amount: 8.8, currency: "usdc", driver: "base" });

    await expect(check(snapshot, tx({
      amount: 8.8,
      currency: "USDC",
      hash: "0xbase-paid",
      raw: { contract: evmAssets.base.usdc.contract },
      to: address,
    }))).resolves.toMatchObject({ matches: [{ orderId: "order", txid: "0xbase-paid" }], status: "ok" });

    await expect(check(snapshot, tx({
      amount: 8.8,
      currency: "USDC",
      hash: "0xbase-fake",
      raw: { contract: evmAssets.erc20.usdc.contract },
      to: address,
    }))).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("checks BSC token payments through RPC without block timestamp calls", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (body.method === "eth_blockNumber") return json({ result: "0x64" });
      if (body.method === "eth_getLogs") return json({ result: [{ data: "0x2386f26fc10000", transactionHash: "0xbsc-paid" }] });
      return json({ result: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkPayment({
      channel: channel({ address, driver: "bep20", id: 5, name: "BSC" }),
      fastConfirm: false,
      orders: [order(payment({ address, amount: 0.01, driver: "bep20" }), {
        createdAt: now - 10,
        expireAt: now + 100,
        id: "bsc-order",
      })],
    })).resolves.toMatchObject({ matches: [{ orderId: "bsc-order", txid: "0xbsc-paid" }], status: "ok" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("TON provider", () => {
  const address = "UQDbHHVzyqDwUe1Mv8wuZvMwI9XpTsUGSvMno6znkhcEwGM3";
  const snapshot = payment({ address, amount: 3, driver: "ton" });

  it("validates the USDT jetton master before marking a TON payment as paid", async () => {
    await expect(check(snapshot, tx({
      amount: 3,
      hash: "ton-paid",
      raw: { jetton_master: tonAssets.usdt.contract },
      to: address,
    }))).resolves.toMatchObject({ matches: [{ orderId: "order", txid: "ton-paid" }], status: "ok" });
  });

  it("rejects fake TON jetton masters", async () => {
    await expect(check(snapshot, tx({
      amount: 3,
      hash: "ton-fake",
      raw: { jetton_master: "0:fake" },
      to: address,
    }))).resolves.toMatchObject({ matches: [], status: "ok" });
  });
});

describe("Aptos provider", () => {
  const address = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const snapshot = payment({ address, amount: 4.2, currency: "usdc", driver: "aptos" });

  it("validates Aptos asset metadata before marking a payment as paid", async () => {
    await expect(check(snapshot, tx({
      amount: 4.2,
      currency: "USDC",
      hash: "12345",
      raw: { asset_type: aptosAssets.usdc.contract },
      to: address,
    }))).resolves.toMatchObject({ matches: [{ orderId: "order", txid: "12345" }], status: "ok" });
  });

  it("rejects fake Aptos assets", async () => {
    await expect(check(snapshot, tx({
      amount: 4.2,
      currency: "USDC",
      hash: "12345",
      raw: { asset_type: "0xfake" },
      to: address,
    }))).resolves.toMatchObject({ matches: [], status: "ok" });
  });
});

describe("OKPay provider", () => {
  it("creates an OKPay payment link for the selected order", async () => {
    const fetchMock = vi.fn(async () => json({ data: { order_id: "ok-order", pay_url: "https://okpay.example/pay" } }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await createPayment(okpayChannel(), okpayOrder(), {
      amount: 3.5,
      currency: "usdt",
      driver: "okpay",
    });

    expect(out).toMatchObject({ out_id: "ok-order", url: "https://okpay.example/pay" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain("id=12345");
    expect(body).toContain("unique_id=okpay-order");
    expect(body).toMatch(/sign=[A-F0-9]{32}/);
  });

  it("checks OKPay order status with channel credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: { amount: "3.5", coin: "USDT", order_id: "ok-order", status: 1 } })));

    await expect(checkPayment({
      channel: okpayChannel(),
      fastConfirm: false,
      orders: [order({
        amount: 3.5,
        currency: "usdt",
        driver: "okpay",
        out_id: "ok-order",
      }, { id: "okpay-order" })],
    })).resolves.toMatchObject({ matches: [{ orderId: "okpay-order", txid: "ok-order" }], status: "ok" });
  });
});

function check(snapshot: PaymentSnapshot, candidate: Record<string, unknown>, overrides: Partial<ReturnType<typeof order>> = {}) {
  return checkPayment({
    candidates: { candidates: [candidate] },
    fastConfirm: false,
    orders: [order(snapshot, overrides)],
  });
}

function order(snapshot: PaymentSnapshot, input: Partial<{ createdAt: number; expireAt: number; id: string }> = {}) {
  return {
    createdAt: input.createdAt ?? 100,
    expireAt: input.expireAt ?? 200,
    id: input.id ?? "order",
    snapshot,
  };
}

function payment(input: Partial<PaymentSnapshot>): PaymentSnapshot {
  return {
    address: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
    amount: 12.5,
    currency: "usdt",
    driver: "trc20",
    ...input,
  };
}

function tx(input: Partial<Record<string, unknown>> = {}) {
  return {
    amount: 12.5,
    currency: "USDT",
    hash: "tx",
    raw: {},
    timestamp: 120,
    to: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
    ...input,
  };
}

function channel(input: Partial<PaymentChannel>): PaymentChannel {
  return {
    address: "address",
    assets: ["usdt"],
    createdAt: 100,
    credentials: {},
    driver: "trc20",
    id: 1,
    name: "Payment",
    status: "enabled",
    updatedAt: 100,
    ...input,
  };
}

function okpayChannel(): PaymentChannel {
  return channel({
    address: "12345",
    assets: ["usdt", "trx"],
    credentials: { key: "secret" },
    driver: "okpay",
    id: 9,
    name: "OKPay",
  });
}

function okpayOrder(): Order {
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

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}
