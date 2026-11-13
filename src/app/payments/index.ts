import { appT } from "@/app/i18n";
import { assetName, key, paymentById, paymentByNetwork, paymentExplorerUrl, payments, type Payment, type PaymentKind } from "@/shared/payments";
import type { PaymentSnapshot } from "@/shared/types/domain";

export interface DriverChoice extends Payment {
  networks?: string[];
}

export interface CheckoutOption {
  amount: number;
  asset: string;
  label: string;
  network: string;
  value: string;
}

export const evmId = "evm";

const chains = payments.filter((payment) => payment.kind === "chain");

function definition(value: unknown) {
  return paymentById(value) ?? paymentByNetwork(value);
}

export function networkKey(value: unknown) {
  return key(String(value).split("/").pop());
}

export function networkName(network: unknown) {
  const payment = definition(network);
  return payment ? appT(payment.nameKey) : String(network || "");
}

export function networkIcon(network: unknown) {
  return definition(network)?.icon || "";
}

// Channel-form choices for a kind. EVM networks share one address format, so they are offered
// as a single "evm" choice that fans out into one channel per selected network.
export function choices(kind: PaymentKind, editingId = ""): DriverChoice[] {
  const drivers = payments.filter((driver) => driver.kind === kind);
  if (editingId) return drivers.filter((driver) => driver.id === editingId);
  const evm = drivers.filter((driver) => driver.evm);
  return drivers.flatMap((driver) => {
    if (!driver.evm) return [driver];
    // The first EVM network supplies the shared address rules, icon and display network.
    return driver === evm[0] ? [{ ...driver, assets: [...new Set(evm.flatMap((item) => item.assets))], id: evmId, networks: evm.map((item) => item.network) }] : [];
  });
}

export function checkoutOptions(options: Array<{ amount: number; asset: unknown; network: unknown }>): CheckoutOption[] {
  const seen = new Set<string>();
  return options.flatMap((option) => {
    const asset = key(option.asset);
    const network = networkKey(option.network);
    const value = `${asset}:${network}`;
    if (!asset || !network || seen.has(value)) return [];
    seen.add(value);
    return [{ amount: option.amount, asset, label: `${networkName(network)} / ${assetName(asset)}`, network, value }];
  });
}

export function reviewNetworkOptions() {
  return chains.map((payment) => appT(payment.nameKey));
}

export function reviewAssetOptions() {
  return [...new Set(chains.flatMap((payment) => payment.assets))].map((asset) => assetName(asset));
}

export function txUrl(payment: { driver?: string; tx?: { txid?: string } }) {
  return paymentExplorerUrl(payment?.driver, payment?.tx?.txid);
}

export function paymentInstruction(payment: Partial<PaymentSnapshot>) {
  const names = { asset: assetName(payment.currency), network: networkName(payment.driver), platform: networkName(payment.driver) };
  if (definition(payment.driver)?.kind === "exchange") return appT("checkout.pay_with_exchange", names);
  return appT(payment.url ? "checkout.pay_with_platform" : "checkout.pay_with_network", names);
}
