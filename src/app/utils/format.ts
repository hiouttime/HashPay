import { ceilAmount } from "@/shared/amount";

// Adding 0 turns JavaScript's -0 into 0, which would otherwise render as "-0".
export function ceilDisplayAmount(amount: number) {
  return ceilAmount(amount) + 0;
}

export function formatAmount(value: unknown, options: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return ceilDisplayAmount(amount).toLocaleString("en-US", options);
}

export function formatExactAmount(value: unknown) {
  return formatAmount(Math.max(0, Number(value)), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function formatIntegerAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return Math.max(0, Math.trunc(amount)).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatTime(value: unknown) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  const date = new Date(ts * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
