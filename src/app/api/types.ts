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
  botUsername: string | null;
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
  payment: Record<string, any>;
  payway: number | null;
  paywayName?: string | null;
  returnUrl: string | null;
  status: string;
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

export interface PaymentMethod {
  address: string;
  assets: string[];
  credentials: Record<string, string>;
  createdAt: number;
  driver: string;
  id: number;
  name: string;
  status: "enabled" | "disabled" | "error";
  updatedAt: number;
}

export interface PaymentMethodInput {
  address: string;
  assets: string[];
  credentials?: Record<string, string>;
  driver: string;
  name: string;
  status: "enabled" | "disabled";
}

export interface MerchantDto {
  callback: string | null;
  createdAt: number;
  id: string;
  name: string;
  publicKey: string;
  status: string;
  type: string;
  updatedAt: number;
}

export interface MerchantInput {
  callback?: string;
  name: string;
  status?: string;
  type?: string;
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

export interface OrderDetailDto {
  merchant: Record<string, any> | null;
  notify: Array<Record<string, any>>;
  order: OrderDto;
  payway: Record<string, any> | null;
  rate: Record<string, any>;
}

export interface RatePreview {
  adjust_percent: number;
  base_currency: string;
  items: Array<{ currency: string; effective_rate: number; market_rate: number; usd_price: number }>;
  message?: string;
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

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        expand(): void;
        initData?: string;
        ready(): void;
      };
    };
  }
}
