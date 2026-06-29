import { describe, expect, it } from "vitest";
import { amountMatches, snapshotMatchesTx } from "@/server/services/payments/drivers";
import type { PaymentSnapshot, PaymentTxEvidence } from "@/shared/types/domain";

describe("payment matching", () => {
  it("matches amount with tolerance", () => {
    expect(amountMatches(10, 10.0000004)).toBe(true);
    expect(amountMatches(10, 10.01)).toBe(false);
  });

  it("matches tron transaction against order window", () => {
    const snapshot: PaymentSnapshot = {
      address: "TAddress",
      amount: 12.5,
      currency: "USDT",
      driver: "chain/tron",
      network: "tron",
    };
    const tx: PaymentTxEvidence = {
      amount: 12.5,
      confirmedBy: "frontend",
      currency: "USDT",
      hash: "tx",
      timestamp: 120,
      to: "TAddress",
    };
    expect(snapshotMatchesTx(snapshot, tx, 100, 200)).toBe(true);
    expect(snapshotMatchesTx(snapshot, { ...tx, timestamp: 90 }, 100, 200)).toBe(false);
    expect(snapshotMatchesTx(snapshot, { ...tx, timestamp: 201 }, 100, 200)).toBe(false);
  });
});
