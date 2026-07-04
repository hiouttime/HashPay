import { getConfig, jsonParseObject } from "@/server/db";
import { AppError } from "@/server/http/api";
import { ensureDefaultBanner } from "@/server/services/images/banner";
import { setSessionCookie, signSession } from "@/server/services/auth/session";
import { configureBotMiniApp } from "@/server/services/telegram/api";
import { startTelegramSetup } from "@/server/services/telegram/setup";
import type { Context } from "hono";
import type { HonoEnv, TelegramUser } from "@/server/types/env";

export async function startSetup(c: Context<HonoEnv>, input: Record<string, unknown>) {
  if (!c.env.TGBOT_TOKEN) throw new AppError(500, "errors.bot_token_missing");
  const adminId = await getConfig(c.env, "admin_id");
  if (adminId) throw new AppError(409, "errors.setup_completed");
  const domain = normalizeDomain(input.domain);
  const setup = await startTelegramSetup(c.env, domain);
  return { domain, ...setup };
}

export async function setupSession(c: Context<HonoEnv>) {
  const adminId = Number(await getConfig(c.env, "admin_id"));
  if (!adminId) return { admin: null, bound: false };
  const admin = jsonParseObject<TelegramUser>(await getConfig(c.env, "admin_user"), { firstName: "", id: adminId, lastName: "" });
  setSessionCookie(c, await signSession(c.env, admin));
  await ensureDefaultBanner(c.env);
  await configureBotMiniApp(c.env);
  return { admin, bound: true };
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
