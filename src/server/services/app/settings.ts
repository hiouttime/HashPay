import Decimal from "decimal.js";
import { getConfig, setConfig, setConfigs } from "@/server/db";
import { ceilAmount } from "@/shared/amount";
import type { AppEnv } from "@/server/types/env";

const defaultFiatPerUSD: Record<string, number> = {
  CNY: 7.2,
  EUR: 0.93,
  GBP: 0.79,
  TWD: 32,
  USD: 1,
};

const assetUSDValues: Record<string, number> = {
  BNB: 610,
  ETH: 3200,
  GRAM: 3,
  MATIC: 0.9,
  TRX: 0.12,
  USDC: 1,
  USDT: 1,
};

const defaultTimeoutMinutes = 5;

export interface SystemSettings {
  currency: string;
  fastConfirm: boolean;
  rateAdjust: number;
  timeout: number;
}

export interface MarketRates {
  fiatPerUSD: Record<string, number>;
  messageKey?: string;
  syncedAt: number;
}

export interface ConversionContext {
  rateAdjust: number;
  rates: MarketRates;
  settings: SystemSettings;
}

let memoryRates: { expiresAt: number; snapshot: MarketRates } | null = null;

export async function adminSettings(env: AppEnv) {
  return {
    ...(await systemSettings(env)),
    domain: await getConfig(env, "domain") || "",
    marketRates: publicMarketRates(await currentMarketRates(env)),
  };
}

export async function saveAdminSettings(env: AppEnv, input: Record<string, unknown>) {
  const settings = normalizeSettingsPayload(input);
  const domain = String(input.domain ?? "").trim();
  await setConfigs(env, {
    currency: settings.currency,
    domain,
    fast_confirm: String(settings.fastConfirm),
    rate_adjust: String(settings.rateAdjust),
    timeout: String(settings.timeout),
  });
  return {
    ...settings,
    domain,
    marketRates: publicMarketRates(await currentMarketRates(env)),
  };
}

function publicMarketRates(rates: MarketRates) {
  return {
    fiatPerUSD: rates.fiatPerUSD,
    messageKey: rates.messageKey,
    syncedAt: rates.syncedAt,
  };
}

export async function systemSettings(env: AppEnv): Promise<SystemSettings> {
  const [currency, timeout, rateAdjust, fastConfirm] = await Promise.all([
    getConfig(env, "currency"),
    getConfig(env, "timeout"),
    getConfig(env, "rate_adjust"),
    getConfig(env, "fast_confirm"),
  ]);
  return {
    currency: normalizeCurrency(currency || "CNY"),
    fastConfirm: fastConfirm === "true",
    rateAdjust: normalizeRateAdjust(rateAdjust),
    timeout: normalizeTimeoutMinutes(timeout),
  };
}

export async function convertAmount(env: AppEnv, amount: number, fromCurrency: string, toCurrency: string) {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (from && to && from === to) return ceilAmount(amount);
  const context = await conversionContext(env);
  return convertAmountWithContext(amount, fromCurrency, toCurrency, context);
}

export async function conversionContext(env: AppEnv): Promise<ConversionContext> {
  const settings = await systemSettings(env);
  return {
    rateAdjust: settings.rateAdjust,
    rates: await currentMarketRates(env),
    settings,
  };
}

export function convertAmountWithContext(amount: number, fromCurrency: string, toCurrency: string, context: ConversionContext) {
  const rate = quoteRate(context.rates, fromCurrency || context.settings.currency, toCurrency, context.rateAdjust);
  if (!rate || rate <= 0) return ceilAmount(amount);
  return ceilAmount(new Decimal(amount).div(rate));
}

export function normalizeSettingsPayload(input: Record<string, unknown>) {
  return {
    currency: normalizeCurrency(String(input.currency ?? "CNY")),
    fastConfirm: input.fastConfirm === true || input.fastConfirm === "true",
    rateAdjust: normalizeRateAdjust(input.rateAdjust),
    timeout: normalizeTimeoutMinutes(input.timeout),
  };
}

