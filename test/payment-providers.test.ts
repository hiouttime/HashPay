import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPayment, createPayment } from "@/server/payments/driver";
import { validate as validateBinance } from "@/server/payments/providers/binance";
import { validate as validateOkx } from "@/server/payments/providers/okx";
import type { PaymentChannel } from "@/server/payments/channels";
import type { Order } from "@/server/services/orders/repository";
import { aptosAssets, evmAssets, tonAssets, trc20Assets } from "@/shared/payments";
import type { PaymentSnapshot } from "@/shared/types/domain";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TRC20 provider", () => {
  const snapshot = payment({ address: "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2", driver: "trc20" });

  it("matches a chain transaction inside the order window", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [trc20Tx({ to: snapshot.address })] })));

    await expect(checkPayment({
      channel: channel({ address: snapshot.address, driver: "trc20" }),
      fastConfirm: false,
      orders: [order(snapshot)],
    })).resolves.toMatchObject({
      matches: [{ orderId: "order", time: 120, txid: "tx" }],
      status: "ok",
    });
  });

  it("ignores transactions outside the order window", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [trc20Tx({ to: snapshot.address })] })));

    await expect(checkPayment({
      channel: channel({ address: snapshot.address, driver: "trc20" }),
      fastConfirm: false,
      orders: [order(snapshot, { createdAt: 121 })],
    })).resolves.toMatchObject({ matches: [], status: "ok" });

    await expect(checkPayment({
      channel: channel({ address: snapshot.address, driver: "trc20" }),
      fastConfirm: false,
      orders: [order(snapshot, { expireAt: 119 })],
    })).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("rejects a chain USDT transfer with the wrong contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [trc20Tx({ contract: "TFakeUsdtContract", to: snapshot.address })] })));

    await expect(checkPayment({
      channel: channel({ address: snapshot.address, driver: "trc20" }),
      fastConfirm: false,
      orders: [order(snapshot)],
    })).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("matches multiple orders from one chain scan", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      data: [
        trc20Tx({ hash: "tx-a", to: snapshot.address }),
        trc20Tx({ hash: "tx-b", to: snapshot.address, value: "12510000" }),
      ],
    })));

    await expect(checkPayment({
      channel: channel({ address: snapshot.address, driver: "trc20" }),
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
    const snapshot = payment({ address, amount: 2.5, currency: "usdc", driver: "base" });
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [evmTokenTx({ address, contract: evmAssets.base.usdc.contract, hash: "0xpaid", value: "2500000" })] })));

    await expect(checkPayment({
      channel: channel({ address, driver: "base" }),
      fastConfirm: false,
      orders: [order(snapshot)],
    })).resolves.toMatchObject({ matches: [{ orderId: "order", txid: "0xpaid" }], status: "ok" });
  });

  it("rejects fake EVM token contracts", async () => {
    const snapshot = payment({ address, amount: 2.5, currency: "usdc", driver: "base" });
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [evmTokenTx({ address, contract: evmAssets.erc20.usdc.contract, hash: "0xfake", value: "2500000" })] })));

    await expect(checkPayment({
      channel: channel({ address, driver: "base" }),
      fastConfirm: false,
      orders: [order(snapshot)],
    })).resolves.toMatchObject({ matches: [], status: "ok" });
  });

  it("validates Base token contracts before marking a payment as paid", async () => {
    const snapshot = payment({ address, amount: 8.8, currency: "usdc", driver: "base" });
    vi.stubGlobal("fetch", vi.fn(async () => json({
      items: [
        evmTokenTx({ address, contract: evmAssets.base.usdc.contract, hash: "0xbase-paid", value: "8800000" }),
        evmTokenTx({ address, contract: evmAssets.erc20.usdc.contract, hash: "0xbase-fake", value: "8800000" }),
      ],
    })));

    await expect(checkPayment({
      channel: channel({ address, driver: "base" }),
      fastConfirm: false,
      orders: [order(snapshot)],
    })).resolves.toMatchObject({ matches: [{ orderId: "order", txid: "0xbase-paid" }], status: "ok" });
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
    vi.stubGlobal("fetch", vi.fn(async () => json({ jetton_transfers: [tonJettonTx({ hash: "ton-paid" })] })));

    await expect(checkPayment({
      channel: channel({ address, driver: "ton" }),
      fastConfirm: false,
      orders: [order(snapshot)],
    })).resolves.toMatchObject({ matches: [{ orderId: "order", txid: "ton-paid" }], status: "ok" });
  });

  it("rejects fake TON jetton masters", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ jetton_transfers: [tonJettonTx({ hash: "ton-fake", master: "0:fake" })] })));

    await expect(checkPayment({
      channel: channel({ address, driver: "ton" }),
      fastConfirm: false,
      orders: [order(snapshot)],
    })).resolves.toMatchObject({ matches: [], status: "ok" });
  });
});

