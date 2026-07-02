import { describe, expect, it } from "vitest";
import * as payment from "@/app/payments";

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
    expect(payment.txUrl({ network: "trc20", tx: { txid: "abc" } })).toBe("https://nile.tronscan.org/#/transaction/abc");
    expect(payment.txUrl({ network: "ton", tx: { txid: "abc" } })).toBe("");
    expect(payment.canProbeInBrowser({ address: "TAddress", network: "trc20" })).toBe(true);
    expect(payment.canProbeInBrowser({ address: "EQAddress", network: "ton" })).toBe(false);
  });
});
