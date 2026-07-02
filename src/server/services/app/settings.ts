import Decimal from "decimal.js";
import { getConfig, setConfig, setConfigs } from "@/server/db";
import { ceilAmount } from "@/shared/amount";
import type { AppEnv } from "@/shared/types/env";

const defaultFiatPerUSD: Record<string, number> = {
  CNY: 7.2,
  EUR: 0.93,
  GBP: 0.79,
  TWD: 32,
  USD: 1,
};

const defaultUSDPrices: Record<string, number> = {
  BNB: 610,
  BTC: 85000,
  ETH: 3200,
  GRAM: 3,
  MATIC: 0.9,
  TRX: 0.12,
  USDC: 1,
  USDT: 1,
};

const priceSourceIDs: Record<string, string> = {
  BNB: "binancecoin",
  BTC: "bitcoin",
  ETH: "ethereum",
  GRAM: "the-open-network",
  MATIC: "polygon-ecosystem-token",
  TRX: "tron",
  USDC: "usd-coin",
  USDT: "tether",
};

const previewPriority = ["USDT", "USDC", "GRAM", "BTC", "ETH", "BNB", "TRX", "MATIC"];

export interface SystemSettings {
  currency: string;
  fast_confirm: boolean;
  rate_adjust: number;
  timeout: number;
}

export interface MarketRates {
  fiatPerUSD: Record<string, number>;
  message?: string;
  source: string;
  status: "fallback" | "live" | "partial";
  syncedAt: number;
  updatedAt: number;
  usdPrices: Record<string, number>;
}

export interface ConversionContext {
  rateAdjust: number;
  rates: MarketRates;
  settings: SystemSettings;
}

const bannerUrl = "/banner.webp";
let memoryRates: { expiresAt: number; snapshot: MarketRates } | null = null;

export async function adminSettings(env: AppEnv) {
  return {
    ...(await systemSettings(env)),
    banner_url: bannerUrl,
    domain: await getConfig(env, "domain") || "",
    rate_preview: await settingsPreview(env),
  };
}

export async function saveAdminSettings(env: AppEnv, input: Record<string, unknown>) {
  const settings = normalizeSettingsPayload(input);
  const domain = String(input.domain ?? "").trim();
  await setConfigs(env, {
    currency: settings.currency,
    domain,
    fast_confirm: String(settings.fast_confirm),
    rate_adjust: String(settings.rate_adjust),
    timeout: String(settings.timeout),
  });
  return {
    ...settings,
    banner_url: bannerUrl,
    domain,
    rate_preview: await settingsPreview(env, settings.currency, String(settings.rate_adjust)),
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
    fast_confirm: fastConfirm === "true",
    rate_adjust: normalizeRateAdjust(rateAdjust),
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
    rateAdjust: settings.rate_adjust,
    rates: await currentMarketRates(env),
    settings,
  };
}

export function convertAmountWithContext(amount: number, fromCurrency: string, toCurrency: string, context: ConversionContext) {
  const rate = quoteRate(context.rates, fromCurrency || context.settings.currency, toCurrency, context.rateAdjust);
  if (!rate || rate <= 0) return ceilAmount(amount);
  return ceilAmount(new Decimal(amount).div(rate));
}

export async function settingsPreview(env: AppEnv, currency?: string | null, rateAdjust?: string | null) {
  const settings = await systemSettings(env);
  const base = normalizeCurrency(currency || settings.currency);
  const adjust = normalizeRateAdjust(rateAdjust ?? settings.rate_adjust);
  const snapshot = await currentMarketRates(env);
  return {
    adjust_percent: adjust,
    base_currency: base,
    items: previewPriority.map((item) => {
      const marketRate = quoteRate(snapshot, base, item, 0);
      return {
        currency: item,
        effective_rate: applyAdjust(marketRate, adjust),
        market_rate: marketRate,
        usd_price: snapshot.usdPrices[item] ?? 0,
      };
    }).filter((item) => item.market_rate > 0),
    message: snapshot.message,
    source: snapshot.source,
    status: snapshot.status,
    updated_at: snapshot.updatedAt,
  };
}

export function normalizeSettingsPayload(input: Record<string, unknown>) {
  return {
    currency: normalizeCurrency(String(input.currency ?? "CNY")),
    fast_confirm: input.fast_confirm === true || input.fast_confirm === "true",
    rate_adjust: normalizeRateAdjust(input.rate_adjust),
    timeout: normalizeTimeoutMinutes(input.timeout),
  };
}

