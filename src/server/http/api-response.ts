import type { Context, Next } from "hono";

export async function apiEnvelope(c: Context, next: Next) {
  await next();
  const contentType = c.res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return;
  const payload = await c.res.clone().json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload) return;
  c.res = c.json({ data: payload }, c.res.status as never);
}
