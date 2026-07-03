export * from "@/shared/types/api";
export * from "@/app/api/http";

import { del, get, post, put, upload, type ApiRequestOptions } from "@/app/api/http";
import type {
  CheckoutData,
  DashboardDto,
  MerchantDto,
  MerchantInput,
  MerchantSaveResult,
  OrderDetailDto,
  OrderDto,
  PaymentMethod,
  PaymentMethodInput,
  RatePreview,
  SettingsDto,
  SettingsInput,
  AppState,
  TelegramUser,
} from "@/shared/types/api";

interface OrderListInput {
  page: number;
  pageSize: number;
  q?: string;
  status: string;
}

interface RateInput {
  currency: string;
  rate_adjust: number | string;
}

function endpoints(options: ApiRequestOptions = {}) {
  return {
    state: {
      get: () => get<AppState>("/api/state", options),
    },
    setup: {
      submit: (domain: string) => post<{ domain: string }>("/api/admin/setup", { domain }, options),
      session: () => get<{ admin: TelegramUser | null; bound: boolean }>("/api/admin/setup", options),
    },
    session: {
      current: () => get<TelegramUser>("/api/admin/session", options),
      logout: () => del<{ ok: boolean }>("/api/admin/session", options),
      createCode: (pin: string) => post<{ challenge: string; command: string; expiresAt: number }>("/api/admin/session/pin", { pin }, options),
      checkCode: (pin: string, challenge: string) =>
        get<{ authenticated: boolean; user?: TelegramUser }>(`/api/admin/session/pin/${id(pin)}?challenge=${id(challenge)}`, options),
      telegram: (initData: string) => post<TelegramUser & { setupRequired: boolean }>("/api/admin/session/telegram", { initData }, options),
    },
    checkout: {
      order: (orderId: string) => get<CheckoutData>(`/api/checkout/${id(orderId)}`, options),
      status: (orderId: string) => get<OrderDto>(`/api/checkout/${id(orderId)}/status`, options),
      select: (orderId: string, input: { asset: string; network: string }) =>
        put<Record<string, unknown>>(`/api/checkout/${id(orderId)}/payment`, input, options),
      submitTx: (orderId: string, candidates: unknown[]) =>
        post<Record<string, unknown>>(`/api/checkout/${id(orderId)}/check`, { candidates }, options),
      review: (orderId: string, input: { answer: string; image: string }) =>
        post<{ review: unknown }>(`/api/checkout/${id(orderId)}/review`, input, options),
    },
    dashboard: {
      get: () => get<DashboardDto>("/api/admin/dashboard", options),
    },
    orders: {
      list: (input: OrderListInput) =>
        get<{ items: OrderDto[]; page: number; pageSize: number; total: number }>(`/api/admin/orders?${orderQuery(input)}`, options),
      test: () => post<{ checkoutUrl: string; order: OrderDto }>("/api/admin/orders/test", undefined, options),
      get: (orderId: string) => get<OrderDetailDto>(`/api/admin/orders/${id(orderId)}`, options),
      remove: (orderId: string) => del<{ ok: boolean }>(`/api/admin/orders/${id(orderId)}`, options),
      check: (orderId: string) => post(`/api/admin/orders/${id(orderId)}/check`, undefined, options),
      confirm: (orderId: string) => post(`/api/admin/orders/${id(orderId)}/confirm`, undefined, options),
      resend: (orderId: string) => post(`/api/admin/orders/${id(orderId)}/notify`, undefined, options),
    },
    payments: {
      list: () => get<PaymentMethod[]>("/api/admin/payment", options),
      create: (input: PaymentMethodInput) => post<PaymentMethod>("/api/admin/payment", input, options),
      update: (paymentId: number, input: PaymentMethodInput) => put<PaymentMethod>(`/api/admin/payment/${paymentId}`, input, options),
      remove: (paymentId: number) => del<{ ok: boolean }>(`/api/admin/payment/${paymentId}`, options),
    },
    merchants: {
      list: () => get<MerchantDto[]>("/api/admin/merchants", options),
      create: (input: MerchantInput) => post<MerchantSaveResult>("/api/admin/merchants", input, options),
      update: (merchantId: string, input: MerchantInput) => put<MerchantSaveResult>(`/api/admin/merchants/${id(merchantId)}`, input, options),
      remove: (merchantId: string) => del<{ ok: boolean }>(`/api/admin/merchants/${id(merchantId)}`, options),
      rotateKey: (merchantId: string) => post<MerchantSaveResult>(`/api/admin/merchants/${id(merchantId)}/rotate-key`, undefined, options),
    },
    settings: {
      get: () => get<SettingsDto>("/api/admin/settings", options),
      save: (input: SettingsInput) => put<SettingsDto>("/api/admin/settings", input, options),
      rates: (input: RateInput) => get<RatePreview>(`/api/admin/rates/preview?${rateQuery(input)}`, options),
    },
    banner: {
      upload: (body: ArrayBuffer) => upload<{ url: string }>("/api/admin/banner", body, "image/webp", options),
      restore: () => post<{ url: string }>("/api/admin/banner/restore", undefined, options),
    },
  };
}

export const api = {
  ...endpoints(),
  silent: endpoints({ silent: true }),
};

function id(value: string) {
  return encodeURIComponent(value);
}

function orderQuery(input: OrderListInput) {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    status: input.status,
  });
  if (input.q?.trim()) query.set("q", input.q.trim());
  return query.toString();
}

function rateQuery(input: RateInput) {
  return new URLSearchParams({
    currency: input.currency,
    rate_adjust: String(input.rate_adjust),
  }).toString();
}
