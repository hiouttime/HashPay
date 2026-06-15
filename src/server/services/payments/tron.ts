import { AppError } from "@/server/http/api-error";
import type { PaymentSnapshot, PaymentTxEvidence } from "@/shared/types/domain";

interface TronGridTransfer {
  block_timestamp: number;
  from: string;
  to: string;
  token_info?: {
    address?: string;
    decimals?: number;
    symbol?: string;
  };
  transaction_id: string;
  value: string;
}

interface TronNativeTransfer {
  block_timestamp: number;
  raw_data?: {
    contract?: Array<{
      type?: string;
      parameter?: {
        value?: {
          amount?: number;
          owner_address?: string;
          to_address?: string;
        };
      };
    }>;
  };
  txID: string;
}

function decimalAmount(value: string | number, decimals: number) {
  return Number(value) / 10 ** decimals;
}

function tokenAllowed(symbol: string, currency: string) {
  return symbol.trim().toUpperCase() === currency.trim().toUpperCase();
}

export async function fetchTronCandidates(snapshot: PaymentSnapshot, fromTime: number) {
  if (snapshot.network !== "tron" || !snapshot.address) return [];
  const minTimestamp = Math.max(0, fromTime) * 1000;
  const transfersUrl = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(snapshot.address)}/transactions/trc20?limit=50&only_confirmed=true&min_timestamp=${minTimestamp}`;
  const nativeUrl = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(snapshot.address)}/transactions?limit=50&only_to=true&only_confirmed=true&min_timestamp=${minTimestamp}`;
  const [tokens, native] = await Promise.all([
    fetch(transfersUrl).then((res) => res.json() as Promise<{ data?: TronGridTransfer[] }>),
    fetch(nativeUrl).then((res) => res.json() as Promise<{ data?: TronNativeTransfer[] }>),
  ]);
  const candidates: PaymentTxEvidence[] = [];
  for (const item of tokens.data ?? []) {
    const symbol = item.token_info?.symbol ?? "";
    if (!tokenAllowed(symbol, snapshot.currency)) continue;
    candidates.push({
      amount: decimalAmount(item.value, item.token_info?.decimals ?? 6),
      confirmedBy: "cron",
      currency: symbol.toUpperCase(),
      from: item.from,
      hash: item.transaction_id,
      raw: item,
      timestamp: Math.floor(item.block_timestamp / 1000),
      to: item.to,
    });
  }
  if (snapshot.currency.toUpperCase() === "TRX") {
    for (const item of native.data ?? []) {
      const contract = item.raw_data?.contract?.[0];
      const value = contract?.parameter?.value;
      if (contract?.type !== "TransferContract" || !value?.amount) continue;
      candidates.push({
        amount: decimalAmount(value.amount, 6),
        confirmedBy: "cron",
        currency: "TRX",
        from: value.owner_address,
        hash: item.txID,
        raw: item,
        timestamp: Math.floor(item.block_timestamp / 1000),
        to: snapshot.address,
      });
    }
  }
  return candidates;
}

export function parseSubmittedTxCandidates(input: unknown): PaymentTxEvidence[] {
  if (!input || typeof input !== "object" || !Array.isArray((input as { candidates?: unknown }).candidates)) {
    throw new AppError(400, "tx_candidates_invalid", "Transaction candidates are invalid");
  }
  return (input as { candidates: unknown[] }).candidates
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        amount: Number(row.amount),
        confirmedBy: "frontend" as const,
        currency: String(row.currency ?? ""),
        from: typeof row.from === "string" ? row.from : undefined,
        hash: String(row.hash ?? ""),
        raw: row.raw ?? row,
        timestamp: Number(row.timestamp),
        to: typeof row.to === "string" ? row.to : undefined,
      };
    })
    .filter((item) => item.hash && Number.isFinite(item.amount) && Number.isFinite(item.timestamp));
}
