export * from "@/app/api/types";
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
} from "@/app/api/types";

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

export const api = {
  state: {
    get: (options?: ApiRequestOptions) => get<AppState>("/api/state", options),
  },
  setup: {
    submit: (domain: string, options?: ApiRequestOptions) => post<{ domain: string }>("/api/admin/setup", { domain }, options),
    session: (options?: ApiRequestOptions) => get<{ admin: TelegramUser | null; bound: boolean }>("/api/admin/setup", options),
  },
  session: {
    current: (options?: ApiRequestOptions) => get<TelegramUser>("/api/admin/session", options),
    logout: (options?: ApiRequestOptions) => del<{ ok: boolean }>("/api/admin/session", options),
    createCode: (pin: string, options?: ApiRequestOptions) => post<{ challenge: string; command: string; expiresAt: number }>("/api/admin/session/pin", { pin }, options),
    checkCode: (pin: string, challenge: string, options?: ApiRequestOptions) =>
      get<{ authenticated: boolean; user?: TelegramUser }>(`/api/admin/session/pin/${encodeURIComponent(pin)}?challenge=${encodeURIComponent(challenge)}`, options),
    telegram: (initData: string, options?: ApiRequestOptions) => post<TelegramUser & { setupRequired: boolean }>("/api/admin/session/telegram", { initData }, options),
  },
  checkout: {
    order: (id: string, options?: ApiRequestOptions) => get<CheckoutData>(`/api/checkout/${encodeURIComponent(id)}`, options),
    status: (id: string, options?: ApiRequestOptions) => get<OrderDto>(`/api/checkout/${encodeURIComponent(id)}/status`, options),
    select: (id: string, input: { asset: string; network: string }, options?: ApiRequestOptions) =>
      put<Record<string, unknown>>(`/api/checkout/${encodeURIComponent(id)}/payment`, input, options),
    submitTx: (id: string, candidates: unknown[], options?: ApiRequestOptions) =>
      post<Record<string, unknown>>(`/api/checkout/${encodeURIComponent(id)}/check`, { candidates }, options),
    review: (id: string, input: { answer: string; image: string }, options?: ApiRequestOptions) =>
      post<{ review: unknown }>(`/api/checkout/${encodeURIComponent(id)}/review`, input, options),
  },
  dashboard: {
    get: (options?: ApiRequestOptions) => get<DashboardDto>("/api/admin/dashboard", options),
  },
  orders: {
    list: (input: OrderListInput, options?: ApiRequestOptions) =>
      get<{ items: OrderDto[]; page: number; pageSize: number; total: number }>(`/api/admin/orders?${orderQuery(input)}`, options),
    test: (options?: ApiRequestOptions) => post<{ checkoutUrl: string; order: OrderDto }>("/api/admin/orders/test", {}, options),
    get: (id: string, options?: ApiRequestOptions) => get<OrderDetailDto>(`/api/admin/orders/${encodeURIComponent(id)}`, options),
    remove: (id: string, options?: ApiRequestOptions) => del<{ ok: boolean }>(`/api/admin/orders/${encodeURIComponent(id)}`, options),
    check: (id: string, options?: ApiRequestOptions) => post(`/api/admin/orders/${encodeURIComponent(id)}/check`, undefined, options),
    confirm: (id: string, options?: ApiRequestOptions) => post(`/api/admin/orders/${encodeURIComponent(id)}/confirm`, {}, options),
    resend: (id: string, options?: ApiRequestOptions) => post(`/api/admin/orders/${encodeURIComponent(id)}/notify`, undefined, options),
  },
  payments: {
    list: (options?: ApiRequestOptions) => get<PaymentMethod[]>("/api/admin/payment", options),
    create: (input: PaymentMethodInput, options?: ApiRequestOptions) => post<PaymentMethod>("/api/admin/payment", input, options),
    update: (id: number, input: PaymentMethodInput, options?: ApiRequestOptions) => put<PaymentMethod>(`/api/admin/payment/${id}`, input, options),
    remove: (id: number, options?: ApiRequestOptions) => del<{ ok: boolean }>(`/api/admin/payment/${id}`, options),
  },
  merchants: {
    list: (options?: ApiRequestOptions) => get<MerchantDto[]>("/api/admin/merchants", options),
    create: (input: MerchantInput, options?: ApiRequestOptions) => post<MerchantSaveResult>("/api/admin/merchants", input, options),
    update: (id: string, input: MerchantInput, options?: ApiRequestOptions) => put<MerchantSaveResult>(`/api/admin/merchants/${encodeURIComponent(id)}`, input, options),
    remove: (id: string, options?: ApiRequestOptions) => del<{ ok: boolean }>(`/api/admin/merchants/${encodeURIComponent(id)}`, options),
    rotateKey: (id: string, options?: ApiRequestOptions) => post<MerchantSaveResult>(`/api/admin/merchants/${encodeURIComponent(id)}/rotate-key`, undefined, options),
  },
  settings: {
    get: (options?: ApiRequestOptions) => get<SettingsDto>("/api/admin/settings", options),
    save: (input: SettingsInput, options?: ApiRequestOptions) => put<SettingsDto>("/api/admin/settings", input, options),
    rates: (input: RateInput, options?: ApiRequestOptions) => get<RatePreview>(`/api/admin/rates/preview?${rateQuery(input)}`, options),
  },
  banner: {
    upload: (body: ArrayBuffer, options?: ApiRequestOptions) => upload<{ url: string }>("/api/admin/banner", body, "image/webp", options),
    restore: (options?: ApiRequestOptions) => post<{ url: string }>("/api/admin/banner/restore", undefined, options),
  },
};

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
