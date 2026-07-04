export type PaymentKind = "chain" | "exchange" | "wallet";
export type NetworkKey =
  | "aptos"
  | "base"
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
  decimals: number;
  symbol: string;
};

export type TokenAsset = {
  contract: string;
  decimals: number;
  symbol: string;
};

export interface PaymentAddress {
  helpKey: string;
  nameKey: string;
  pattern?: RegExp;
}

export interface PaymentKey {
  helpKey?: string;
  nameKey: string;
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
  key?: PaymentKey;
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
    decimals: 6,
    symbol: "USDT",
  },
};

export const evmAssets: Record<string, Record<string, TokenAsset>> = {
  base: {
    usdc: { contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, symbol: "USDC" },
    usdt: { contract: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6, symbol: "USDT" },
  },
  erc20: {
    usdt: { contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, symbol: "USDT" },
    usdc: { contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, symbol: "USDC" },
  },
  bep20: {
    usdt: { contract: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, symbol: "USDT" },
    usdc: { contract: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, symbol: "USDC" },
  },
  polygon: {
    usdt: { contract: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6, symbol: "USDT" },
    usdc: { contract: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6, symbol: "USDC" },
  },
};

export const tonAssets: Record<string, TokenAsset> = {
  usdt: {
    contract: "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe",
    decimals: 6,
    symbol: "USDT",
  },
};

export const aptosAssets: Record<string, TokenAsset> = {
  usdc: {
    contract: "0xbae7a5369b48c62ddc83e06f3d8a6f4a967d7f8ab6e433c0f2d5a62fdd6f3b",
    decimals: 6,
    symbol: "USDC",
  },
  usdt: {
    contract: "0x357b0b28bb206f00e1ed4e0d6a5d0b8b95117c5c8840ad2b0f0e2c38b8f2dc2b",
    decimals: 6,
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
  explorer: {
    transaction: "https://etherscan.io/tx/{hash}",
  },
  icon: "icon-ethereum",
  id: "erc20",
  kind: "chain",
  nameKey: "network.erc20",
  network: "erc20",
};

export const base: Payment = {
  address: {
    helpKey: "payment.help.evm",
    nameKey: "payment.address.evm",
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  assets: ["usdt", "usdc", "eth"],
  evm: true,
  explorer: {
    transaction: "https://basescan.org/tx/{hash}",
  },
  icon: "icon-base",
  id: "base",
  kind: "chain",
  nameKey: "network.base",
  network: "base",
};

export const bep20: Payment = {
  address: {
    helpKey: "payment.help.evm",
    nameKey: "payment.address.evm",
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  assets: ["usdt", "usdc", "bnb"],
  evm: true,
  explorer: {
    transaction: "https://bscscan.com/tx/{hash}",
  },
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
  explorer: {
    transaction: "https://polygonscan.com/tx/{hash}",
  },
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
  explorer: {
    transaction: "https://tonviewer.com/transaction/{hash}",
  },
  icon: "icon-ton",
  id: "ton",
  kind: "chain",
  nameKey: "network.ton",
  network: "ton",
};

export const aptos: Payment = {
  address: {
    helpKey: "payment.help.aptos",
    nameKey: "payment.address.aptos",
    pattern: /^0x[a-fA-F0-9]{64}$/,
  },
  assets: ["usdt", "usdc"],
  explorer: {
    transaction: "https://explorer.aptoslabs.com/txn/{hash}?network=mainnet",
  },
  icon: "icon-aptos",
  id: "aptos",
  kind: "chain",
  nameKey: "network.aptos",
  network: "aptos",
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
    helpKey: "payment.okpay.id_help",
    nameKey: "payment.okpay.id",
    pattern: /^[1-9]\d*$/,
  },
  assets: ["usdt", "trx"],
  key: {
    helpKey: "payment.okpay.key_help",
    nameKey: "payment.okpay.key",
  },
  icon: "icon-okpay",
  id: "okpay",
  kind: "wallet",
  nameKey: "network.okpay",
  network: "okpay",
};

export const payments: Payment[] = [
  trc20,
  erc20,
  base,
  bep20,
  polygon,
  ton,
  aptos,
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

export function paymentAssetIcon(asset: unknown) {
  const key = normalizePaymentAsset(asset) as PaymentAssetKey;
  return paymentAssets[key]?.icon ?? "";
}