describe("Aptos provider", () => {
  const address = "0x1111111111111111111111111111111111111111111111111111111111111111";
  const snapshot = payment({ address, amount: 4.2, currency: "usdc", driver: "aptos" });

  it("validates Aptos asset metadata before marking a payment as paid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: { fungible_asset_activities: [aptosTx({ address })] } })));

    await expect(checkPayment({
      channel: channel({ address, driver: "aptos" }),
      fastConfirm: false,
      orders: [order(snapshot)],
    })).resolves.toMatchObject({ matches: [{ orderId: "order", txid: "12345" }], status: "ok" });
  });

  it("rejects fake Aptos assets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: { fungible_asset_activities: [aptosTx({ address, asset: "0xfake" })] } })));

    await expect(checkPayment({
      channel: channel({ address, driver: "aptos" }),
      fastConfirm: false,
      orders: [order(snapshot)],
    })).resolves.toMatchObject({ matches: [], status: "ok" });
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

describe("Binance Pay provider", () => {
  it("validates Binance ID with the API key pair", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const fetchMock = vi.fn(async () => json({ uid: 34355667 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateBinance({
      address: "34355667",
      data: { apiKey: "api-key", secretKey: "secret-key" },
    })).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/v3/account");
    expect(url).toContain("timestamp=1800000000000");
    expect(url).toMatch(/signature=[a-f0-9]{64}/);
    expect((init.headers as Record<string, string>)["X-MBX-APIKEY"]).toBe("api-key");
  });

  it("rejects Binance ID mismatches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ uid: 34355667 })));

    await expect(validateBinance({
      address: "999999",
      data: { apiKey: "api-key", secretKey: "secret-key" },
    })).rejects.toMatchObject({
      key: "errors.payment_account_id_invalid",
      params: { detail: "API 返回账户ID 34355667，与填写的 999999 不一致" },
      status: 400,
    });
  });

  it("reports Binance API failures with the platform reason", async () => {
    const reason = "Invalid API-key, IP, or permissions for action. Please check API restrictions, read permission, and server IP allowlist before retrying.";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ code: -2015, msg: reason }),
      { headers: { "content-type": "application/json" }, status: 401 },
    )));

    await expect(validateBinance({
      address: "34355667",
      data: { apiKey: "api-key", secretKey: "secret-key" },
    })).rejects.toMatchObject({
      key: "errors.payment_api_credential_invalid",
      params: { detail: `-2015 ${reason}` },
      status: 400,
    });
  });

  it("reports Binance account responses without a UID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({})));

    await expect(validateBinance({
      address: "34355667",
      data: { apiKey: "api-key", secretKey: "secret-key" },
    })).rejects.toMatchObject({
      key: "errors.payment_account_id_invalid",
      params: { detail: "Binance API 返回中没有账户ID" },
      status: 400,
    });
  });

  it("matches payments received by Binance ID", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const fetchMock = vi.fn(async () => json({
      code: "000000",
      data: [{
        fundsDetail: [{ amount: "12.5", currency: "USDT" }],
        receiverInfo: { binanceId: "34355667" },
        transactionId: "binance-tx",
        transactionTime: 1_800_000_120_000,
      }],
      success: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkPayment({
      channel: binanceChannel(),
      fastConfirm: false,
      orders: [order(payment({ address: "34355667", driver: "binance" }), {
        createdAt: 1_800_000_000,
        expireAt: 1_800_000_300,
        id: "binance-order",
      })],
    })).resolves.toMatchObject({
      matches: [{ orderId: "binance-order", time: 1_800_000_120, txid: "binance-tx" }],
      status: "ok",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/sapi/v1/pay/transactions");
    expect(url).toContain("startTime=1800000000000");
    expect(url).toContain("endTime=1800000300000");
    expect(url).toContain("timestamp=1800000000000");
    expect(url).toMatch(/signature=[a-f0-9]{64}/);
    expect((init.headers as Record<string, string>)["X-MBX-APIKEY"]).toBe("api-key");
  });

  it("ignores rows with a different Binance ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      code: "000000",
      data: [
        {
          amount: "12.5",
          currency: "USDT",
          receiverInfo: { binanceId: "999999" },
          transactionId: "wrong-receiver",
          transactionTime: 120,
        },
        {
          amount: "12.5",
          currency: "USDT",
          receiverInfo: { binanceId: "34355667" },
          transactionId: "binance-id-tx",
          transactionTime: 120,
        },
      ],
      success: true,
    })));

    await expect(checkPayment({
      channel: binanceChannel(),
      fastConfirm: false,
      orders: [order(payment({ address: "34355667", driver: "binance" }))],
    })).resolves.toMatchObject({
      matches: [{ orderId: "order", time: 120, txid: "binance-id-tx" }],
      status: "ok",
    });
  });
});

