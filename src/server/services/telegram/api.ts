import { getConfig, setConfig } from "@/server/db";
import { AppError } from "@/server/http/api";
import type { AppEnv } from "@/shared/types/env";

export function botToken(env: AppEnv) {
  if (!env.TGBOT_TOKEN) throw new AppError(500, "bot_token_missing", "未配置环境变量 TGBOT_TOKEN");
  return env.TGBOT_TOKEN;
}

export async function getBotInfo(env: AppEnv) {
  const response = await fetch(`https://api.telegram.org/bot${botToken(env)}/getMe`);
  const payload = (await response.json()) as { description?: string; ok: boolean; result?: { username?: string } };
  const username = payload.result?.username;
  if (!payload.ok || !username) throw new AppError(500, "bot_token_invalid", "TGBOT_TOKEN 无效");
  return { ...payload.result, username };
}

export async function refreshBotInfo(env: AppEnv) {
  const bot = await getBotInfo(env);
  await setConfig(env, "bot_username", bot.username);
  return bot;
}

export async function setupWebhook(env: AppEnv, domain: string, secret: string) {
  const url = `${domain.replace(/\/$/, "")}/telegram/webhook/${secret}`;
  const response = await fetch(`https://api.telegram.org/bot${botToken(env)}/setWebhook`, {
    body: JSON.stringify({ allowed_updates: ["message", "callback_query", "inline_query", "chosen_inline_result"], url }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as { description?: string; ok: boolean };
  if (!payload.ok) throw new AppError(400, "webhook_setup_failed", payload.description ?? "Webhook setup failed");
  return url;
}

export async function configureBotMiniApp(env: AppEnv) {
  const domain = await getConfig(env, "domain");
  if (!domain) throw new AppError(400, "domain_missing", "站点地址未配置");
  const secret = await getConfig(env, "bot_secret");
  const url = `${domain.replace(/\/$/, "")}/admin`;
  const response = await fetch(`https://api.telegram.org/bot${botToken(env)}/setChatMenuButton`, {
    body: JSON.stringify({
      menu_button: {
        text: "访问小程序",
        type: "web_app",
        web_app: { url },
      },
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as { description?: string; ok: boolean };
  if (!payload.ok) throw new AppError(400, "miniapp_setup_failed", payload.description ?? "Mini App 配置失败");
  if (secret) await setupWebhook(env, domain, secret);
}
