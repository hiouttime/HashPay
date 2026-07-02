import { assetLabel, assetSymbol, normalizeAssetCsv, normalizeNetworkKey, normalizePaymentAsset } from "@/shared/payments";
import {
  defaultPayment,
  evmPayments,
  paymentAssetIcon,
  paymentByNetwork,
  paymentExplorerUrl,
  payments,
  type Payment,
  type PaymentKind,
} from "@/shared/payments";

export type Kind = PaymentKind;
export type PaymentField = {
  help?: string;
  key: "account" | "address";
  label: string;
  pattern?: RegExp;
  required: true;
  type: "text";
};

export interface DriverChoice extends Payment {
  networkAssets?: Record<string, string[]>;
  networks?: string[];
}

export interface CheckoutOption {
  amount: number;
  asset: string;
  label: string;
  network: string;
  value: string;
}

export interface PaymentSnapshot {
  address?: string;
  currency?: string;
  network?: string;
}

export interface OrderSnapshot {
  createdAt?: number;
}

export interface TxCandidate {
  amount: number;
  currency: string;
  from?: string;
  hash: string;
  raw: unknown;
  timestamp: number;
  to?: string;
}

export const evmId = "evm";
export const evmIconNetwork = "erc20";
export const evmSchemaDriver = evmPayments[0]!.id;
export const defaultDriver = defaultPayment;
export const kinds: Array<{ label: string; value: Kind }> = [
  { label: "区块链", value: "chain" },
  { label: "交易所", value: "exchange" },
  { label: "第三方钱包", value: "wallet" },
];

const publicChecks: Record<string, (payment: PaymentSnapshot, order: OrderSnapshot, fastConfirm: boolean) => Promise<TxCandidate[]>> = {
  trongrid: tronGrid,
};
const nileUsdtContract = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";

export function networkKey(value: unknown) {
  const raw = String(value).trim();
  return normalizeNetworkKey(raw.includes("/") ? raw.split("/").pop() : raw);
}

export function assetKey(value: unknown) {
  return normalizePaymentAsset(value);
}

export const drivers = payments;

export function isEvm(driver: Pick<Payment, "evm" | "id"> | string | undefined) {
  return typeof driver === "string" ? driver === evmId : driver?.id === evmId || driver?.evm === true;
}

export function isEvmDriver(drivers: Payment[], driverId: string) {
  return drivers.find((driver) => driver.id === driverId)?.evm === true;
}

export function choices(drivers: Payment[], kind: Kind, editingDriverId = ""): DriverChoice[] {
  if (editingDriverId) return drivers.filter((driver) => driver.kind === kind && driver.id === editingDriverId);
  if (kind !== "chain") return drivers.filter((driver) => driver.kind === kind);

  const evm = drivers.filter((driver) => driver.evm);
  const out: DriverChoice[] = [];
  let evmInserted = false;

  for (const driver of drivers.filter((item) => item.kind === "chain")) {
    if (driver.evm) {
      if (!evmInserted) {
        out.push(evmChoiceFrom(evm));
        evmInserted = true;
      }
    } else {
      out.push(driver);
    }
  }

  return out;
}

export function evmDriver(drivers: Payment[], network: string) {
  return drivers.find((driver) => driver.evm && driver.network === network)!;
}

export function kindOf(drivers: Payment[], driverId: string): Kind {
  const driver = drivers.find((item) => item.id === driverId)!;
  return driver.evm ? "chain" : driver.kind;
}

export function assets(raw: unknown) {
  return normalizeAssetCsv(raw);
}

export function assetName(asset: unknown) {
  return assetLabel(asset);
}

export function assetIcon(asset: unknown) {
  return paymentAssetIcon(asset);
}

export function networkName(network: unknown) {
  return paymentByNetwork(network)?.name || String(network || "");
}

export function networkIcon(network: unknown) {
  return paymentByNetwork(network)?.icon || "";
}

export function checkoutOptions(options: Array<{
  amount: number;
  asset: unknown;
  network: unknown;
}>): CheckoutOption[] {
  const seen = new Set<string>();
  return options.flatMap((option) => {
    const asset = assetKey(option.asset);
    const itemNetwork = networkKey(option.network);
    const key = `${asset}:${itemNetwork}`;
    if (!asset || !itemNetwork || seen.has(key)) return [];
    seen.add(key);
    const definition = paymentByNetwork(itemNetwork);
    const next = {
      amount: option.amount,
      asset,
      network: itemNetwork,
      value: key,
    };
    return [{ ...next, label: `${definition?.name || itemNetwork} / ${assetName(asset)}` }];
  });
}

export function canProbeInBrowser(payment: PaymentSnapshot) {
  const publicCheck = paymentByNetwork(payment.network)?.publicCheck;
  return Boolean(payment.address && publicCheck && publicChecks[publicCheck]);
}