describe("OKX provider", () => {
  it("validates OKX UID with the API key pair", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const fetchMock = vi.fn(async () => json({ code: "0", data: [{ uid: "888777" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateOkx({
      address: "888777",
      data: { apiKey: "api-key", passphrase: "passphrase", secretKey: "secret-key" },
    })).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://www.okx.com/api/v5/account/config");
    expect(headers["OK-ACCESS-KEY"]).toBe("api-key");
    expect(headers["OK-ACCESS-PASSPHRASE"]).toBe("passphrase");
    expect(headers["OK-ACCESS-TIMESTAMP"]).toBe("2027-01-15T08:00:00.000Z");
    expect(headers["OK-ACCESS-SIGN"]).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("rejects OKX UID mismatches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: "0", data: [{ uid: "888777" }] })));

    await expect(validateOkx({
      address: "999999",
      data: { apiKey: "api-key", passphrase: "passphrase", secretKey: "secret-key" },
    })).rejects.toMatchObject({
      key: "errors.payment_account_id_invalid",
      params: { detail: "API 返回账户ID 888777，与填写的 999999 不一致" },
      status: 400,
    });
  });

  it("reports OKX API failures with the platform reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: "50113", msg: "Invalid signature" })));

    await expect(validateOkx({
      address: "888777",
      data: { apiKey: "api-key", passphrase: "passphrase", secretKey: "secret-key" },
    })).rejects.toMatchObject({
      key: "errors.payment_api_credential_invalid",
      params: { detail: "50113 Invalid signature" },
      status: 400,
    });
  });

  it("reports OKX account responses without a UID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: "0", data: [{}] })));

    await expect(validateOkx({
      address: "888777",
      data: { apiKey: "api-key", passphrase: "passphrase", secretKey: "secret-key" },
    })).rejects.toMatchObject({
      key: "errors.payment_account_id_invalid",
      params: { detail: "OKX API 返回中没有账户ID" },
      status: 400,
    });
  });

  it("matches OKX internal receive bills by amount, currency, and time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const fetchMock = vi.fn(async () => json({
      code: "0",
      data: [{
        balChg: "12.5",
        billId: "okx-bill",
        ccy: "USDT",
        ts: "1800000120000",
        type: "72",
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkPayment({
      channel: okxChannel(),
      fastConfirm: false,
      orders: [order(payment({ address: "888777", driver: "okx" }), {
        createdAt: 1_800_000_000,
        expireAt: 1_800_000_300,
        id: "okx-order",
      })],
    })).resolves.toMatchObject({
      matches: [{ orderId: "okx-order", time: 1_800_000_120, txid: "okx-bill" }],
      status: "ok",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.okx.com/api/v5/asset/bills?ccy=USDT&limit=100&type=72");
    expect((init.headers as Record<string, string>)["OK-ACCESS-KEY"]).toBe("api-key");
  });

  it("ignores OKX bills outside the order match", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      code: "0",
      data: [
        { balChg: "12.5", billId: "wrong-currency", ccy: "USDC", ts: "120", type: "72" },
        { balChg: "-12.5", billId: "negative", ccy: "USDT", ts: "120", type: "72" },
        { balChg: "12.5", billId: "wrong-type", ccy: "USDT", ts: "120", type: "73" },
        { balChg: "12.5", billId: "okx-match", ccy: "USDT", ts: "120", type: "72" },
      ],
    })));

    await expect(checkPayment({
      channel: okxChannel(),
      fastConfirm: false,
      orders: [order(payment({ address: "888777", driver: "okx" }))],
    })).resolves.toMatchObject({
      matches: [{ orderId: "order", time: 120, txid: "okx-match" }],
      status: "ok",
    });
  });
});

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

