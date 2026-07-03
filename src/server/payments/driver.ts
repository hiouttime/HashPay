import { AppError } from "@/server/http/api";
import type { PaymentChannel } from "@/server/payments/channels";
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
  channelId: number;
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

type Check = (input: PaymentCheckInput) => Promise<PaymentCheckResult>;

const checkers: Partial<Record<string, Check>> = {
  trc20: checkTrc20,
};

export function validatePayment(input: { address?: string; assets?: string[]; driver: string }) {
  const payment = byId(input.driver);
  address(payment, input.address ?? "");
  validateAssets(input.assets ?? [], payment.assets);
  return payment;
}

export function paymentOptions(channel: PaymentChannel): PaymentOption[] {
  const payment = byId(channel.driver);
  return enabledAssets(channel.assets, payment.assets).map((asset) => ({
    asset,
    channelId: channel.id,
    network: payment.network,
  }));
}

export function assignPayment(channel: PaymentChannel, amount: number, targetAsset: string): PaymentSnapshot {
  const payment = byId(channel.driver);
  return {
    address: address(payment, channel.address),
    amount: ceilAmount(amount),
    currency: normalizePaymentAsset(targetAsset),
    currencyName: paymentAssetName(targetAsset),
    driver: payment.id,
    network: payment.network,
    networkName: payment.nameKey,
  };
}

export function checkPayment(input: PaymentCheckInput) {
  byId(input.snapshot.driver);
  return checkers[input.snapshot.driver]?.(input) ?? Promise.resolve({ status: "pending" });
}

function byId(id: string) {
  const payment = paymentById(id);
  if (!payment) throw new AppError(400, "errors.payment_driver_invalid");
  return payment;
}

function address(payment: Payment, raw: string) {
  const value = raw.trim();
  if (!value) throw new AppError(400, "errors.payment_field_missing");
  if (payment.address.pattern && !payment.address.pattern.test(value)) {
    throw new AppError(400, "errors.payment_address_invalid");
  }
  return value;
}

function validateAssets(raw: string[], supported: readonly string[]) {
  const assets = Array.from(new Set(raw.map(normalizePaymentAsset).filter(Boolean)));
  if (!assets.length) throw new AppError(400, "errors.payment_asset_invalid");
  const invalid = assets.filter((asset) => !supported.includes(asset));
  if (invalid.length) throw new AppError(400, "errors.payment_asset_invalid");
}

function enabledAssets(raw: unknown, supported: readonly string[]) {
  const allowed = new Set(supported);
  return (Array.isArray(raw) ? raw.map(normalizePaymentAsset) : normalizeAssetCsv(raw, supported)).filter((asset) => allowed.has(asset));
}
