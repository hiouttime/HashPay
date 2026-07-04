import { AppError } from "@/server/http/api";
import type { PaymentChannel } from "@/server/payments/channels";
import { check as checkAptos } from "@/server/payments/providers/aptos";
import { check as checkBinance, validate as validateBinance } from "@/server/payments/providers/binance";
import { check as checkEvm } from "@/server/payments/providers/evm";
import { check as checkOkpay, create as createOkpay } from "@/server/payments/providers/okpay";
import { check as checkOkx, validate as validateOkx } from "@/server/payments/providers/okx";
import { check as checkTon } from "@/server/payments/providers/ton";
import { check as checkTrc20 } from "@/server/payments/providers/trc20";
import {
  defaultPayment,
  evmPayments,
  normalizeAssetCsv,
  key,
  paymentById,
  paymentExplorerUrl,
  payments,
  type Payment,
} from "@/shared/payments";
import { ceilAmount } from "@/shared/amount";
import type { Order } from "@/server/services/orders/repository";
import type { PaymentSnapshot } from "@/shared/types/domain";

export { defaultPayment, evmPayments, paymentExplorerUrl, payments };

export interface PaymentOption {
  asset: string;
  network: string;
  channelId: number;
}

export interface PaymentCheckInput {
  channel?: PaymentChannel;
  fastConfirm: boolean;
  orders: PaymentCheckOrder[];
}

export interface PaymentCheckOrder {
  createdAt: number;
  expireAt: number;
  id: string;
  snapshot: PaymentSnapshot;
}

export interface PaymentCheckResult {
  error?: string;
  matches: PaymentCheckMatch[];
  status: "error" | "ok";
}

export interface PaymentCheckMatch {
  orderId: string;
  time?: number;
  txid?: string;
}

type Check = (input: PaymentCheckInput) => Promise<PaymentCheckResult>;
type Create = (channel: PaymentChannel, order: Order, snapshot: PaymentSnapshot) => Promise<PaymentSnapshot>;
type Validate = (input: { address: string; data: Record<string, string> }) => Promise<void>;
type Provider = {
  check: Check;
  scheduled?: true;
  validate?: Validate;
};

const providers: Partial<Record<string, Provider>> = {
  aptos: { check: checkAptos, scheduled: true },
  base: { check: checkEvm, scheduled: true },
  bep20: { check: checkEvm, scheduled: true },
  binance: { check: checkBinance, scheduled: true, validate: validateBinance },
  erc20: { check: checkEvm, scheduled: true },
  okpay: { check: checkOkpay },
  okx: { check: checkOkx, scheduled: true, validate: validateOkx },
  polygon: { check: checkEvm, scheduled: true },
  ton: { check: checkTon, scheduled: true },
  trc20: { check: checkTrc20, scheduled: true },
};

const creators: Partial<Record<string, Create>> = {
  okpay: createOkpay,
};

export function validateChannel(input: { address?: string; assets?: string[]; driver: string }) {
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
    currency: key(targetAsset),
    driver: payment.id,
  };
}

export function createPayment(channel: PaymentChannel, order: Order, snapshot: PaymentSnapshot) {
  return creators[channel.driver]?.(channel, order, snapshot) ?? Promise.resolve(snapshot);
}

export async function validateData(driver: string, address: string, data: Record<string, string>) {
  byId(driver);
  await providers[driver]?.validate?.({ address, data });
}

export function checkPayment(input: PaymentCheckInput) {
  const driver = input.orders[0]?.snapshot.driver;
  if (!driver) return Promise.resolve({ matches: [], status: "ok" } satisfies PaymentCheckResult);
  byId(driver);
  return providers[driver]?.check(input) ?? Promise.resolve({ matches: [], status: "ok" });
}

export function checksOnSchedule(driver: string) {
  return providers[driver]?.scheduled === true;
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
  const assets = Array.from(new Set(raw.map(key).filter(Boolean)));
  if (!assets.length) throw new AppError(400, "errors.payment_asset_invalid");
  const invalid = assets.filter((asset) => !supported.includes(asset));
  if (invalid.length) throw new AppError(400, "errors.payment_asset_invalid");
}

function enabledAssets(raw: unknown, supported: readonly string[]) {
  const allowed = new Set(supported);
  return (Array.isArray(raw) ? raw.map(key) : normalizeAssetCsv(raw, supported)).filter((asset) => allowed.has(asset));
}
