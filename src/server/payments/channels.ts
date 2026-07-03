import { all, jsonParseObject, now, one, run } from "@/server/db";
import { AppError } from "@/server/http/api";
import { validatePayment, type PaymentCheckResult } from "@/server/payments/driver";
import { normalizePaymentAsset, paymentById } from "@/shared/payments";
import type { AppEnv } from "@/server/types/env";

export type PaymentStatus = "enabled" | "disabled" | "error";

export interface PaymentChannel {
  id: number;
  name: string;
  driver: string;
  address: string;
  assets: string[];
  createdAt: number;
  updatedAt: number;
  status: PaymentStatus;
  credentials: Record<string, string>;
}

type PaymentRow = Omit<PaymentChannel, "assets" | "credentials"> & {
  assets: string;
  credentials: string;
};

const columns = "id, driver, name, status, address, assets, credentials, created_at AS createdAt, updated_at AS updatedAt";

function payment(row: PaymentRow): PaymentChannel {
  return {
    address: row.address,
    assets: (JSON.parse(row.assets) as string[]).map(normalizePaymentAsset).filter(Boolean),
    credentials: jsonParseObject<Record<string, string>>(row.credentials, {}),
    createdAt: row.createdAt,
    driver: row.driver,
    id: row.id,
    name: row.name,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

export async function listPayments(env: AppEnv) {
  return (await all<PaymentRow>(env, `SELECT ${columns} FROM payments ORDER BY id DESC`)).map(payment);
}

async function getPayment(env: AppEnv, id: number) {
  const row = await one<PaymentRow>(env, `SELECT ${columns} FROM payments WHERE id = ?`, id);
  if (!row) throw new AppError(404, "errors.payment_not_found");
  return payment(row);
}

export async function savePayment(env: AppEnv, input: { address: string; assets: string[]; credentials?: Record<string, string>; driver: string; id?: number; name: string; status?: PaymentStatus }) {
  const address = String(input.address ?? "").trim();
  const assets = Array.from(new Set((input.assets ?? []).map(normalizePaymentAsset).filter(Boolean)));
  const credentials = input.credentials ?? {};
  const payment = validatePayment({ address, assets, driver: input.driver });
  const time = now();
  const name = input.name.trim() || payment.id;
  const status = input.status === "disabled" ? "disabled" : "enabled";
  const fields = [input.driver, name, status, address, JSON.stringify(assets), JSON.stringify(credentials)] as const;
  if (input.id) {
    await run(env, "UPDATE payments SET driver = ?, name = ?, status = ?, address = ?, assets = ?, credentials = ?, updated_at = ? WHERE id = ?", ...fields, time, input.id);
    return getPayment(env, input.id);
  }
  const result = await run(env, "INSERT INTO payments(driver, name, status, address, assets, credentials, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)", ...fields, time, time);
  const id = Number(result.meta.last_row_id);
  return getPayment(env, id);
}

export async function deletePayment(env: AppEnv, id: number) {
  await run(env, "DELETE FROM payments WHERE id = ?", id);
}

export function paymentHealth(payment: PaymentChannel) {
  const network = paymentById(payment.driver)?.network ?? payment.driver;
  const summary = { driver: payment.driver, id: payment.id, name: payment.name, network };
  if (payment.status === "error") return { ...summary, details: "payment.channel_error", status: "warn" };
  if (!payment.address.trim()) {
    return { ...summary, details: "errors.payment_field_missing", status: "warn" };
  }
  return { ...summary, details: "common.normal", status: "ok" };
}

export async function recordCheck(env: AppEnv, id: number, result: PaymentCheckResult) {
  const time = now();
  await run(
    env,
    "UPDATE payments SET status = CASE WHEN status = 'disabled' THEN 'disabled' WHEN ? THEN 'error' ELSE 'enabled' END, updated_at = ? WHERE id = ?",
    result.status === "error" ? 1 : 0,
    time,
    id,
  );
}
