import { Hono } from "hono";
import { getConfig } from "@/server/db";
import { AppError } from "@/server/http/api-error";
import { consumeLoginPin, createLoginChallenge, requireInstalledAdmin } from "@/server/services/auth/pin";
import { clearSessionCookie, requireAdmin, setSessionCookie, signSession } from "@/server/services/auth/session";
import { validateWebAppInitData } from "@/server/services/auth/telegram";
import type { AppEnv, AppVariables } from "@/shared/types/env";

export function createAuthRoutes() {
  const app = new Hono<{ Bindings: AppEnv; Variables: AppVariables }>();
  app.post("/telegram", async (c) => {
    if (!c.env.TGBOT_TOKEN) throw new AppError(500, "bot_token_missing", "未配置环境变量 TGBOT_TOKEN");
    const body = (await c.req.json()) as Record<string, unknown>;
    if (typeof body.initData !== "string") throw new AppError(400, "telegram_init_data_missing", "缺少 Telegram Mini App initData");
    const user = await validateWebAppInitData(body.initData, c.env.TGBOT_TOKEN);
    const adminId = Number(await getConfig(c.env, "admin_id"));
    if (!adminId) {
      return c.json({ ...user, setupRequired: true });
    } else if (user.id !== adminId) {
      throw new AppError(403, "admin_forbidden", "Forbidden");
    }
    setSessionCookie(c, await signSession(c.env, user));
    return c.json({ ...user, setupRequired: false });
  });
  app.post("/pin", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    if (typeof body.pin !== "string") throw new AppError(400, "login_pin_missing", "缺少登录 PIN");
    return c.json(await createLoginChallenge(c.env, body.pin));
  });
  app.get("/pin/status", async (c) => {
    const pin = c.req.query("pin");
    const challenge = c.req.query("challenge");
    if (!pin || !challenge) throw new AppError(400, "login_pin_missing", "缺少登录 PIN");
    const user = await consumeLoginPin(c.env, pin, challenge);
    if (!user) return c.json({ authenticated: false });
    const adminId = await requireInstalledAdmin(c.env);
    if (user.id !== adminId) throw new AppError(403, "admin_forbidden", "Forbidden");
    setSessionCookie(c, await signSession(c.env, user));
    return c.json({ authenticated: true, user });
  });
  app.get("/me", async (c) => c.json(await requireAdmin(c)));
  app.post("/logout", (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
  });
  return app;
}
