import Decimal from "decimal.js";
import { aptosAssets, evmAssets, normalizeNetworkKey, normalizePaymentAsset, tonAssets, trc20Assets } from "@/shared/payments";
import { trc20Candidate, trxCandidate, type TronGridNativeTx, type TronGridTokenTx } from "@/shared/trongrid";
import type { TxCandidate } from "@/shared/types/domain";
import type { PaymentSnapshot } from "@/shared/types/domain";

type BrowserPaymentSnapshot = {
  address?: string;
  currency?: string;
  driver?: string;
};
type OrderSnapshot = { createdAt?: number };
type BrowserCheck = (payment: BrowserPaymentSnapshot, order: OrderSnapshot, fastConfirm: boolean) => Promise<TxCandidate[]>;

const checks: Record<string, BrowserCheck> = {
  aptos,
  base,
  bep20,
  erc20,
  polygon,
  ton,
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

async function erc20(payment: BrowserPaymentSnapshot) {
  return blockscout("https://eth.blockscout.com", payment);
}

async function base(payment: BrowserPaymentSnapshot) {
  return blockscout("https://base.blockscout.com", payment);
}

async function polygon(payment: BrowserPaymentSnapshot) {
  return blockscout("https://polygon.blockscout.com", payment);
}

async function bep20(payment: BrowserPaymentSnapshot, order: OrderSnapshot) {
  const asset = normalizePaymentAsset(payment.currency);
  const token = evmAssets.bep20?.[asset];
  if (!token || !payment.address) return [];
  const latest = Number.parseInt(await rpc<string>("eth_blockNumber", []), 16);
  const createdAt = Number(order.createdAt ?? 0);
  const checkedAt = Math.floor(Date.now() / 1000);
  const fromBlock = Math.max(0, latest - Math.ceil((checkedAt - createdAt) / 3));
  const logs = await rpc<Array<Record<string, unknown>>>("eth_getLogs", [
    {
      address: token.contract,
      fromBlock: hex(fromBlock),
      toBlock: "latest",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        null,
        `0x${String(payment.address).slice(2).toLowerCase().padStart(64, "0")}`,
      ],
    },
  ]);
  return validCandidates(logs.map((log) => (
    {
      amount: amount(log.data, token.decimals),
      currency: asset,
      hash: String(log.transactionHash ?? ""),
      raw: { ...log, contract: token.contract },
      timestamp: checkedAt,
      to: payment.address,
    }
  )));
}

async function blockscout(baseUrl: string, payment: BrowserPaymentSnapshot) {
  const network = normalizeNetworkKey(payment.driver);
  const asset = normalizePaymentAsset(payment.currency);
  const token = evmAssets[network]?.[asset];
  if (!payment.address) return [];
  if (token) {
    const params = new URLSearchParams({ token: token.contract, type: "ERC-20" });
    const payload = await fetch(`${baseUrl}/api/v2/addresses/${payment.address}/token-transfers?${params}`).then((res) => res.json() as Promise<{ items?: unknown[] }>);
    return validCandidates((payload.items ?? []).map((item) => {
      const row = item as Record<string, unknown>;
      const total = row.total as { value?: unknown } | undefined;
      return {
        amount: amount(total?.value, token.decimals),
        currency: asset,
        hash: String(row.transaction_hash ?? ""),
        raw: row,
        timestamp: Math.floor(Date.parse(String(row.timestamp)) / 1000),
        to: addressOf(row.to),
      };
    }));
  }

  const payload = await fetch(`${baseUrl}/api/v2/addresses/${payment.address}/transactions`).then((res) => res.json() as Promise<{ items?: unknown[] }>);
  return validCandidates((payload.items ?? []).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      amount: amount(row.value, 18),
      currency: asset,
      hash: String(row.hash ?? ""),
      raw: row,
      timestamp: Math.floor(Date.parse(String(row.timestamp)) / 1000),
      to: addressOf(row.to),
    };
  }));
}

