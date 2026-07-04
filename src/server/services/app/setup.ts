import { getConfig } from "@/server/db";
import { AppError } from "@/server/http/api";
import { startTelegramSetup } from "@/server/services/telegram/setup";
import type { Context } from "hono";
import type { HonoEnv } from "@/server/types/env";

export async function startSetup(c: Context<HonoEnv>, input: Record<string, unknown>) {
  if (!c.env.TGBOT_TOKEN) throw new AppError(500, "errors.bot_token_missing");
  if (await getConfig(c.env, "admin_id")) throw new AppError(409, "errors.setup_initialized");
  const domain = normalizeDomain(input.domain);
  const setup = await startTelegramSetup(c.env, domain);
  return { domain, ...setup };
}

function normalizeDomain(value: unknown) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const domain = /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z][a-z0-9-]{1,62}$/;
    if (
      url.protocol !== "https:"
      || host === "localhost"
      || host.endsWith(".local")
      || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)
      || !domain.test(host)
    ) throw new Error("invalid");
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new AppError(400, "errors.domain_invalid");
  }
}
