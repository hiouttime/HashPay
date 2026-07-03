import { normalizePaymentAsset, trc20Assets } from "@/shared/payments";
import type { PaymentCheckInput, PaymentCheckResult } from "@/server/payments/driver";
import type { PaymentSnapshot } from "@/shared/types/domain";
import { sameAmount } from "@/shared/amount";
import { trc20Candidate, trc20ContractMatches, trxCandidate, type TronGridNativeTx, type TronGridTokenTx } from "@/shared/trongrid";
import type { TxCandidate } from "@/shared/types/api";

export async function check(input: PaymentCheckInput): Promise<PaymentCheckResult> {
  try {
    const txs = input.candidates ? submittedTxs(input.candidates) : await scan(input.snapshot, input.createdAt, input.fastConfirm);
    const tx = txs.find((item) => match(input.snapshot, item, input.createdAt, input.expireAt));
    if (!tx) return { status: "pending" };
    return { status: "paid", time: tx.timestamp, txid: tx.hash };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "TRC20 check failed", status: "error" };
  }
}

async function scan(snapshot: PaymentSnapshot, from: number, fast: boolean) {
  const asset = normalizePaymentAsset(snapshot.currency);
  const address = String(snapshot.address);
  const params = new URLSearchParams({
    limit: "50",
    min_timestamp: String(Math.max(0, from) * 1000),
    only_confirmed: fast ? "false" : "true",
  });

  if (asset === "trx") {
    params.set("only_to", "true");
    return (await tronGrid<TronGridNativeTx>(address, "transactions", params))
      .map((item) => trxCandidate(item, address))
      .filter((item): item is TxCandidate => item !== null);
  }

  const tokenAsset = trc20Assets[asset];
  if (tokenAsset) {
    params.set("contract_address", tokenAsset.contract);
    return (await tronGrid<TronGridTokenTx>(address, "transactions/trc20", params))
      .map((item) => trc20Candidate(item, asset))
      .filter((item): item is TxCandidate => item !== null);
  }

  return [];
}

async function tronGrid<T>(address: string, path: string, params: URLSearchParams) {
  const url = `https://nile.trongrid.io/v1/accounts/${encodeURIComponent(address)}/${path}?${params}`;
  const result = await fetch(url).then((res) => res.json() as Promise<{ data?: T[] }>);
  if (!Array.isArray(result.data)) throw new Error("TronGrid response is invalid");
  return result.data;
}

function submittedTxs(input: unknown) {
  const candidates = (input as { candidates: unknown[] }).candidates;
  return candidates.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      amount: Number(row.amount),
      currency: normalizePaymentAsset(row.currency),
      hash: String(row.hash ?? ""),
      raw: row.raw ?? row,
      timestamp: Number(row.timestamp),
      to: typeof row.to === "string" ? row.to : undefined,
    };
  });
}

function match(snapshot: PaymentSnapshot, tx: TxCandidate, created: number, expire: number) {
  const asset = normalizePaymentAsset(snapshot.currency);
  return Boolean(tx.hash)
    && tx.timestamp >= created
    && tx.timestamp <= expire
    && normalizePaymentAsset(tx.currency) === asset
    && trc20ContractMatches(asset, tx.raw)
    && sameAmount(tx.amount, snapshot.amount)
    && snapshot.address === tx.to;
}
