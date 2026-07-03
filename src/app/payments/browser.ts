import { normalizePaymentAsset, trc20Assets } from "@/shared/payments";
import { trc20Candidate, trxCandidate, type TronGridNativeTx, type TronGridTokenTx } from "@/shared/trongrid";
import type { TxCandidate } from "@/shared/types/api";
import type { PaymentSnapshot } from "@/shared/types/domain";

type BrowserPaymentSnapshot = Partial<Pick<PaymentSnapshot, "address" | "currency" | "driver">>;
type OrderSnapshot = { createdAt?: number };
type BrowserCheck = (payment: BrowserPaymentSnapshot, order: OrderSnapshot, fastConfirm: boolean) => Promise<TxCandidate[]>;

const checks: Record<string, BrowserCheck> = {
  trc20,
};

export function canProbeInBrowser(payment: BrowserPaymentSnapshot) {
  return Boolean(payment.address && checks[String(payment.driver || "")]);
}

export async function browserTxCandidates(payment: BrowserPaymentSnapshot, order: OrderSnapshot, fastConfirm: boolean) {
  return await checks[String(payment.driver)](payment, order, fastConfirm);
}

async function trc20(payment: BrowserPaymentSnapshot, order: OrderSnapshot, fastConfirm: boolean) {
  const address = String(payment.address || "");
  const asset = normalizePaymentAsset(payment.currency);
  const params = new URLSearchParams({
    limit: "50",
    min_timestamp: String(Math.max(0, Number(order.createdAt ?? 0)) * 1000),
    only_confirmed: fastConfirm ? "false" : "true",
  });

  if (asset === "trx") {
    params.set("only_to", "true");
    return validCandidates((await tronGrid<TronGridNativeTx>(address, "transactions", params)).map((item) => trxCandidate(item, address)));
  }

  const token = trc20Assets[asset];
  if (!token) return [];
  params.set("contract_address", token.contract);
  return validCandidates((await tronGrid<TronGridTokenTx>(address, "transactions/trc20", params)).map((item) => trc20Candidate(item, asset)));
}

async function tronGrid<T>(address: string, path: string, params: URLSearchParams) {
  const url = `https://nile.trongrid.io/v1/accounts/${encodeURIComponent(address)}/${path}?${params}`;
  const payload = await fetch(url).then((res) => res.json() as Promise<{ data?: T[] }>);
  return Array.isArray(payload.data) ? payload.data : [];
}

function validCandidates(candidates: Array<TxCandidate | null>) {
  return candidates.filter((item): item is TxCandidate => Boolean(item?.hash && Number.isFinite(item.amount) && Number.isFinite(item.timestamp)));
}
