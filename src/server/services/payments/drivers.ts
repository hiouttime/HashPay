import Decimal from "decimal.js";
import { AppError } from "@/server/http/api-error";
import type { PaymentDriverMeta, PaymentField, PaymentSnapshot, PaymentTxEvidence } from "@/shared/types/domain";

export interface PaymentConfig {
  driver: string;
  fields: Record<string, string>;
  id: number;
  name: string;
}

export interface PaymentQuote {
  amount: number;
  currency: string;
  network: string;
  payway: number;
}

export interface PaymentDriver {
  assign(config: PaymentConfig, amount: number, currency: string, targetCurrency: string): PaymentSnapshot;
  fields(): PaymentField[];
  meta: PaymentDriverMeta;
  quote(config: PaymentConfig, amount: number, currency: string): PaymentQuote[];
}

function csv(raw: string | undefined, fallback: string[]) {
  const source = raw?.trim() ? raw : fallback.join(",");
  return Array.from(new Set(source.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)));
}

function fixedAmount(amount: number, targetCurrency: string) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, "amount_invalid", "Amount is invalid");
  }
  return new Decimal(amount).toDecimalPlaces(6, Decimal.ROUND_CEIL).toNumber();
}

function field(fields: Record<string, string>, key: string, label: string) {
  const value = fields[key]?.trim();
  if (!value) throw new AppError(400, "payment_field_missing", `${label} is required`);
  return value;
}

const tronDriver: PaymentDriver = {
  meta: {
    canAutoCheck: true,
    currencies: ["USDT", "TRX"],
    description: "TRON address payment via TronGrid checks",
    id: "chain/tron",
    kind: "chain",
    name: "TRON",
    networks: ["tron"],
  },
  fields: () => [
    { key: "address", label: "收款地址", required: true, type: "text" },
    { key: "currencies", label: "支持币种", placeholder: "USDT,TRX", required: true, type: "text" },
    { key: "instructions", label: "付款说明", type: "textarea" },
  ],
  quote: (config, amount) =>
    csv(config.fields.currencies, ["USDT", "TRX"]).map((currency) => ({
      amount: fixedAmount(amount, currency),
      currency,
      network: "tron",
      payway: config.id,
    })),
  assign: (config, amount, _currency, targetCurrency) => ({
    address: field(config.fields, "address", "收款地址"),
    amount: fixedAmount(amount, targetCurrency),
    currency: targetCurrency.toUpperCase(),
    driver: "chain/tron",
    instructions: config.fields.instructions?.trim() || "请通过 TRON 网络付款，并确认币种和金额完全一致。",
    network: "tron",
  }),
};

const evmDriver: PaymentDriver = {
  meta: {
    canAutoCheck: false,
    currencies: ["USDT", "USDC", "ETH", "BNB", "MATIC"],
    description: "EVM address payment, manual confirmation in v1",
    id: "chain/evm",
    kind: "chain",
    name: "EVM",
    networks: ["eth", "bsc", "polygon"],
  },
  fields: () => [
    { key: "network", label: "网络", options: ["eth", "bsc", "polygon"], required: true, type: "select" },
    { key: "address", label: "收款地址", required: true, type: "text" },
    { key: "currencies", label: "支持币种", placeholder: "USDT,USDC,ETH", required: true, type: "text" },
    { key: "instructions", label: "付款说明", type: "textarea" },
  ],
  quote: (config, amount) => {
    const network = config.fields.network?.trim().toLowerCase() || "eth";
    return csv(config.fields.currencies, ["USDT", "USDC", "ETH"]).map((currency) => ({
      amount: fixedAmount(amount, currency),
      currency,
      network,
      payway: config.id,
    }));
  },
  assign: (config, amount, _currency, targetCurrency) => ({
    address: field(config.fields, "address", "收款地址"),
    amount: fixedAmount(amount, targetCurrency),
    currency: targetCurrency.toUpperCase(),
    driver: "chain/evm",
    instructions: config.fields.instructions?.trim() || "请通过指定 EVM 网络付款，后台确认后订单生效。",
    network: config.fields.network?.trim().toLowerCase() || "eth",
  }),
};

const binanceDriver: PaymentDriver = {
  meta: {
    canAutoCheck: false,
    currencies: ["USDT", "BTC", "ETH"],
    description: "Binance internal transfer, manual confirmation in v1",
    id: "exchange/binance",
    kind: "exchange",
    name: "Binance 内转",
    networks: ["binance"],
  },
  fields: () => [
    { key: "account", label: "收款账户", required: true, type: "text" },
    { key: "memo", label: "转账备注", type: "text" },
    { key: "currencies", label: "支持币种", placeholder: "USDT,BTC,ETH", required: true, type: "text" },
    { key: "instructions", label: "付款说明", type: "textarea" },
  ],
  quote: (config, amount) =>
    csv(config.fields.currencies, ["USDT", "BTC", "ETH"]).map((currency) => ({
      amount: fixedAmount(amount, currency),
      currency,
      network: "binance",
      payway: config.id,
    })),
  assign: (config, amount, _currency, targetCurrency) => ({
    account: field(config.fields, "account", "收款账户"),
    amount: fixedAmount(amount, targetCurrency),
    currency: targetCurrency.toUpperCase(),
    driver: "exchange/binance",
    instructions: config.fields.instructions?.trim() || "请通过 Binance 内部转账完成付款，并核对收款账户与备注。",
    memo: config.fields.memo?.trim() || undefined,
    network: "binance",
  }),
};

const drivers = new Map<string, PaymentDriver>([
  [tronDriver.meta.id, tronDriver],
  [evmDriver.meta.id, evmDriver],
  [binanceDriver.meta.id, binanceDriver],
]);

export function paymentDrivers() {
  return Array.from(drivers.values()).map((driver) => driver.meta);
}

export function paymentSchemas() {
  return Object.fromEntries(Array.from(drivers.values()).map((driver) => [driver.meta.id, driver.fields()]));
}

export function getDriver(id: string) {
  const driver = drivers.get(id);
  if (!driver) throw new AppError(400, "payment_driver_invalid", "Payment driver is invalid");
  return driver;
}

export function amountMatches(expected: number, txAmount: number, tolerance = 0.000001) {
  return new Decimal(txAmount).minus(expected).abs().lte(tolerance);
}

export function snapshotMatchesTx(snapshot: PaymentSnapshot, tx: PaymentTxEvidence, createdAt: number, expireAt: number) {
  if (!tx.hash || tx.timestamp < createdAt || tx.timestamp > expireAt) return false;
  if (tx.currency.toUpperCase() !== snapshot.currency.toUpperCase()) return false;
  if (!amountMatches(snapshot.amount, tx.amount)) return false;
  if (snapshot.address && tx.to && snapshot.network !== "tron" && snapshot.address.toLowerCase() !== tx.to.toLowerCase()) return false;
  if (snapshot.address && tx.to && snapshot.network === "tron" && snapshot.address !== tx.to) return false;
  return true;
}
