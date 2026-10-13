import Decimal from "decimal.js";

export function ceilAmount(amount: number | Decimal) {
  return new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_CEIL).toNumber();
}

export function sameAmount(a: number, b: number) {
  return new Decimal(a).minus(b).abs().lte(0.000001);
}

export interface AmountTolerance {
  max: number;
  min: number;
}

export function fitAmount(actual: number, expected: number, tolerance?: AmountTolerance | null) {
  if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expected)) return null;
  if (sameAmount(actual, expected)) return actual;
  if (!tolerance || !Number.isFinite(tolerance.min) || !Number.isFinite(tolerance.max)) return null;
  const value = new Decimal(actual);
  const low = new Decimal(expected).plus(tolerance.min);
  const high = new Decimal(expected).plus(tolerance.max);
  return value.gte(low) && value.lte(high) ? actual : null;
}