function trc20Tx(input: Partial<{ contract: string; hash: string; timestamp: number; to: string; value: string }> = {}) {
  return {
    block_timestamp: (input.timestamp ?? 120) * 1000,
    to: input.to ?? "TY1ykSFu8N4mZgxsJABLGdhcs91h1N2qR2",
    token_info: { address: input.contract ?? trc20Assets.usdt.contract, decimals: 6, symbol: "USDT" },
    transaction_id: input.hash ?? "tx",
    value: input.value ?? "12500000",
  };
}

function evmTokenTx(input: { address: string; contract: string; hash: string; value: string }) {
  return {
    timestamp: "1970-01-01T00:02:00Z",
    to: { hash: input.address },
    token: { address_hash: input.contract },
    total: { value: input.value },
    transaction_hash: input.hash,
  };
}

function tonJettonTx(input: Partial<{ hash: string; master: string }> = {}) {
  return {
    amount: "3000000",
    jetton_master: input.master ?? tonAssets.usdt.contract,
    transaction_hash: input.hash ?? "ton-paid",
    transaction_now: 120,
  };
}

function aptosTx(input: { address: string; asset?: string }) {
  return {
    amount: "4200000",
    asset_type: input.asset ?? aptosAssets.usdc.contract,
    owner_address: input.address,
    transaction_timestamp: "1970-01-01T00:02:00Z",
    transaction_version: "12345",
    type: "deposit",
  };
}

function channel(input: Partial<PaymentChannel>): PaymentChannel {
  return {
    address: "address",
    assets: ["usdt"],
    createdAt: 100,
    data: {},
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
    data: { key: "secret" },
    driver: "okpay",
    id: 9,
    name: "OKPay",
  });
}

function binanceChannel(): PaymentChannel {
  return channel({
    address: "34355667",
    assets: ["usdt", "usdc"],
    data: { apiKey: "api-key", secretKey: "secret-key" },
    driver: "binance",
    id: 6,
    name: "Binance",
  });
}

function okxChannel(): PaymentChannel {
  return channel({
    address: "888777",
    assets: ["usdt", "usdc"],
    data: { apiKey: "api-key", passphrase: "passphrase", secretKey: "secret-key" },
    driver: "okx",
    id: 7,
    name: "OKX",
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
