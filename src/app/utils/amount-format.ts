const amountLocale = "en-US";

function normalizeNegativeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

export function ceilDisplayAmount(amount: number) {
  return normalizeNegativeZero(Math.ceil((amount - Number.EPSILON) * 100) / 100);
}

export function formatDisplayAmount(value: unknown, options: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return ceilDisplayAmount(amount).toLocaleString(amountLocale, options);
}

export function formatExactDisplayAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return ceilDisplayAmount(Math.max(0, amount)).toLocaleString(amountLocale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

export function formatIntegerDisplayAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return normalizeNegativeZero(Math.max(0, Math.trunc(amount))).toLocaleString(amountLocale, {
    maximumFractionDigits: 0,
  });
}
