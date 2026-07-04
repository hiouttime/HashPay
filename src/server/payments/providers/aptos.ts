import Decimal from "decimal.js";
import type { PaymentCheckInput, PaymentCheckResult } from "@/server/payments/driver";
import { paymentMatches } from "@/server/payments/match";
import { sameAmount } from "@/shared/amount";
import { aptosAssets, key } from "@/shared/payments";
import type { TxCandidate } from "@/shared/types/domain";
import type { PaymentSnapshot } from "@/shared/types/domain";

const endpoint = "https://api.mainnet.aptoslabs.com/v1/graphql";

export async function check(input: PaymentCheckInput): Promise<PaymentCheckResult> {
  try {
    const txs = await scan(input);
    return {
      matches: paymentMatches(input.orders, txs, match, (tx) => ({ time: tx.timestamp, txid: tx.hash })),
      status: "ok",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Aptos check failed", matches: [], status: "error" };
  }
}

async function scan(input: PaymentCheckInput) {
  const address = String(input.channel?.address ?? input.orders[0]?.snapshot.address ?? "");
  if (!address) return [];
  const assets = Array.from(new Set(input.orders.map((order) => key(order.snapshot.currency)).filter(Boolean)));
  return activities(
    address,
    assets,
    Math.min(...input.orders.map((order) => order.createdAt)),
    Math.max(...input.orders.map((order) => order.expireAt)),
  );
}

async function activities(address: string, assets: string[], createdAt: number, expireAt: number) {
  const contracts = assets.map((asset) => aptosAssets[asset]?.contract).filter(Boolean);
  if (!contracts.length) return [];
  const rows = await graphql<{
    fungible_asset_activities?: Array<Record<string, unknown>>;
  }>(`
    query($owner: String!, $assets: [String!], $start: timestamp!, $end: timestamp!) {
      fungible_asset_activities(
        where: {
          owner_address: { _eq: $owner }
          asset_type: { _in: $assets }
          transaction_timestamp: { _gte: $start, _lte: $end }
          type: { _eq: "deposit" }
          is_transaction_success: { _eq: true }
        }
        order_by: { transaction_timestamp: desc }
        limit: 50
      ) {
        amount
        asset_type
        transaction_timestamp
        transaction_version
        owner_address
        type
      }
    }
  `, {
    assets: contracts,
    end: iso(expireAt),
    owner: address,
    start: iso(createdAt),
  });
  return (rows.fungible_asset_activities ?? []).map(tx);
}

function match(snapshot: PaymentSnapshot, tx: TxCandidate, created: number, expire: number) {
  const asset = key(snapshot.currency);
  const token = aptosAssets[asset];
  return Boolean(tx.hash)
    && tx.timestamp >= created
    && tx.timestamp <= expire
    && key(tx.currency) === asset
    && (!token || contract(tx.raw) === token.contract)
    && sameAmount(tx.amount, snapshot.amount)
    && snapshot.address === tx.to;
}

async function graphql<T>(query: string, variables: Record<string, unknown>) {
  const res = await fetch(endpoint, {
    body: JSON.stringify({ query, variables }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) throw new Error(`Aptos request failed: ${res.status}`);
  const payload = await res.json() as { data?: T; errors?: Array<{ message?: string }> };
  if (payload.errors?.length || !payload.data) throw new Error(payload.errors?.[0]?.message ?? "Aptos response is invalid");
  return payload.data;
}

function tx(row: Record<string, unknown>) {
  const asset = Object.entries(aptosAssets).find(([, item]) => item.contract === row.asset_type)?.[0] ?? "";
  const token = aptosAssets[asset];
  return {
    amount: amount(row.amount, token?.decimals ?? 0),
    currency: asset,
    hash: String(row.transaction_version ?? ""),
    raw: row,
    timestamp: Math.floor(Date.parse(String(row.transaction_timestamp)) / 1000),
    to: String(row.owner_address ?? ""),
  };
}

function amount(value: unknown, decimals: number) {
  return new Decimal(String(value ?? "0")).div(new Decimal(10).pow(decimals)).toNumber();
}

function contract(raw: unknown) {
  return String((raw as Record<string, unknown>).asset_type ?? "");
}

function iso(value: number) {
  return new Date(value * 1000).toISOString();
}
