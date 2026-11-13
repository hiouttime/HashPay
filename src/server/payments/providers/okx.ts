import { createHmac } from "node:crypto";
import { AppError } from "@/server/http/api";
import type { PaymentChannel } from "@/server/payments/channels";
import type { PaymentCheckInput } from "@/server/payments/driver";
import { paymentMatches } from "@/server/payments/match";
import { fetchText, reason, responseReason } from "@/server/utils/http";
import { key } from "@/shared/payments";
import type { PaymentSnapshot } from "@/shared/types/domain";

export const okx = { check, scan, validate: check };

const origin = "https://www.okx.com";
const configApi = "/api/v5/account/config";
const billsApi = "/api/v5/asset/bills";
const billPageSize = 100;
const maxBillPages = 5;

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

async function check(input: Pick<PaymentChannel, "address" | "data">) {
  const rows = await signedGet<OkxConfig>(configApi, input.data);
  const uid = String(rows[0]?.uid ?? "").trim();
  if (!uid) throw new AppError(400, "errors.payment_account_id_invalid", { detail: "OKX API 返回中没有账户ID" });
  if (uid !== input.address) {
    throw new AppError(400, "errors.payment_account_id_invalid", { detail: `API 返回账户ID ${uid}，与填写的 ${input.address} 不一致` });
  }
}

async function scan(input: PaymentCheckInput) {
  const rows = await bills(input);
  return paymentMatches(input.orders, rows, match, (tx) => ({ time: timestamp(tx), txid: String(tx.billId) }), input.tolerance);
}

async function bills(input: PaymentCheckInput) {
  const channel = input.channel;
  if (!channel) return [];
  const start = Math.min(...input.orders.map((order) => order.createdAt)) * 1000;
  const currencies = [...new Set(input.orders.map((order) => key(order.snapshot.currency)).filter(Boolean))];
  const rows = (await Promise.all(currencies.map((ccy) => billsSince(channel.data, ccy.toUpperCase(), start)))).flat();
  return [...new Map(rows.map((row) => [row.billId, row])).values()];
}

// Bills come newest first and `after` returns rows strictly older than a ms timestamp. Keep
// paging until a page reaches the oldest order's start, bounded to stay within 6 req/s.
async function billsSince(data: Record<string, string>, ccy: string, start: number, after = "", page = 1): Promise<OkxBill[]> {
  const rows = await signedGet<OkxBill>(billsApi, data, { ccy, limit: String(billPageSize), ...(after ? { after } : {}) });
  if (rows.length < billPageSize) return rows;
  const oldest = Math.min(...rows.map((row) => Number(row.ts)));
  if (!Number.isFinite(oldest) || oldest < start) return rows;
  if (page >= maxBillPages) {
    console.warn(`okx bills truncated: more than ${billPageSize * maxBillPages} ${ccy} bills since ${start}`);
    return rows;
  }
  // Step one ms past the oldest row so bills sharing its timestamp are not skipped; the
  // overlap is dropped by billId in the caller.
  return [...rows, ...await billsSince(data, ccy, start, String(oldest + 1), page + 1)];
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
  const { res, text } = await fetchText(`${origin}${requestPath}`, {
    headers: {
      accept: "application/json",
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
    },
  });
  if (!res.ok) {
    throw new AppError(400, "errors.payment_api_credential_invalid", { detail: responseReason(res, text) });
  }
  const payload = JSON.parse(text || "{}") as OkxResponse<T>;
  if (payload.code && payload.code !== "0") {
    throw new AppError(400, "errors.payment_api_credential_invalid", { detail: reason(`${payload.code} ${payload.msg ?? ""}`) });
  }
  return payload.data ?? [];
}

function match(snapshot: PaymentSnapshot, row: OkxBill, created: number, expire: number) {
  const amount = Number(row.balChg);
  const time = timestamp(row);
  const valid = Boolean(row.billId)
    && ["1", "72"].includes(String(row.type))
    && time >= created
    && time <= expire
    && key(row.ccy) === key(snapshot.currency)
    && amount > 0;
  return valid ? amount : null;
}

function timestamp(row: OkxBill) {
  const value = Number(row.ts);
  return Math.floor(value > 10_000_000_000 ? value / 1000 : value);
}
