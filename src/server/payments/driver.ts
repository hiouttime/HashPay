import { AppError } from "@/server/http/api";
import type { PaymentChannel } from "@/server/payments/channels";
import { aptos } from "@/server/payments/providers/aptos";
import { binance } from "@/server/payments/providers/binance";
import { evm } from "@/server/payments/providers/evm";
import { okpay } from "@/server/payments/providers/okpay";
import { okx } from "@/server/payments/providers/okx";
import { solana } from "@/server/payments/providers/solana";
import { ton } from "@/server/payments/providers/ton";
import { trc20 } from "@/server/payments/providers/trc20";
import { normalizeAssetCsv, key, paymentById, type Payment } from "@/shared/payments";
import { ceilAmount, type AmountTolerance } from "@/shared/amount";
import type { Order } from "@/server/services/orders/repository";
import type { PaymentSnapshot } from "@/shared/types/domain";

export interface PaymentOption {
  asset: string;
  network: string;
  channelId: number;
}

export interface PaymentCheckInput {
  channel?: PaymentChannel;
  fastConfirm: boolean;
  orders: PaymentCheckOrder[];
  tolerance?: AmountTolerance | null;
}

export interface PaymentCheckOrder {
  createdAt: number;
  expireAt: number;
  id: string;
  snapshot: PaymentSnapshot;
}

export interface CheckResult {
  error?: string;
  status: "error" | "ok";
}

export interface PaymentCheckResult extends CheckResult {
  matches: PaymentCheckMatch[];
}

export interface PaymentCheckMatch {
  amount?: number;
  orderId: string;
  time?: number;
  txid?: string;
}

type Check = (channel: PaymentChannel) => Promise<void>;
type Scan = (input: PaymentCheckInput) => Promise<PaymentCheckMatch[]>;
type Create = (channel: PaymentChannel, order: Order, snapshot: PaymentSnapshot) => Promise<PaymentSnapshot>;
type Validate = (input: { address: string; data: Record<string, string> }) => Promise<void>;
type Provider = {
  check: Check;
  create?: Create;
  scan: Scan;
  validate?: Validate;
};

const providers: Record<string, Provider> = {
  aptos,
  base: evm,
  bep20: evm,
  binance,
  erc20: evm,
  okpay,
  okx,
  polygon: evm,
  solana,
  ton,
  trc20,
  xlayer: evm,
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
  return providers[channel.driver]?.create?.(channel, order, snapshot) ?? Promise.resolve(snapshot);
}

export async function validateData(driver: string, address: string, data: Record<string, string>) {
  await providers[byId(driver).id].validate?.({ address, data });
}

export async function checkChannel(channel: PaymentChannel): Promise<CheckResult> {
  const provider = providers[byId(channel.driver).id];
  try {
    await provider.check(channel);
    return { status: "ok" };
  } catch (error) {
    return { error: errorText(error), status: "error" };
  }
}

export async function checkPayment(input: PaymentCheckInput): Promise<PaymentCheckResult> {
  const driver = input.orders[0]?.snapshot.driver;
  if (!driver) return { matches: [], status: "ok" };
  try {
    return { matches: await providers[byId(driver).id].scan(input), status: "ok" };
  } catch (error) {
    return { error: errorText(error), matches: [], status: "error" };
  }
}

function byId(id: string) {
  const payment = paymentById(id);
  if (!payment) throw new AppError(400, "errors.payment_driver_invalid");
  return payment;
}

function errorText(error: unknown) {
  const detail = error instanceof AppError ? error.params.detail : undefined;
  return String(detail ?? (error instanceof Error ? error.message : "Payment check failed"));
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
