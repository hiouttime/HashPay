import { createHmac } from "node:crypto";
import { AppError } from "@/server/http/api";
import type { PaymentCheckInput, PaymentCheckResult } from "@/server/payments/driver";
import { paymentMatches } from "@/server/payments/match";
import { sameAmount } from "@/shared/amount";
import { key } from "@/shared/payments";
import type { PaymentSnapshot } from "@/shared/types/domain";

const origin = "https://www.okx.com";
const configApi = "/api/v5/account/config";
const billsApi = "/api/v5/asset/bills";

interface OkxResponse<T> {
  code?: string;
  data?: T[];
  msg?: string;
}

interface OkxConfig {
  uid?: unknown;
}

interface OkxBill {
  balChg?: string | number;
  billId?: string;
  ccy?: string;
  ts?: string | number;
  type?: string | number;
}

export async function validate(input: { address: string; data: Record<string, string> }) {
  const rows = await signedGet<OkxConfig>(configApi, input.data);
  const uid = String(rows[0]?.uid ?? "").trim();
  if (!uid) throw new AppError(400, "errors.payment_account_id_invalid", { detail: "OKX API 返回中没有账户ID" });
  if (uid !== input.address) {
    throw new AppError(400, "errors.payment_account_id_invalid", { detail: `API 返回账户ID ${uid}，与填写的 ${input.address} 不一致` });
  }
}

export async function check(input: PaymentCheckInput): Promise<PaymentCheckResult> {
  try {
    const rows = await bills(input);
    return {
      matches: paymentMatches(input.orders, rows, match, (tx) => ({ time: timestamp(tx), txid: String(tx.billId) })),
      status: "ok",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "OKX check failed", matches: [], status: "error" };
  }
}

async function bills(input: PaymentCheckInput) {
  if (!input.channel) return [];
  const currencies = [...new Set(input.orders.map((order) => key(order.snapshot.currency)).filter(Boolean))];
  const rows = await Promise.all(currencies.map((ccy) => signedGet<OkxBill>(billsApi, input.channel!.data, {
    ccy: ccy.toUpperCase(),
    limit: "100",
    type: "72",
  })));
  return rows.flat();
}

async function signedGet<T>(path: string, data: Record<string, string>, query: Record<string, string> = {}) {
  const apiKey = String(data.apiKey ?? "").trim();
  const secretKey = String(data.secretKey ?? "").trim();
  const passphrase = String(data.passphrase ?? "").trim();
  if (!apiKey || !secretKey || !passphrase) throw new AppError(400, "errors.payment_credential_missing");

  const search = new URLSearchParams(query).toString();
  const requestPath = `${path}${search ? `?${search}` : ""}`;
  const timestamp = new Date().toISOString();
  const sign = createHmac("sha256", secretKey).update(`${timestamp}GET${requestPath}`).digest("base64");
  const res = await fetch(`${origin}${requestPath}`, {
    headers: {
      accept: "application/json",
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
    },
  });
  if (!res.ok) {
    throw new AppError(400, "errors.payment_api_credential_invalid", { detail: await responseReason(res) });
  }
  const payload = await res.json() as OkxResponse<T>;
  if (payload.code && payload.code !== "0") {
    throw new AppError(400, "errors.payment_api_credential_invalid", { detail: `${payload.code} ${payload.msg ?? ""}`.replace(/\s+/g, " ").trim() });
  }
  return payload.data ?? [];
}

async function responseReason(res: Response) {
  const fallback = `HTTP ${res.status}`;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await res.clone().json().catch(() => null) as { code?: unknown; msg?: unknown } | null;
    const code = String(body?.code ?? "").trim();
    const msg = String(body?.msg ?? "").trim();
    return ([code, msg].filter(Boolean).join(" ") || fallback).replace(/\s+/g, " ").trim();
  }
  const text = await res.text().catch(() => "");
  return (text || fallback).replace(/\s+/g, " ").trim();
}

function match(snapshot: PaymentSnapshot, row: OkxBill, created: number, expire: number) {
  const amount = Number(row.balChg);
  const time = timestamp(row);
  return Boolean(row.billId)
    && String(row.type) === "72"
    && time >= created
    && time <= expire
    && key(row.ccy) === key(snapshot.currency)
    && amount > 0
    && sameAmount(amount, snapshot.amount);
}

function timestamp(row: OkxBill) {
  const value = Number(row.ts);
  return Math.floor(value > 10_000_000_000 ? value / 1000 : value);
}