export async function browserTxCandidates(payment: PaymentSnapshot, order: OrderSnapshot, fastConfirm: boolean) {
  const publicCheck = paymentByNetwork(payment.network)?.publicCheck;
  const check = publicCheck ? publicChecks[publicCheck] : undefined;
  return check ? await check(payment, order, fastConfirm) : [];
}

export function reviewNetworkOptions() {
  return payments.filter((payment) => payment.kind === "chain").map((payment) => payment.name);
}

export function reviewAssetOptions() {
  return Array.from(new Set(payments.filter((payment) => payment.kind === "chain").flatMap((payment) => payment.assets))).map((asset) => assetName(asset));
}

export function driverNetwork(driver: DriverChoice | Payment) {
  return isEvm(driver) && "networks" in driver ? driver.networks![0] : driver.network;
}

export function driverNetworks(driver: DriverChoice | Payment) {
  return "networks" in driver && driver.networks?.length ? driver.networks : [driver.network];
}

export function assetsFor(driver: DriverChoice | Payment, network: string) {
  if ("networkAssets" in driver && driver.networkAssets?.[network]) return driver.networkAssets[network];
  return driver.assets;
}

export function addressError(driver: Payment, address: string) {
  if (!driver.address || !address || driver.address.pattern.test(address)) return "";
  return `${driver.address.name}格式不正确`;
}

export function txUrl(payment: Record<string, any>) {
  const txid = String(payment?.tx?.txid || "").trim();
  return paymentExplorerUrl(payment?.network, txid);
}

export function paymentInstruction(payment: Record<string, any>) {
  return `请通过 ${paymentByNetwork(payment.network)?.name || payment.network} 网络，发送 ${assetName(payment.currency)}`;
}

export function choiceNetwork(driver: DriverChoice) {
  return isEvm(driver) ? evmIconNetwork : driver.network;
}

export function fieldFor(driver: Payment): PaymentField {
  return {
    help: driver.address?.help,
    key: driver.address ? "address" : "account",
    label: driver.address?.name ?? driver.account?.name ?? "收款账户",
    pattern: driver.address?.pattern,
    required: true,
    type: "text",
  };
}

function evmChoiceFrom(evm: Payment[]): DriverChoice {
  return {
    account: undefined,
    address: evm[0]!.address,
    assets: Array.from(new Set(evm.flatMap((driver) => driver.assets))),
    evm: true,
    explorer: evm.find((driver) => driver.explorer)?.explorer,
    icon: evm.find((driver) => driver.network === evmIconNetwork)?.icon ?? evm[0]?.icon ?? "",
    id: evmId,
    kind: "chain",
    name: "EVM 兼容网络",
    network: evmIconNetwork,
    networkAssets: Object.fromEntries(evm.map((driver) => [driver.network, driver.assets])),
    networks: evm.map((driver) => driver.network),
  };
}

async function tronGrid(payment: PaymentSnapshot, order: OrderSnapshot, fastConfirm: boolean) {
  const address = String(payment.address || "");
  const currency = assetSymbol(payment.currency);
  const minTimestamp = Math.max(0, Number(order.createdAt ?? 0)) * 1000;
  const onlyConfirmed = fastConfirm ? "false" : "true";
  const candidates: TxCandidate[] = [];

  if (currency !== "TRX") {
    const tokens = await fetch(`https://nile.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?limit=50&only_confirmed=${onlyConfirmed}&contract_address=${nileUsdtContract}&min_timestamp=${minTimestamp}`).then((res) => res.json() as Promise<{ data?: any[] }>);
    candidates.push(...(tokens.data ?? []).flatMap((item: any) => {
      const symbol = String(item.token_info?.symbol || "").toUpperCase();
      if (symbol !== currency || item.token_info?.address !== nileUsdtContract) return [];
      return [{
        amount: Number(item.value) / 10 ** Number(item.token_info?.decimals ?? 6),
        currency: symbol,
        from: item.from,
        hash: item.transaction_id,
        raw: item,
        timestamp: Math.floor(Number(item.block_timestamp) / 1000),
        to: item.to,
      }];
    }));
  }

  if (currency === "TRX") {
    const native = await fetch(`https://nile.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions?limit=50&only_to=true&only_confirmed=${onlyConfirmed}&min_timestamp=${minTimestamp}`).then((res) => res.json() as Promise<{ data?: any[] }>);
    candidates.push(...(native.data ?? []).flatMap((item: any) => {
      const contract = item.raw_data?.contract?.[0];
      const value = contract?.parameter?.value;
      if (contract?.type !== "TransferContract" || !value?.amount) return [];
      return [{
        amount: Number(value.amount) / 1_000_000,
        currency: "TRX",
        from: value.owner_address,
        hash: item.txID,
        raw: item,
        timestamp: Math.floor(Number(item.block_timestamp) / 1000),
        to: address,
      }];
    }));
  }

  return candidates.filter((item) => item.hash && Number.isFinite(item.amount) && Number.isFinite(item.timestamp));
}
