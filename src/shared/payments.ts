export type PaymentKind = "chain" | "exchange" | "wallet";
export type PublicPaymentCheck = "trongrid";
export type NetworkKey =
  | "binance"
  | "bep20"
  | "erc20"
  | "huobi"
  | "okpay"
  | "okx"
  | "polygon"
  | "ton"
  | "trc20";

export type PaymentAssetKey =
  | "bnb"
  | "eth"
  | "gram"
  | "matic"
  | "trx"
  | "usdc"
  | "usdt";

export interface PaymentAddress {
  help: string;
  name: string;
  pattern: RegExp;
}

export interface Payment {
  account?: {
    name: string;
  };
  address?: PaymentAddress;
  assets: string[];
  evm?: boolean;
  explorer?: {
    transaction: string;
  };
  icon: string;
  id: string;
  kind: PaymentKind;
  name: string;
  network: string;
  publicCheck?: PublicPaymentCheck;
}

export const paymentAssets: Record<PaymentAssetKey, { icon: string; name: string; symbol: string }> = {
  bnb: { icon: "icon-bnb", name: "BNB", symbol: "BNB" },
  eth: { icon: "icon-ethereum", name: "ETH", symbol: "ETH" },
  gram: { icon: "icon-ton", name: "GRAM (ex TON)", symbol: "GRAM" },
  matic: { icon: "icon-polygon", name: "MATIC", symbol: "MATIC" },
  trx: { icon: "icon-tron", name: "TRX", symbol: "TRX" },
  usdc: { icon: "icon-usdc", name: "USDC", symbol: "USDC" },
  usdt: { icon: "icon-usdt", name: "USDT", symbol: "USDT" },
};

export function normalizeNetworkKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizePaymentAsset(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function assetLabel(asset: unknown) {
  const key = normalizePaymentAsset(asset) as PaymentAssetKey;
  return paymentAssets[key]?.name ?? String(asset ?? "").trim().toUpperCase();
}

export function assetSymbol(asset: unknown) {
  const key = normalizePaymentAsset(asset) as PaymentAssetKey;
  return paymentAssets[key]?.symbol ?? String(asset ?? "").trim().toUpperCase();
}

export function normalizeAssetCsv(raw: unknown, fallback: readonly string[] = []) {
  const source = String(raw ?? "").trim() || fallback.join(",");
  return Array.from(new Set(source.split(",").map(normalizePaymentAsset).filter(Boolean)));
}

export const trc20: Payment = {
  address: {
    help: "TRON 地址通常以 T 开头。",
    name: "TRON 地址",
    pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  },
  assets: ["usdt", "trx"],
  explorer: {
    transaction: "https://nile.tronscan.org/#/transaction/{hash}",
  },
  icon: "icon-tron",
  id: "trc20",
  kind: "chain",
  name: "TRC20 (TRON)",
  network: "trc20",
  publicCheck: "trongrid",
};

export const erc20: Payment = {
  address: {
    help: "EVM 地址为 0x 开头的十六进制地址。",
    name: "EVM 地址",
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  assets: ["usdt", "usdc", "eth"],
  evm: true,
  icon: "icon-ethereum",
  id: "erc20",
  kind: "chain",
  name: "ERC20 (Ethereum)",
  network: "erc20",
};

export const bep20: Payment = {
  address: {
    help: "EVM 地址为 0x 开头的十六进制地址。",
    name: "EVM 地址",
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  assets: ["usdt", "usdc", "bnb"],
  evm: true,
  icon: "icon-bnb",
  id: "bep20",
  kind: "chain",
  name: "BEP20 (BNB Smart Chain)",
  network: "bep20",
};

export const polygon: Payment = {
  address: {
    help: "EVM 地址为 0x 开头的十六进制地址。",
    name: "EVM 地址",
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  assets: ["usdt", "usdc", "matic"],
  evm: true,
  icon: "icon-polygon",
  id: "polygon",
  kind: "chain",
  name: "Polygon",
  network: "polygon",
};

export const ton: Payment = {
  address: {
    help: "TON 地址一般为 EQ 或 UQ 开头。",
    name: "TON 地址",
    pattern: /^(EQ|UQ)[A-Za-z0-9_-]{46}$/,
  },
  assets: ["usdt", "gram"],
  icon: "icon-ton",
  id: "ton",
  kind: "chain",
  name: "TON",
  network: "ton",
};

export const binance: Payment = {
  account: { name: "收款账户" },
  assets: ["usdt", "usdc"],
  icon: "icon-binance",
  id: "binance",
  kind: "exchange",
  name: "Binance 币安",
  network: "binance",
};

export const okx: Payment = {
  account: { name: "收款账户" },
  assets: ["usdt", "usdc"],
  icon: "icon-okx",
  id: "okx",
  kind: "exchange",
  name: "OKX 欧易",
  network: "okx",
};

export const huobi: Payment = {
  account: { name: "收款账户" },
  assets: ["usdt", "usdc"],
  icon: "icon-huobi",
  id: "huobi",
  kind: "exchange",
  name: "Huobi 火币",
  network: "huobi",
};

export const okpay: Payment = {
  account: { name: "钱包账号" },
  assets: ["usdt", "trx"],
  icon: "icon-okpay",
  id: "okpay",
  kind: "wallet",
  name: "Okpay",
  network: "okpay",
};

export const payments: Payment[] = [
  trc20,
  erc20,
  bep20,
  polygon,
  ton,
  binance,
  okx,
  huobi,
  okpay,
];

const byId = new Map(payments.map((payment) => [payment.id, payment]));
const byNetwork = new Map(payments.map((payment) => [payment.network, payment]));

export const evmPayments = payments.filter((payment) => payment.evm);
export const defaultPayment = payments[0]!;

export function paymentById(id: unknown) {
  return byId.get(String(id));
}

export function paymentByNetwork(network: unknown) {
  return byNetwork.get(normalizeNetworkKey(network));
}

export function networkLabel(network: unknown) {
  const raw = String(network ?? "").trim();
  return paymentByNetwork(raw)?.name ?? raw.toUpperCase();
}

export function paymentExplorerUrl(network: unknown, hash: unknown) {
  const value = String(hash || "").trim();
  const template = paymentByNetwork(network)?.explorer?.transaction;
  return value && template ? template.replace("{hash}", encodeURIComponent(value)) : "";
}

export function paymentAssetName(asset: unknown) {
  return assetLabel(asset);
}

export function paymentAssetIcon(asset: unknown) {
  const key = normalizePaymentAsset(asset) as PaymentAssetKey;
  return paymentAssets[key]?.icon ?? "";
}
