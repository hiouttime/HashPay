import { createHmac } from "node:crypto";
import { AppError } from "@/server/http/api";
import type { PaymentCheckInput, PaymentCheckResult } from "@/server/payments/driver";
import { sameAmount } from "@/shared/amount";
import { key } from "@/shared/payments";
import type { PaymentSnapshot } from "@/shared/types/domain";

const api = "https://api.binance.com/sapi/v1/pay/transactions";
const accountApi = "https://api.binance.com/api/v3/account";

interface BinancePayRow {
  amount?: string | number;
  currency?: string;
  fundsDetail?: Array<{ amount?: string | number; currency?: string }>;
  receiverInfo?: { binanceId?: unknown };
  transactionId?: string;
  transactionTime?: string | number;
}

export async function validate(input: { address: string; data: Record<string, string> }) {
  try {
    const payload = await signedGet<{ uid?: unknown }>(accountApi, input.data.apiKey, input.data.secretKey);
    const uid = String(payload.uid ?? "").trim();
    if (!uid) throw new Error("Binance account response is invalid");
    if (uid !== input.address) throw new Error("Binance ID does not match API key pair");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "errors.payment_credential_invalid");
  }
}

export async function check(input: PaymentCheckInput): Promise<PaymentCheckResult> {
  try {
    const rows = await history(input);
    return {
      matches: input.orders.flatMap((order) => {
        const tx = rows.find((row) => match(order.snapshot, row, order.createdAt, order.expireAt));
        return tx ? [{ orderId: order.id, time: timestamp(tx), txid: String(tx.transactionId) }] : [];
      }),
      status: "ok",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Binance check failed", matches: [], status: "error" };
  }
}

async function history(input: PaymentCheckInput) {
  const channel = input.channel;
  if (!channel) return [];
  const apiKey = String(channel.data.apiKey ?? "").trim();
  const secretKey = String(channel.data.secretKey ?? "").trim();
  if (!apiKey || !secretKey) throw new AppError(400, "errors.payment_credential_missing");

  const start = Math.min(...input.orders.map((order) => order.createdAt)) * 1000;
  const end = Math.max(...input.orders.map((order) => order.expireAt)) * 1000;
  const payload = await signedGet<{ code?: string; data?: unknown; success?: boolean }>(api, apiKey, secretKey, {
    endTime: String(end),
    limit: "100",
    recvWindow: "5000",
    startTime: String(start),
  });
  if (payload.success === false || (payload.code && payload.code !== "000000")) {
    throw new Error(`Binance response failed: ${payload.code ?? "unknown"}`);
  }
  return Array.isArray(payload.data) ? payload.data as BinancePayRow[] : [];
}

async function signedGet<T>(url: string, apiKey: string, secretKey: string, data: Record<string, string> = {}) {
  if (!apiKey || !secretKey) throw new AppError(400, "errors.payment_credential_missing");
  const query = new URLSearchParams({ ...data, timestamp: String(Date.now()) }).toString();
  const signature = createHmac("sha256", secretKey).update(query).digest("hex");
  const res = await fetch(`${url}?${query}&signature=${signature}`, {
    headers: { accept: "application/json", "X-MBX-APIKEY": apiKey },
  });
  if (!res.ok) throw new Error(`Binance request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function match(snapshot: PaymentSnapshot, row: BinancePayRow, created: number, expire: number) {
  const time = timestamp(row);
  return Boolean(row.transactionId)
    && time >= created
    && time <= expire
    && String(row.receiverInfo?.binanceId ?? "").trim() === String(snapshot.address).trim()
    && funds(row).some((fund) => key(fund.currency) === key(snapshot.currency) && sameAmount(Number(fund.amount), snapshot.amount));
}

function funds(row: BinancePayRow) {
  if (Array.isArray(row.fundsDetail) && row.fundsDetail.length) return row.fundsDetail;
  return [{ amount: row.amount, currency: row.currency }];
}

function timestamp(row: BinancePayRow) {
  const value = Number(row.transactionTime);
  return Math.floor(value > 10_000_000_000 ? value / 1000 : value);
}