function normalizeCurrency(value: string) {
  const upper = value.trim().toUpperCase();
  return ["CNY", "USD", "EUR", "GBP", "TWD"].includes(upper) ? upper : "CNY";
}

function normalizeNumberString(value: unknown, fallback: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? String(parsed) : fallback;
}

function normalizeRateAdjust(value: unknown) {
  const parsed = Number(normalizeNumberString(value, "0"));
  return Math.min(Math.max(parsed, -99), 200);
}

function normalizeTimeoutMinutes(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
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
  if (cached && nowSeconds() - current.syncedAt < 10 * 60) {
    memoryRates = { expiresAt: Date.now() + 60_000, snapshot: current };
    return current;
  }
  const [fiat, prices] = await Promise.allSettled([fetchFiatRates(), fetchUSDPrices()]);
  const out = defaultMarketRates();
  const source: string[] = [];
  const problems: string[] = [];
  if (fiat.status === "fulfilled") {
    out.fiatPerUSD = fiat.value.rates;
    out.updatedAt = fiat.value.updatedAt || out.updatedAt;
    source.push("ExchangeRate API");
  } else {
    problems.push("法币汇率刷新失败");
  }
  if (prices.status === "fulfilled") {
    out.usdPrices = prices.value;
    source.push("CoinGecko");
  } else {
    problems.push("币价刷新失败");
  }
  if (source.length) {
    out.source = source.join(" + ");
    out.status = problems.length ? "partial" : "live";
  }
  if (problems.length) out.message = problems.length === 2 ? "实时汇率获取失败，当前使用系统默认值。" : problems.join("，");
  await setConfig(env, "market_rates", JSON.stringify(out));
  memoryRates = { expiresAt: Date.now() + 60_000, snapshot: out };
  return out;
}

function defaultMarketRates(): MarketRates {
  return {
    fiatPerUSD: { ...defaultFiatPerUSD },
    source: "system-default",
    status: "fallback",
    syncedAt: nowSeconds(),
    updatedAt: nowSeconds(),
    usdPrices: { ...defaultUSDPrices },
  };
}

function parseMarketRates(value: string | null) {
  if (!value) return defaultMarketRates();
  try {
    const parsed = JSON.parse(value) as Partial<MarketRates>;
    if (!parsed || typeof parsed !== "object") return defaultMarketRates();
    return {
      fiatPerUSD: { ...defaultFiatPerUSD, ...(parsed.fiatPerUSD ?? {}) },
      message: parsed.message,
      source: parsed.source || "system-default",
      status: parsed.status === "live" || parsed.status === "partial" || parsed.status === "fallback" ? parsed.status : "fallback",
      syncedAt: Number(parsed.syncedAt) || Number(parsed.updatedAt) || nowSeconds(),
      updatedAt: Number(parsed.updatedAt) || Math.floor(Date.now() / 1000),
      usdPrices: { ...defaultUSDPrices, ...(parsed.usdPrices ?? {}) },
    };
  } catch {
    return defaultMarketRates();
  }
}

async function fetchFiatRates() {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: timeoutSignal(1200),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`fiat rates status ${response.status}`);
  const payload = await response.json<{
    rates?: Record<string, number>;
    result?: string;
    time_last_update_unix?: number;
  }>();
  if (payload.result !== "success" || !payload.rates) throw new Error("fiat rates unavailable");
  const rates = { ...defaultFiatPerUSD };
  for (const currency of Object.keys(defaultFiatPerUSD)) {
    if (currency === "USD") rates.USD = 1;
    else if (payload.rates[currency] > 0) rates[currency] = payload.rates[currency];
  }
  return { rates, updatedAt: payload.time_last_update_unix ?? 0 };
}

async function fetchUSDPrices() {
  const ids = Object.values(priceSourceIDs).sort().join(",");
  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${encodeURIComponent(ids)}`, {
    signal: timeoutSignal(1200),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`coin prices status ${response.status}`);
  const payload = await response.json<Record<string, { usd?: number }>>();
  const prices = { ...defaultUSDPrices };
  for (const [currency, id] of Object.entries(priceSourceIDs)) {
    const price = payload[id]?.usd;
    if (price && price > 0) prices[currency] = price;
  }
  return prices;
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
  if (snapshot.usdPrices[currency] > 0) return snapshot.usdPrices[currency];
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
