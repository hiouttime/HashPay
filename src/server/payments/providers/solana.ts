import Decimal from "decimal.js";
import type { PaymentChannel } from "@/server/payments/channels";
import type { PaymentCheckInput } from "@/server/payments/driver";
import { paymentMatches } from "@/server/payments/match";
import { fetchText, host, reason } from "@/server/utils/http";
import { key, solanaAssets } from "@/shared/payments";
import type { PaymentSnapshot, TxCandidate } from "@/shared/types/domain";

const endpoint = "https://public.rpc.solanavibestation.com/";
const tokenPrograms = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const transferTypes = new Set(["transfer", "transferChecked"]);

type Commitment = "confirmed" | "finalized";
type Instruction = {
  parsed?: {
    info?: {
      amount?: string;
      destination?: string;
      mint?: string;
      tokenAmount?: { amount?: string };
    };
    type?: string;
  };
  programId?: string;
};
type Transaction = {
  blockTime?: number;
  meta?: { err?: unknown; innerInstructions?: Array<{ instructions?: Instruction[] }> };
  transaction?: { message?: { instructions?: Instruction[] } };
};

export async function check(channel: PaymentChannel) {
  const asset = channel.assets.map(key).find((item) => solanaAssets[item]);
  if (!asset) throw new Error("Solana asset is not configured");
  await tokenAccounts(channel.address, solanaAssets[asset]!.contract, "finalized");
}

export async function scan(input: PaymentCheckInput) {
  return paymentMatches(input.orders, await transactions(input), match, (tx) => ({ time: tx.timestamp, txid: tx.hash }), input.tolerance);
}

async function transactions(input: PaymentCheckInput) {
  const owner = input.channel?.address || input.orders[0]!.snapshot.address!;
  const createdAt = Math.min(...input.orders.map((order) => order.createdAt));
  const expireAt = Math.max(...input.orders.map((order) => order.expireAt));
  const commitment: Commitment = input.fastConfirm ? "confirmed" : "finalized";
  const txs: TxCandidate[] = [];
  for (const asset of new Set(input.orders.map((order) => key(order.snapshot.currency)))) {
    const token = solanaAssets[asset];
    if (!token) continue;
    for (const account of await tokenAccounts(owner, token.contract, commitment)) {
      const signatures = await rpc<Array<{ blockTime?: number | null; err?: unknown; signature: string }>>("getSignaturesForAddress", [
        account,
        { commitment, limit: 50 },
      ]);
      for (const row of signatures) {
        if (row.err || !row.blockTime || row.blockTime < createdAt || row.blockTime > expireAt) continue;
        const tx = await rpc<Transaction | null>("getTransaction", [
          row.signature,
          { commitment, encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ]);
        if (!tx?.transaction || tx.meta?.err != null) continue;
        txs.push(...candidates(tx, { account, asset, decimals: token.decimals, mint: token.contract, owner, signature: row.signature }));
      }
    }
  }
  return txs;
}

async function tokenAccounts(owner: string, mint: string, commitment: Commitment) {
  const payload = await rpc<{ value: Array<{ pubkey: string }> }>("getTokenAccountsByOwner", [
    owner,
    { mint },
    { commitment, encoding: "jsonParsed" },
  ]);
  return payload.value.map((item) => item.pubkey);
}

function candidates(tx: Transaction, input: { account: string; asset: string; decimals: number; mint: string; owner: string; signature: string }) {
  const instructions = [
    ...(tx.transaction?.message?.instructions ?? []),
    ...(tx.meta?.innerInstructions ?? []).flatMap((group) => group.instructions ?? []),
  ];
  return instructions.flatMap((instruction) => {
    const info = instruction.parsed?.info;
    const type = instruction.parsed?.type ?? "";
    if (!info || !tokenPrograms.has(instruction.programId ?? "") || !transferTypes.has(type) || info.destination !== input.account) return [];
    const raw = info.tokenAmount?.amount ?? info.amount;
    const mint = info.mint ?? input.mint;
    if (!raw || mint !== input.mint) return [];
    return [{
      amount: new Decimal(raw).div(new Decimal(10).pow(input.decimals)).toNumber(),
      currency: input.asset,
      hash: input.signature,
      raw: { mint },
      timestamp: Number(tx.blockTime),
      to: input.owner,
    }];
  });
}

function match(snapshot: PaymentSnapshot, tx: TxCandidate, created: number, expire: number) {
  const asset = key(snapshot.currency);
  const paid = Boolean(tx.hash)
    && tx.timestamp >= created
    && tx.timestamp <= expire
    && key(tx.currency) === asset
    && solanaAssets[asset]?.contract === (tx.raw as { mint?: string }).mint
    && snapshot.address === tx.to;
  return paid ? tx.amount : null;
}

async function rpc<T>(method: string, params: unknown[]) {
  const { res, text } = await fetchText(endpoint, {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) throw new Error(`Solana ${host(endpoint)} ${method}: HTTP ${res.status} ${reason(text || res.statusText)}`.trim());
  const payload = JSON.parse(text) as { error?: { message?: string }; result?: T };
  if (payload.error || payload.result === undefined) {
    throw new Error(`Solana ${host(endpoint)} ${method}: ${reason(payload.error?.message ?? "response is invalid")}`);
  }
  return payload.result;
}
