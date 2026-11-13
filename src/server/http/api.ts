import type { MiddlewareHandler } from "hono";
import type { I18nParams, MessageKey } from "@/shared/i18n";
import type { HonoEnv } from "@/server/types/env";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly key: MessageKey | string,
    public readonly params: I18nParams = {},
  ) {
    super(key);
  }
}

export function errorBody(error: unknown) {
  if (error instanceof AppError) {
    return {
      body: { error: { key: error.key, params: error.params } },
      status: error.status,
    };
  }
  return {
    body: { error: { key: "errors.internal", params: {} } },
    status: 500,
  };
}

// Per-IP limit through the RATE_LIMIT binding. Counts are per Cloudflare location and approximate.
// IPv6 uses the /64 prefix so one host cannot rotate addresses. Without the binding (local dev) it is a no-op.
export function rateLimit(scope: string): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const key = `${scope}:${ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip}`;
    const outcome = await c.env.RATE_LIMIT?.limit({ key });
    if (outcome && !outcome.success) throw new AppError(429, "errors.rate_limited");
    await next();
  };
}
