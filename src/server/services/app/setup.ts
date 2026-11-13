import { getConfig } from "@/server/db";
import { AppError } from "@/server/http/api";
import { normalizeDomain } from "@/server/services/app/settings";
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
