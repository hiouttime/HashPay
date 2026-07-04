import { describe, expect, it } from "vitest";
import * as payment from "@/app/payments";
import { setLocale } from "@/app/i18n";

describe("frontend payment module", () => {
  it("keeps asset display helpers frontend-only", () => {
    expect(payment.assetName("gram")).toBe("GRAM (ex TON)");
    expect(payment.assetIcon("gram")).toBe("icon-ton");
  });

  it("normalizes checkout options and removes duplicate asset-network pairs", () => {
    expect(payment.checkoutOptions([
      { amount: 10, asset: "USDT", network: "TRC20" },
      { amount: 11, asset: "usdt", network: "trc20" },
      { amount: 12, asset: "GRAM", network: "TON" },
    ])).toEqual([
      {
        amount: 10,
        asset: "usdt",
        label: "TRC20 (TRON) / USDT",
        network: "trc20",
        value: "usdt:trc20",
      },
      {
        amount: 12,
        asset: "gram",
        label: "TON / GRAM (ex TON)",
        network: "ton",
        value: "gram:ton",
      },
    ]);
  });

  it("exposes per-network frontend abilities", () => {
    expect(payment.txUrl({ driver: "trc20", tx: { txid: "abc" } })).toBe("https://tronscan.org/#/transaction/abc");
    expect(payment.txUrl({ driver: "ton", tx: { txid: "abc" } })).toBe("https://tonviewer.com/transaction/abc");
    expect(payment.txUrl({ driver: "aptos", tx: { txid: "123" } })).toBe("https://explorer.aptoslabs.com/txn/123?network=mainnet");
    expect(payment.txUrl({ driver: "base", tx: { txid: "0xabc" } })).toBe("https://basescan.org/tx/0xabc");
  });

  it("uses exchange transfer wording for exchange drivers", () => {
    setLocale("zh-CN");
    expect(payment.paymentInstruction({ currency: "usdt", driver: "binance" })).toBe("请通过 Binance 币安 转账 USDT");
  });
});
