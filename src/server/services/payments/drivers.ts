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
  return new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_CEIL).toNumber();
}

function field(fields: Record<string, string>, key: string, label: string) {
  const value = fields[key]?.trim();
  if (!value) throw new AppError(400, "payment_field_missing", `${label} is required`);
  return value;
}

function assertAddress(driverId: string, address: string) {
  const validators = {
    "chain/evm": { message: "EVM address is invalid", pattern: /^0x[a-fA-F0-9]{40}$/ },
    "chain/ton": { message: "TON address is invalid", pattern: /^(EQ|UQ)[A-Za-z0-9_-]{46}$/ },
    "chain/tron": { message: "TRON address is invalid", pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/ },
  } as const;
  const validator = validators[driverId as keyof typeof validators];
  if (validator && !validator.pattern.test(address)) {
    throw new AppError(400, "payment_address_invalid", validator.message);
  }
}

export function validatePaymentConfig(input: { driver: string; fields?: Record<string, string> }) {
  const driver = getDriver(input.driver);
  const fields = input.fields ?? {};
  for (const item of driver.fields()) {
    if (item.required) field(fields, item.key, item.label);
  }
  const address = fields.address?.trim();
  if (address) assertAddress(driver.meta.id, address);
  return driver;
}

const tronDriver: PaymentDriver = {
  meta: {
    canAutoCheck: true,
    currencies: ["USDT", "TRX"],
    description: "TRON address payment via TronGrid checks",
    id: "chain/tron",
    kind: "chain",
    name: "TRON 波场",
    networks: ["tron"],
  },
  fields: () => [
    { help: "TRON 地址通常以 T 开头。", key: "address", label: "收款地址", required: true, type: "text" },
    { key: "currencies", label: "币种", placeholder: "USDT,TRX", required: true, type: "text" },
  ],
  quote: (config, amount) =>
    csv(config.fields.currencies, ["USDT", "TRX"]).map((currency) => ({
      amount: fixedAmount(amount, currency),
      currency,
      network: "tron",
      payway: config.id,
    })),
  assign: (config, amount, _currency, targetCurrency) => ({
    address: (() => {
      const address = field(config.fields, "address", "收款地址");
      assertAddress("chain/tron", address);
      return address;
    })(),
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
    name: "EVM 兼容链",
    networks: ["eth", "bsc", "polygon"],
  },
  fields: () => [
    { key: "network", label: "网络", options: ["eth", "bsc", "polygon"], required: true, type: "select" },
    { help: "EVM 地址为 0x 开头的十六进制地址。", key: "address", label: "收款地址", required: true, type: "text" },
    { key: "currencies", label: "币种", placeholder: "USDT,USDC,ETH", required: true, type: "text" },
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
    address: (() => {
      const address = field(config.fields, "address", "收款地址");
      assertAddress("chain/evm", address);
      return address;
    })(),
    amount: fixedAmount(amount, targetCurrency),
    currency: targetCurrency.toUpperCase(),
    driver: "chain/evm",
    instructions: config.fields.instructions?.trim() || "请通过指定 EVM 网络付款，后台确认后订单生效。",
    network: config.fields.network?.trim().toLowerCase() || "eth",
  }),
};

const tonDriver: PaymentDriver = {
  meta: {
    canAutoCheck: false,
    currencies: ["USDT", "GRAM"],
    description: "TON address payment, manual confirmation in v1",
    id: "chain/ton",
    kind: "chain",
    name: "TON",
    networks: ["ton"],
  },
  fields: () => [
    { help: "TON 地址一般为 EQ 或 UQ 开头。不支持设定Memo。", key: "address", label: "收款地址", required: true, type: "text" },
    { key: "currencies", label: "币种", placeholder: "USDT,GRAM", required: true, type: "text" },
  ],
  quote: (config, amount) =>
    csv(config.fields.currencies, ["USDT", "GRAM"]).map((currency) => ({
      amount: fixedAmount(amount, currency),
      currency,
      network: "ton",
      payway: config.id,
    })),
  assign: (config, amount, _currency, targetCurrency) => ({
    address: (() => {
      const address = field(config.fields, "address", "收款地址");
      assertAddress("chain/ton", address);
      return address;
    })(),
    amount: fixedAmount(amount, targetCurrency),
    currency: targetCurrency.toUpperCase(),
    driver: "chain/ton",
    instructions: config.fields.instructions?.trim() || "请通过 TON 网络付款，并确认币种和金额完全一致。",
    network: "ton",
  }),
};

function accountDriver(options: {
  currencies: string[];
  description: string;
  id: string;
  kind: PaymentDriverMeta["kind"];
  name: string;
  network: string;
}) {
  const placeholder = options.currencies.join(",");
  const accountLabel = options.kind === "wallet" ? "钱包账号" : "收款账户";
  return {
    meta: {
      canAutoCheck: false,
      currencies: options.currencies,
      description: options.description,
      id: options.id,
      kind: options.kind,
      name: options.name,
      networks: [options.network],
    },
    fields: () => [
      { key: "account", label: accountLabel, required: true, type: "text" },
      { key: "memo", label: "转账备注", type: "text" },
      { key: "currencies", label: "币种", placeholder, required: true, type: "text" },
    ],
    quote: (config, amount) =>
      csv(config.fields.currencies, options.currencies).map((currency) => ({
        amount: fixedAmount(amount, currency),
        currency,
        network: options.network,
        payway: config.id,
      })),
    assign: (config, amount, _currency, targetCurrency) => ({
      account: field(config.fields, "account", accountLabel),
      amount: fixedAmount(amount, targetCurrency),
      currency: targetCurrency.toUpperCase(),
      driver: options.id,
      instructions: config.fields.instructions?.trim() || `请通过 ${options.name} 完成付款，并核对${accountLabel}与备注。`,
      memo: config.fields.memo?.trim() || undefined,
      network: options.network,
    }),
  } satisfies PaymentDriver;
}

const binanceDriver = accountDriver({
  currencies: ["USDT", "USDC"],
  description: "Binance transfer, manual confirmation in v1",
  id: "exchange/binance",
  kind: "exchange",
  name: "Binance 币安",
  network: "binance",
});

const okxDriver = accountDriver({
  currencies: ["USDT", "USDC"],
  description: "OKX transfer, manual confirmation in v1",
  id: "exchange/okx",
  kind: "exchange",
  name: "OKX 欧易",
  network: "okx",
});

const huobiDriver = accountDriver({
  currencies: ["USDT", "USDC"],
  description: "Huobi transfer, manual confirmation in v1",
  id: "exchange/huobi",
  kind: "exchange",
  name: "Huobi 火币",
  network: "huobi",
});

const okpayDriver = accountDriver({
  currencies: ["USDT", "TRX"],
  description: "Okpay wallet transfer, manual confirmation in v1",
  id: "wallet/okpay",
  kind: "wallet",
  name: "Okpay",
  network: "okpay",
});

const drivers = new Map<string, PaymentDriver>([
  [tronDriver.meta.id, tronDriver],
  [evmDriver.meta.id, evmDriver],
  [tonDriver.meta.id, tonDriver],
  [binanceDriver.meta.id, binanceDriver],
  [okxDriver.meta.id, okxDriver],
  [huobiDriver.meta.id, huobiDriver],
  [okpayDriver.meta.id, okpayDriver],
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
