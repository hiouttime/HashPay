import type { Context as GrammyContext } from "grammy";
import { getConfig, setConfig } from "@/server/db";
import { refreshBotInfo, setupWebhook } from "@/server/services/telegram/api";
import { normalizeLocale, t } from "@/shared/i18n";
import type { AppEnv } from "@/server/types/env";

export async function startTelegramSetup(env: AppEnv, domain: string) {
  const secret = crypto.randomUUID().replaceAll("-", "");
  await refreshBotInfo(env);
  await setConfig(env, "domain", domain);
  await setConfig(env, "bot_secret", secret);
  const webhook = await setupWebhook(env, domain, secret);
  return { webhook };
}

export async function bindSetupAdmin(env: AppEnv, ctx: GrammyContext) {
  const adminId = await getConfig(env, "admin_id");
  if (adminId) return false;
  const user = ctx.from;
  if (!user?.id) return false;
  await setConfig(env, "admin_id", String(user.id));
  await setConfig(env, "admin_user", JSON.stringify({
    firstName: user.first_name,
    id: user.id,
    lastName: user.last_name,
    username: user.username,
  }));
  const locale = normalizeLocale(user.language_code);
  await ctx.reply("🎉");
  await ctx.reply(t(locale, "setup.admin_bound"));
  return true;
}
