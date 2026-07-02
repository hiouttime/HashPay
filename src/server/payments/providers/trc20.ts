import { normalizePaymentAsset } from "@/shared/payments";
import type { PaymentCheckInput, PaymentCheckResult } from "@/server/payments/driver";
import type { PaymentSnapshot } from "@/shared/types/domain";
import { sameAmount } from "@/shared/amount";

type Asset = { contract: string; symbol: string };
type Candidate = {
  amount: number;
  currency: string;
  hash: string;
  raw: unknown;
  timestamp: number;
  to?: string;
};

const assets: Record<string, Asset> = {
  usdt: {
    contract: "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",
    symbol: "USDT",
  },
};

interface TronGridTokenTx {
  block_timestamp: number;
  from?: string;
  to?: string;
  token_info?: {
    address?: string;
    decimals?: number;
    symbol?: string;
  };
  transaction_id?: string;
  value?: string;
}

interface TronGridNativeTx {
  block_timestamp: number;
  raw_data?: {
    contract?: Array<{
      parameter?: {
        value?: {
          amount?: number;
          owner_address?: string;
        };
      };
      type?: string;
    }>;
  };
  txID?: string;
}

export async function check(input: PaymentCheckInput): Promise<PaymentCheckResult> {
  try {
    const txs = input.candidates ? submitted(input.candidates) : await scan(input.snapshot, input.createdAt, input.fastConfirm);
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
      .map((item) => nativeCandidate(item, address))
      .filter((item): item is Candidate => item !== null);
  }

  const tokenAsset = assets[asset];
  if (tokenAsset) {
    params.set("contract_address", tokenAsset.contract);
    return (await tronGrid<TronGridTokenTx>(address, "transactions/trc20", params))
      .map((item) => tokenCandidate(item, asset, tokenAsset))
      .filter((item): item is Candidate => item !== null);
  }

  return [];
}

async function tronGrid<T>(address: string, path: string, params: URLSearchParams) {
  const url = `https://nile.trongrid.io/v1/accounts/${encodeURIComponent(address)}/${path}?${params}`;
  const result = await fetch(url).then((res) => res.json() as Promise<{ data?: T[] }>);
  if (!Array.isArray(result.data)) throw new Error("TronGrid response is invalid");
  return result.data;
}

function tokenCandidate(item: TronGridTokenTx, currency: string, asset: Asset): Candidate | null {
  if (item.token_info?.address !== asset.contract || String(item.token_info?.symbol || "").toUpperCase() !== asset.symbol) return null;
  return {
    amount: Number(item.value) / 10 ** Number(item.token_info?.decimals ?? 6),
    currency,
    hash: String(item.transaction_id || ""),
    raw: item,
    timestamp: Math.floor(Number(item.block_timestamp) / 1000),
    to: item.to,
  };
}

function nativeCandidate(item: TronGridNativeTx, address: string): Candidate | null {
  const contract = item.raw_data?.contract?.[0];
  const value = contract?.parameter?.value;
  if (contract?.type !== "TransferContract" || !value?.amount) return null;
  return {
    amount: Number(value.amount) / 1_000_000,
    currency: "trx",
    hash: String(item.txID || ""),
    raw: item,
    timestamp: Math.floor(Number(item.block_timestamp) / 1000),
    to: address,
  };
}

function submitted(input: unknown) {
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

function match(snapshot: PaymentSnapshot, tx: Candidate, created: number, expire: number) {
  if (!tx.hash || tx.timestamp < created || tx.timestamp > expire) return false;
  const asset = normalizePaymentAsset(snapshot.currency);
  if (normalizePaymentAsset(tx.currency) !== asset) return false;
  if (assets[asset] && String((tx.raw as TronGridTokenTx).token_info?.address ?? "") !== assets[asset].contract) return false;
  if (!sameAmount(tx.amount, snapshot.amount)) return false;
  if (snapshot.address !== tx.to) return false;
  return true;
}
