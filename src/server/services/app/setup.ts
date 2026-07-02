import { getConfig, jsonParseObject } from "@/server/db";
import { AppError } from "@/server/http/api";
import { ensureDefaultBanner } from "@/server/services/images/banner";
import { setSessionCookie, signSession } from "@/server/services/auth/session";
import { configureBotMiniApp } from "@/server/services/telegram/api";
import { startTelegramSetup } from "@/server/services/telegram/setup";
import type { Context } from "hono";
import type { HonoEnv, TelegramUser } from "@/shared/types/env";

export async function startSetup(c: Context<HonoEnv>, input: Record<string, unknown>) {
  if (!c.env.TGBOT_TOKEN) throw new AppError(500, "bot_token_missing", "未配置环境变量 TGBOT_TOKEN");
  const adminId = await getConfig(c.env, "admin_id");
  if (adminId) throw new AppError(409, "setup_completed", "HashPay 已完成初始化");
  const domain = normalizePublicDomain(input.domain);
  const setup = await startTelegramSetup(c.env, domain);
  return { domain, ...setup };
}

export async function setupSession(c: Context<HonoEnv>) {
  const adminId = Number(await getConfig(c.env, "admin_id"));
  if (!adminId) return { admin: null, bound: false };
  const admin = jsonParseObject<TelegramUser>(await getConfig(c.env, "admin_user"), { id: adminId });
  setSessionCookie(c, await signSession(c.env, admin));
  await ensureDefaultBanner(c.env);
  await configureBotMiniApp(c.env);
  return { admin, bound: true };
}

function normalizePublicDomain(value: unknown) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !isPublicHostname(url.hostname)) throw new Error("invalid");
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new AppError(400, "domain_invalid", "请填写公网 HTTPS 域名");
  }
}

function isPublicHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".local")) return false;
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(lower) ? lower.split(".").map(Number) : null;
  if (ipv4) {
    const [a, b] = ipv4;
    if (ipv4.some((part) => part < 0 || part > 255)) return false;
    return !(a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254));
  }
  return lower.includes(".");
}
