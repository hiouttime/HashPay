import { describe, expect, it } from "vitest";
import { paymentExplorerUrl, paymentOptions, payments, validatePayment } from "@/server/payments/driver";
import { assetLabel, networkLabel, normalizeNetworkKey, normalizePaymentAsset, paymentById } from "@/shared/payments";

describe("payment model", () => {
  it("keeps TON as network and gram as the payment asset", () => {
    expect(networkLabel("ton")).toBe("network.ton");
    expect(assetLabel("gram")).toBe("GRAM (ex TON)");
    expect(normalizePaymentAsset("GRAM")).toBe("gram");
    expect(normalizePaymentAsset("TON")).toBe("ton");
    expect(normalizeNetworkKey("TRC20")).toBe("trc20");
    expect(normalizeNetworkKey("BEP20")).toBe("bep20");
    expect(normalizeNetworkKey("tron")).toBe("tron");
    expect(normalizeNetworkKey("bnb")).toBe("bnb");
  });

  it("lists gram on the TON network without treating TON as an asset alias", () => {
    const options = paymentOptions({
      address: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      assets: ["usdt", "gram", "ton"],
      createdAt: 1,
      credentials: {},
      driver: "ton",
      id: 7,
      name: "TON",
      status: "enabled",
      updatedAt: 1,
    });

    expect(options).toContainEqual({ asset: "gram", channelId: 7, network: "ton" });
    expect(options).toContainEqual({ asset: "usdt", channelId: 7, network: "ton" });
    expect(options).not.toContainEqual({ asset: "ton", channelId: 7, network: "ton" });
    expect(() => validatePayment({
      address: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      assets: ["ton"],
      driver: "ton",
    })).toThrow("errors.payment_asset_invalid");
  });

  it("keeps EVM networks as real payment drivers with their own assets", () => {
    const options = paymentOptions({
      address: "0x0000000000000000000000000000000000000001",
      assets: ["usdt", "bnb", "eth"],
      createdAt: 1,
      credentials: {},
      driver: "bep20",
      id: 9,
      name: "BEP20",
      status: "enabled",
      updatedAt: 1,
    });

    expect(options).toContainEqual({ asset: "usdt", channelId: 9, network: "bep20" });
    expect(options).toContainEqual({ asset: "bnb", channelId: 9, network: "bep20" });
    expect(options).not.toContainEqual({ asset: "eth", channelId: 9, network: "bep20" });
    expect(() => validatePayment({
      address: "0x0000000000000000000000000000000000000001",
      assets: ["eth"],
      driver: "bep20",
    })).toThrow("errors.payment_asset_invalid");
  });

  it("uses server payment definitions as the payment source", () => {
    expect(payments.map((item) => item.id)).toContain("trc20");
    expect(paymentById("trc20")).toMatchObject({
      address: { nameKey: "payment.address.tron" },
      icon: "icon-tron",
    });
    expect(paymentExplorerUrl("trc20", "abc")).toBe("https://nile.tronscan.org/#/transaction/abc");
  });

  it("supports Aptos as a chain payment driver", () => {
    const address = "0x1111111111111111111111111111111111111111111111111111111111111111";
    expect(paymentById("aptos")).toMatchObject({
      address: { nameKey: "payment.address.aptos" },
      assets: ["usdt", "usdc"],
      icon: "icon-aptos",
    });
    expect(paymentOptions({
      address,
      assets: ["usdt", "usdc"],
      createdAt: 1,
      credentials: {},
      driver: "aptos",
      id: 10,
      name: "Aptos",
      status: "enabled",
      updatedAt: 1,
    })).toEqual([
      { asset: "usdt", channelId: 10, network: "aptos" },
      { asset: "usdc", channelId: 10, network: "aptos" },
    ]);
    expect(() => validatePayment({ address: "0x1", assets: ["usdt"], driver: "aptos" })).toThrow("errors.payment_address_invalid");
    expect(() => validatePayment({ address, assets: ["apt"], driver: "aptos" })).toThrow("errors.payment_asset_invalid");
  });

  it("supports Base as an EVM payment driver", () => {
    const address = "0x0000000000000000000000000000000000000001";
    expect(paymentById("base")).toMatchObject({
      address: { nameKey: "payment.address.evm" },
      assets: ["usdt", "usdc", "eth"],
      icon: "icon-base",
    });
    expect(paymentOptions({
      address,
      assets: ["usdt", "usdc", "eth", "bnb"],
      createdAt: 1,
      credentials: {},
      driver: "base",
      id: 11,
      name: "Base",
      status: "enabled",
      updatedAt: 1,
    })).toEqual([
      { asset: "usdt", channelId: 11, network: "base" },
      { asset: "usdc", channelId: 11, network: "base" },
      { asset: "eth", channelId: 11, network: "base" },
    ]);
    expect(paymentExplorerUrl("base", "0xabc")).toBe("https://basescan.org/tx/0xabc");
  });
});
