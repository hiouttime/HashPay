export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type") && !(options.body instanceof ArrayBuffer)) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(url, { ...options, credentials: "include", headers });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
  return (payload && "data" in payload ? payload.data : payload) as T;
}

export function telegramInitData() {
  return window.Telegram?.WebApp?.initData || "";
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