async function ton(payment: BrowserPaymentSnapshot, order: OrderSnapshot) {
  const address = String(payment.address || "");
  const asset = normalizePaymentAsset(payment.currency);
  const start = Math.max(0, Number(order.createdAt ?? 0));
  if (!address) return [];
  if (asset === "gram") {
    const payload = await fetch(`https://toncenter.com/api/v3/transactions?account=${encodeURIComponent(address)}&limit=50&sort=desc&start_utime=${start}`).then((res) => res.json() as Promise<{ transactions?: unknown[] }>);
    return validCandidates((payload.transactions ?? []).map((item) => {
      const row = item as Record<string, unknown>;
      const inMsg = row.in_msg as { value?: unknown } | undefined;
      return {
        amount: amount(inMsg?.value, 9),
        currency: asset,
        hash: String(row.hash ?? ""),
        raw: row,
        timestamp: Number(row.now),
        to: address,
      };
    }));
  }

  const token = tonAssets[asset];
  if (!token) return [];
  const payload = await fetch(`https://toncenter.com/api/v3/jetton/transfers?owner_address=${encodeURIComponent(address)}&direction=in&limit=50&start_utime=${start}`).then((res) => res.json() as Promise<{ jetton_transfers?: unknown[] }>);
  return validCandidates((payload.jetton_transfers ?? []).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      amount: amount(row.amount, token.decimals),
      currency: asset,
      hash: String(row.transaction_hash ?? ""),
      raw: row,
      timestamp: Number(row.transaction_now),
      to: address,
    };
  }));
}

async function aptos(payment: BrowserPaymentSnapshot, order: OrderSnapshot) {
  const address = String(payment.address || "");
  const asset = normalizePaymentAsset(payment.currency);
  const token = aptosAssets[asset];
  if (!address || !token) return [];
  const query = `
    query($owner: String!, $assets: [String!], $start: timestamp!) {
      fungible_asset_activities(
        where: {
          owner_address: { _eq: $owner }
          asset_type: { _in: $assets }
          transaction_timestamp: { _gte: $start }
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
  `;
  const payload = await fetch("https://api.mainnet.aptoslabs.com/v1/graphql", {
    body: JSON.stringify({
      query,
      variables: {
        assets: [token.contract],
        owner: address,
        start: new Date(Math.max(0, Number(order.createdAt ?? 0)) * 1000).toISOString(),
      },
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }).then((res) => res.json() as Promise<{ data?: { fungible_asset_activities?: unknown[] } }>);
  return validCandidates((payload.data?.fungible_asset_activities ?? []).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      amount: amount(row.amount, token.decimals),
      currency: asset,
      hash: String(row.transaction_version ?? ""),
      raw: row,
      timestamp: Math.floor(Date.parse(String(row.transaction_timestamp)) / 1000),
      to: String(row.owner_address ?? ""),
    };
  }));
}

async function tronGrid<T>(address: string, path: string, params: URLSearchParams) {
  const url = `https://nile.trongrid.io/v1/accounts/${encodeURIComponent(address)}/${path}?${params}`;
  const payload = await fetch(url).then((res) => res.json() as Promise<{ data?: T[] }>);
  return Array.isArray(payload.data) ? payload.data : [];
}

function validCandidates(candidates: Array<TxCandidate | null>) {
  return candidates.filter((item): item is TxCandidate => Boolean(item?.hash && Number.isFinite(item.amount) && Number.isFinite(item.timestamp)));
}

async function rpc<T>(method: string, params: unknown[]) {
  const res = await fetch("https://bsc-dataseed.binance.org", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await res.json() as { result?: T };
  return payload.result as T;
}

function addressOf(value: unknown) {
  return typeof value === "string" ? value : String((value as { hash?: unknown } | null)?.hash ?? "");
}

function amount(value: unknown, decimals: number) {
  const text = String(value ?? "0");
  return new Decimal(text.startsWith("0x") ? BigInt(text).toString() : text).div(new Decimal(10).pow(decimals)).toNumber();
}

function hex(value: number) {
  return `0x${value.toString(16)}`;
}
