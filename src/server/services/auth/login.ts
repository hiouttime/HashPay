import type { Context } from "hono";
import { AppError } from "@/server/http/api";
import { getConfig } from "@/server/db";
import { createLoginChallenge, consumeLoginPin, requireInstalledAdmin } from "@/server/services/auth/pin";
import { clearSessionCookie, setSessionCookie, signSession } from "@/server/services/auth/session";
import { validateWebAppInitData } from "@/server/services/auth/telegram";
import type { HonoEnv } from "@/shared/types/env";

export async function loginByTelegram(c: Context<HonoEnv>, body: Record<string, unknown>) {
  if (!c.env.TGBOT_TOKEN) throw new AppError(500, "bot_token_missing", "未配置环境变量 TGBOT_TOKEN");
  if (typeof body.initData !== "string") throw new AppError(400, "telegram_init_data_missing", "缺少 Telegram Mini App initData");

  const user = await validateWebAppInitData(body.initData, c.env.TGBOT_TOKEN);
  const adminId = Number(await getConfig(c.env, "admin_id"));
  if (!adminId) return { ...user, setupRequired: true };
  if (user.id !== adminId) throw new AppError(403, "admin_forbidden", "Forbidden");

  setSessionCookie(c, await signSession(c.env, user));
  return { ...user, setupRequired: false };
}

export function createPinLogin(c: Context<HonoEnv>, body: Record<string, unknown>) {
  if (typeof body.pin !== "string") throw new AppError(400, "login_pin_missing", "缺少登录 PIN");
  return createLoginChallenge(c.env, body.pin);
}

export async function consumePinLogin(c: Context<HonoEnv>, pin: string, challenge?: string) {
  if (!pin || !challenge) throw new AppError(400, "login_pin_missing", "缺少登录 PIN");
  const user = await consumeLoginPin(c.env, pin, challenge);
  if (!user) return { authenticated: false };

  const adminId = await requireInstalledAdmin(c.env);
  if (user.id !== adminId) throw new AppError(403, "admin_forbidden", "Forbidden");

  setSessionCookie(c, await signSession(c.env, user));
  return { authenticated: true, user };
}

export function logout(c: Context) {
  clearSessionCookie(c);
  return { ok: true };
}
