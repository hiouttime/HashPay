import { AppError } from "@/server/http/api";
import type { PaymentMethod } from "@/server/payments/channels";
import { check as checkTrc20 } from "@/server/payments/providers/trc20";
import {
  defaultPayment,
  evmPayments,
  normalizeAssetCsv,
  normalizePaymentAsset,
  paymentAssetName,
  paymentById,
  paymentExplorerUrl,
  payments,
  type Payment,
} from "@/shared/payments";
import { ceilAmount } from "@/shared/amount";
import type { PaymentSnapshot } from "@/shared/types/domain";

export { defaultPayment, evmPayments, paymentAssetName, paymentExplorerUrl, payments };

export interface PaymentOption {
  asset: string;
  network: string;
  paymentMethodId: number;
}

export interface PaymentCheckInput {
  candidates?: unknown;
  createdAt: number;
  expireAt: number;
  fastConfirm: boolean;
  snapshot: PaymentSnapshot;
}

export interface PaymentCheckResult {
  error?: string;
  status: "error" | "paid" | "pending";
  time?: number;
  txid?: string;
}

type Receiver = { key: "account" | "address"; value: string };
type Check = (input: PaymentCheckInput) => Promise<PaymentCheckResult>;

const checkers: Partial<Record<string, Check>> = {
  trc20: checkTrc20,
};

export function validatePaymentConfig(input: { address?: string; assets?: string[]; driver: string }) {
  const payment = paymentDefinition(input.driver);
  receiver(payment, input.address ?? "");
  validateAssets(input.assets ?? [], payment.assets);
  return payment;
}

export function paymentOptions(method: PaymentMethod): PaymentOption[] {
  const payment = paymentDefinition(method.driver);
  return assetsFor(method.assets, payment.assets).map((asset) => ({
    asset,
    network: payment.network,
    paymentMethodId: method.id,
  }));
}

export function assignPayment(method: PaymentMethod, amount: number, targetAsset: string): PaymentSnapshot {
  const payment = paymentDefinition(method.driver);
  const target = receiver(payment, method.address);
  const snapshot: PaymentSnapshot = {
    amount: ceilAmount(amount),
    currency: normalizePaymentAsset(targetAsset),
    currencyName: paymentAssetName(targetAsset),
    driver: payment.id,
    network: payment.network,
    networkName: payment.name,
  };
  snapshot[target.key] = target.value;
  return snapshot;
}

export function checkPayment(input: PaymentCheckInput) {
  paymentDefinition(input.snapshot.driver);
  return checkers[input.snapshot.driver]?.(input) ?? Promise.resolve({ status: "pending" });
}

function paymentDefinition(id: string) {
  const payment = paymentById(id);
  if (!payment) throw new AppError(400, "payment_driver_invalid", "Payment driver is invalid");
  return payment;
}

function receiver(payment: Payment, raw: string): Receiver {
  const key: "address" | "account" = payment.address ? "address" : "account";
  const label = payment.address?.name ?? payment.account?.name ?? "收款账户";
  const value = raw.trim();
  if (!value) throw new AppError(400, "payment_field_missing", `${label} is required`);
  if (payment.address && !payment.address.pattern.test(value)) {
    throw new AppError(400, "payment_address_invalid", `${payment.address.name} is invalid`);
  }
  return { key, value };
}

function validateAssets(raw: string[], supported: readonly string[]) {
  const assets = Array.from(new Set(raw.map(normalizePaymentAsset).filter(Boolean)));
  if (!assets.length) throw new AppError(400, "payment_asset_invalid", "Payment asset is invalid");
  const invalid = assets.filter((asset) => !supported.includes(asset));
  if (invalid.length) throw new AppError(400, "payment_asset_invalid", `Payment asset is invalid: ${invalid.join(",")}`);
}

function assetsFor(raw: unknown, supported: readonly string[]) {
  const allowed = new Set(supported);
  return (Array.isArray(raw) ? raw.map(normalizePaymentAsset) : normalizeAssetCsv(raw, supported)).filter((asset) => allowed.has(asset));
}
