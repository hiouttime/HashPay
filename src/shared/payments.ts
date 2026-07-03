export type PaymentKind = "chain" | "exchange" | "wallet";
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

export type Trc20Asset = {
  contract: string;
  symbol: string;
};

export interface PaymentAddress {
  helpKey: string;
  nameKey: string;
  pattern?: RegExp;
}

export interface Payment {
  address: PaymentAddress;
  assets: string[];
  evm?: boolean;
  explorer?: {
    transaction: string;
  };
  icon: string;
  id: string;
  kind: PaymentKind;
  nameKey: string;
  network: string;
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

export const trc20Assets: Record<string, Trc20Asset> = {
  usdt: {
    contract: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    symbol: "USDT",
  },
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
    helpKey: "payment.help.tron",
    nameKey: "payment.address.tron",
    pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  },
  assets: ["usdt", "trx"],
  explorer: {
    transaction: "https://nile.tronscan.org/#/transaction/{hash}",
  },
  icon: "icon-tron",
  id: "trc20",
  kind: "chain",
  nameKey: "network.trc20",
  network: "trc20",
};

export const erc20: Payment = {
  address: {
    helpKey: "payment.help.evm",
    nameKey: "payment.address.evm",
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  assets: ["usdt", "usdc", "eth"],
  evm: true,
  icon: "icon-ethereum",
  id: "erc20",
  kind: "chain",
  nameKey: "network.erc20",
  network: "erc20",
};

export const bep20: Payment = {
  address: {
    helpKey: "payment.help.evm",
    nameKey: "payment.address.evm",
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  assets: ["usdt", "usdc", "bnb"],
  evm: true,
  icon: "icon-bnb",
  id: "bep20",
  kind: "chain",
  nameKey: "network.bep20",
  network: "bep20",
};

export const polygon: Payment = {
  address: {
    helpKey: "payment.help.evm",
    nameKey: "payment.address.evm",
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  assets: ["usdt", "usdc", "matic"],
  evm: true,
  icon: "icon-polygon",
  id: "polygon",
  kind: "chain",
  nameKey: "network.polygon",
  network: "polygon",
};

export const ton: Payment = {
  address: {
    helpKey: "payment.help.ton",
    nameKey: "payment.address.ton",
    pattern: /^(EQ|UQ)[A-Za-z0-9_-]{46}$/,
  },
  assets: ["usdt", "gram"],
  icon: "icon-ton",
  id: "ton",
  kind: "chain",
  nameKey: "network.ton",
  network: "ton",
};

export const binance: Payment = {
  address: {
    helpKey: "payment.help.platform",
    nameKey: "payment.address.default",
  },
  assets: ["usdt", "usdc"],
  icon: "icon-binance",
  id: "binance",
  kind: "exchange",
  nameKey: "network.binance",
  network: "binance",
};

export const okx: Payment = {
  address: {
    helpKey: "payment.help.platform",
    nameKey: "payment.address.default",
  },
  assets: ["usdt", "usdc"],
  icon: "icon-okx",
  id: "okx",
  kind: "exchange",
  nameKey: "network.okx",
  network: "okx",
};

export const huobi: Payment = {
  address: {
    helpKey: "payment.help.platform",
    nameKey: "payment.address.default",
  },
  assets: ["usdt", "usdc"],
  icon: "icon-huobi",
  id: "huobi",
  kind: "exchange",
  nameKey: "network.huobi",
  network: "huobi",
};

export const okpay: Payment = {
  address: {
    helpKey: "payment.help.wallet",
    nameKey: "payment.address.wallet",
  },
  assets: ["usdt", "trx"],
  icon: "icon-okpay",
  id: "okpay",
  kind: "wallet",
  nameKey: "network.okpay",
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
  return paymentByNetwork(raw)?.nameKey ?? raw.toUpperCase();
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

export function paymentFieldLabelKey(payment: Payment) {
  return payment.address.nameKey;
}

export function paymentFieldHelpKey(payment: Payment) {
  return payment.address.helpKey;
}
