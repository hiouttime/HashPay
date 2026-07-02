import { all, jsonParseObject, now, one, run } from "@/server/db";
import { AppError } from "@/server/http/api";
import { validatePaymentConfig, type PaymentCheckResult } from "@/server/payments/driver";
import { normalizePaymentAsset, paymentById } from "@/shared/payments";
import type { AppEnv } from "@/shared/types/env";

export type PaymentStatus = "enabled" | "disabled" | "error";

export interface PaymentMethod {
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

type PaymentRow = Omit<PaymentMethod, "assets" | "credentials"> & {
  assets: string;
  credentials: string;
};

const columns = "id, driver, name, status, address, assets, credentials, created_at AS createdAt, updated_at AS updatedAt";

function toMethod(row: PaymentRow): PaymentMethod {
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

export async function listPaymentMethods(env: AppEnv) {
  return (await all<PaymentRow>(env, `SELECT ${columns} FROM payments ORDER BY id DESC`)).map(toMethod);
}

async function getPaymentMethod(env: AppEnv, id: number) {
  const row = await one<PaymentRow>(env, `SELECT ${columns} FROM payments WHERE id = ?`, id);
  if (!row) throw new AppError(404, "payment_not_found", "Payment is not found");
  return toMethod(row);
}

export async function savePaymentMethod(env: AppEnv, input: { address: string; assets: string[]; credentials?: Record<string, string>; driver: string; id?: number; name: string; status?: PaymentStatus }) {
  const address = String(input.address ?? "").trim();
  const assets = Array.from(new Set((input.assets ?? []).map(normalizePaymentAsset).filter(Boolean)));
  const credentials = input.credentials ?? {};
  const payment = validatePaymentConfig({ address, assets, driver: input.driver });
  const time = now();
  const name = input.name.trim() || payment.name;
  const status = input.status === "disabled" ? "disabled" : "enabled";
  const fields = [input.driver, name, status, address, JSON.stringify(assets), JSON.stringify(credentials)] as const;
  if (input.id) {
    await run(env, "UPDATE payments SET driver = ?, name = ?, status = ?, address = ?, assets = ?, credentials = ?, updated_at = ? WHERE id = ?", ...fields, time, input.id);
    return getPaymentMethod(env, input.id);
  }
  const result = await run(env, "INSERT INTO payments(driver, name, status, address, assets, credentials, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)", ...fields, time, time);
  const id = Number(result.meta.last_row_id);
  return getPaymentMethod(env, id);
}

export async function deletePaymentMethod(env: AppEnv, id: number) {
  await run(env, "DELETE FROM payments WHERE id = ?", id);
}

export function paymentMethodHealth(payment: PaymentMethod) {
  const network = paymentById(payment.driver)?.network ?? payment.driver;
  const summary = { driver: payment.driver, id: payment.id, name: payment.name, network };
  if (payment.status === "error") return { ...summary, details: "通道检查付款失败", status: "warn" };
  if (!payment.address.trim()) {
    return { ...summary, details: "缺少收款地址", status: "warn" };
  }
  return { ...summary, details: "正常", status: "ok" };
}

export async function recordPaymentCheck(env: AppEnv, id: number, result: PaymentCheckResult) {
  const time = now();
  await run(
    env,
    "UPDATE payments SET status = CASE WHEN status = 'disabled' THEN 'disabled' WHEN ? THEN 'error' ELSE 'enabled' END, updated_at = ? WHERE id = ?",
    result.status === "error" ? 1 : 0,
    time,
    id,
  );
}
