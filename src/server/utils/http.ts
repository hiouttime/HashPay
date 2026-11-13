import { jsonParseObject } from "@/server/db";

const timeoutMs = 8000;

export async function fetchText(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal }).then((res) => res.text().then((text) => ({ res, text })));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`${host(url)} request timed out`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}) {
  const { res, text } = await fetchText(url, init);
  if (!res.ok) throw new Error(`${host(url)} HTTP ${res.status} ${reason(text || res.statusText)}`.trim());
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    throw new Error(`${host(url)} invalid JSON ${reason(text)}`);
  }
}

// Short failure reason for an exchange API response: `code msg` from a JSON body, else the raw text.
export function responseReason(res: Response, text: string) {
  const fallback = `HTTP ${res.status}`;
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) return reason(text || fallback);
  const body = jsonParseObject<{ code?: unknown; msg?: unknown }>(text, {});
  return reason([body.code, body.msg].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ") || fallback);
}

export function reason(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function host(url: string) {
  return new URL(url).host;
}
