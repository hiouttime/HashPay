import type { OrderStatus, PaymentSnapshot } from "@/shared/types/domain";

export interface TelegramUser {
  firstName?: string;
  id: number;
  lastName?: string;
  username?: string;
}

export interface AppState {
  adminBound: boolean;
  botReady: boolean;
  botStatus: "invalid" | "missing" | "ready";
  username: string | null;
  db_error: string | null;
  db_ready: boolean;
  domain: string | null;
  environmentReady: boolean;
  installed: boolean;
  queueError: string | null;
  queueReady: boolean;
  suggestedDomain: string;
  webhookReady: boolean;
}

export interface OrderDto {
  amount: number;
  createdAt: number;
  currency: string;
  description: string | null;
  expireAt: number;
  id: string;
  merchantId: string;
  merchantNo: string;
  paidAt: number | null;
  payment: Partial<PaymentSnapshot> & Record<string, unknown>;
  payway: number | null;
  paywayName?: string | null;
  returnUrl: string | null;
  status: OrderStatus;
  updatedAt: number;
}

export interface CheckoutData {
  fastConfirm: boolean;
  merchant: { id: string; name: string };
  options: Array<{
    amount: number;
    asset: string;
    network: string;
  }>;
  order: OrderDto;
}

export type PaymentMethodStatus = "disabled" | "enabled" | "error";

export interface PaymentMethod {
  address: string;
  assets: string[];
  credentials: Record<string, string>;
  createdAt: number;
  driver: string;
  id: number;
  name: string;
  status: PaymentMethodStatus;
  updatedAt: number;
}

export interface PaymentMethodInput {
  address: string;
  assets: string[];
  credentials?: Record<string, string>;
  driver: string;
  name: string;
  status: Exclude<PaymentMethodStatus, "error">;
}

export type MerchantStatus = "active" | "paused";
export type MerchantType = "telegram" | "website";

export interface MerchantDto {
  callback: string | null;
  createdAt: number;
  id: string;
  name: string;
  publicKey: string;
  status: MerchantStatus;
  type: MerchantType;
  updatedAt: number;
}

export interface MerchantInput {
  callback?: string;
  name: string;
  status?: MerchantStatus;
  type?: MerchantType;
}

export interface MerchantSaveResult {
  merchant: MerchantDto;
  privateKey?: string;
}

export type DashboardTrendKey = "td" | "yd" | "7d" | "15d" | "30d";

export interface DashboardTrendPoint {
  amount: number;
  label: string;
  orders: number;
  paidOrders: number;
  timestamp: number;
}

export interface DashboardDto {
  failedNotifyCount: number;
  notifyPendingCount: number;
  orderCounts: Record<string, number>;
  paymentHealth: Array<{ details: string; id: number; name: string; network: string; status: string }>;
  recentOrders: OrderDto[];
  todayOrderCount: number;
  todayPaidAmount: number;
  todayPaidCount: number;
  trends: Record<DashboardTrendKey, DashboardTrendPoint[]>;
}

export interface OrderNotifyDto {
  attempts: number;
  createdAt: number;
  id: number;
  lastError: string | null;
  nextRunAt: number;
  payload: Record<string, unknown>;
  status: string;
  updatedAt: number;
}

export interface OrderDetailDto {
  merchant: { id: string; name: string; type?: string } | null;
  notify: OrderNotifyDto[];
  order: OrderDto;
  payway: { driver: string; id: number; name: string; status: string } | null;
  rate: {
    originalAmount: number;
    originalCurrency: string;
    paymentAmount: number | null;
    paymentCurrency: string | null;
    rate: number | null;
  };
}

export interface RatePreview {
  adjust_percent: number;
  base_currency: string;
  items: Array<{ currency: string; effective_rate: number; market_rate: number; usd_price: number }>;
  message_key?: string;
  source: string;
  status: string;
  updated_at: number;
}

export interface SettingsDto {
  banner_url: string;
  currency: string;
  domain: string;
  fast_confirm: boolean;
  rate_adjust: number;
  rate_preview: RatePreview;
  timeout: number;
}

export interface SettingsInput {
  currency: string;
  domain: string;
  fast_confirm: boolean;
  rate_adjust: number;
  timeout: number;
}

export interface TxCandidate {
  amount: number;
  currency: string;
  from?: string;
  hash: string;
  raw: unknown;
  timestamp: number;
  to?: string;
}
