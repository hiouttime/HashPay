import Decimal from "decimal.js";

export function ceilAmount(amount: number | Decimal) {
  return new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_CEIL).toNumber();
}

export function sameAmount(a: number, b: number) {
  return new Decimal(a).minus(b).abs().lte(0.000001);
}

// Converts an integer base-unit amount (decimal or 0x-hex string) into whole units.
export function unitAmount(value: unknown, decimals: number) {
  const text = String(value ?? "0");
  return new Decimal(text.startsWith("0x") ? BigInt(text).toString() : text).div(new Decimal(10).pow(decimals)).toNumber();
}

export interface AmountTolerance {
  max: number;
  min: number;
}

export function fitAmount(actual: number, expected: number, tolerance?: AmountTolerance | null) {
  if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expected)) return null;
  if (!tolerance || !Number.isFinite(tolerance.min) || !Number.isFinite(tolerance.max)) {
    return sameAmount(actual, expected) ? actual : null;
  }
  const value = new Decimal(actual);
  const low = new Decimal(expected).minus(Math.max(0, tolerance.min));
  const high = new Decimal(expected).plus(Math.max(0, tolerance.max));
  return value.gte(low) && value.lte(high) ? actual : null;
}
