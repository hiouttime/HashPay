import type { Context, Next } from "hono";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorBody(error: unknown) {
  if (error instanceof AppError) {
    return {
      body: { error: { code: error.code, message: error.message } },
      status: error.status,
    };
  }
  if (error instanceof Error) {
    return {
      body: { error: { code: "internal_error", message: error.message } },
      status: 500,
    };
  }
  return {
    body: { error: { code: "internal_error", message: "Internal error" } },
    status: 500,
  };
}

export async function apiEnvelope(c: Context, next: Next) {
  await next();
  const contentType = c.res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return;
  const payload = await c.res.clone().json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload) return;
  c.res = c.json({ data: payload }, c.res.status as never);
}