function normalizeCurrency(value: string) {
  const upper = value.trim().toUpperCase();
  return ["CNY", "USD", "EUR", "GBP", "TWD"].includes(upper) ? upper : "CNY";
}

function normalizeRateAdjust(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, -99), 200);
}

function normalizeTimeoutMinutes(value: unknown) {
  if (value == null || (typeof value === "string" && !value.trim())) return defaultTimeoutMinutes;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultTimeoutMinutes;
  return Math.min(Math.max(Math.round(parsed), 1), 30);
}

export async function currentMarketRates(env: AppEnv): Promise<MarketRates> {
  const nowMs = Date.now();
  if (memoryRates && memoryRates.expiresAt > nowMs) return memoryRates.snapshot;
  const cached = parseMarketRates(await getConfig(env, "market_rates"));
  memoryRates = { expiresAt: nowMs + 60_000, snapshot: cached };
  return cached;
}

export async function syncMarketRates(env: AppEnv): Promise<MarketRates> {
  const cached = await getConfig(env, "market_rates");
  const current = parseMarketRates(cached);
  const out = defaultMarketRates();
  try {
    out.fiatPerUSD = await fetchFiatRates();
    out.syncedAt = nowSeconds();
  } catch {
    out.fiatPerUSD = current.fiatPerUSD;
    out.messageKey = "settings.rate_error_fiat";
    out.syncedAt = current.syncedAt;
  }
  await setConfig(env, "market_rates", JSON.stringify(out));
  memoryRates = { expiresAt: Date.now() + 60_000, snapshot: out };
  return out;
}

function defaultMarketRates(): MarketRates {
  return {
    fiatPerUSD: { ...defaultFiatPerUSD },
    syncedAt: 0,
  };
}

function parseMarketRates(value: string | null) {
  if (!value) return defaultMarketRates();
  try {
    const parsed = JSON.parse(value) as Partial<MarketRates>;
    if (!parsed || typeof parsed !== "object") return defaultMarketRates();
    return {
      fiatPerUSD: { ...defaultFiatPerUSD, ...(parsed.fiatPerUSD ?? {}) },
      messageKey: parsed.messageKey,
      syncedAt: Number(parsed.syncedAt) || 0,
    };
  } catch {
    return defaultMarketRates();
  }
}

async function fetchFiatRates() {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: timeoutSignal(5000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`fiat rates status ${response.status}`);
  const payload = await response.json<{
    rates?: Record<string, number>;
    result?: string;
  }>();
  if (payload.result !== "success" || !payload.rates) throw new Error("fiat rates unavailable");
  const rates = { ...defaultFiatPerUSD };
  for (const currency of Object.keys(defaultFiatPerUSD)) {
    if (currency === "USD") rates.USD = 1;
    else if (payload.rates[currency] > 0) rates[currency] = payload.rates[currency];
  }
  return rates;
}

function quoteRate(snapshot: MarketRates, fromCurrency: string, toCurrency: string, adjustPercent: number) {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (!from || !to || from === to) return 1;
  const fromUSD = currencyUSDValue(snapshot, from);
  const toUSD = currencyUSDValue(snapshot, to);
  if (fromUSD <= 0 || toUSD <= 0) return 1;
  return applyAdjust(toUSD / fromUSD, adjustPercent);
}

function currencyUSDValue(snapshot: MarketRates, currency: string) {
  if (assetUSDValues[currency] > 0) return assetUSDValues[currency];
  if (snapshot.fiatPerUSD[currency] > 0) return 1 / snapshot.fiatPerUSD[currency];
  if (currency === "USD") return 1;
  return 0;
}

function applyAdjust(rate: number, adjustPercent: number) {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (!adjustPercent) return rate;
  return rate * (1 + adjustPercent / 100);
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
