import { describe, expect, it } from "vitest";
import {
  ceilDisplayAmount,
  formatAmount,
  formatExactAmount,
  formatIntegerAmount,
} from "@/app/utils/format";

describe("amount formatting", () => {
  it("never exposes JavaScript negative zero", () => {
    expect(Object.is(ceilDisplayAmount(0), -0)).toBe(false);
    expect(Object.is(ceilDisplayAmount(-0), -0)).toBe(false);
    expect(formatAmount(-0.001)).toBe("0");
    expect(formatExactAmount(-0.001)).toBe("0.00");
    expect(formatIntegerAmount(-0.2)).toBe("0");
  });

  it("keeps normal amount formatting unchanged", () => {
    expect(formatAmount(4.9)).toBe("4.9");
    expect(formatExactAmount(4.9)).toBe("4.90");
    expect(formatAmount(20)).toBe("20");
    expect(formatAmount(20.123)).toBe("20.13");
    expect(formatExactAmount(20)).toBe("20.00");
    expect(formatIntegerAmount(20.8)).toBe("20");
  });
});
