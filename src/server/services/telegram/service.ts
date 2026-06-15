import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import type { Context as GrammyContext } from "grammy";
import type { Context } from "hono";
import { getConfig, now, setConfig } from "@/server/db";
import { AppError } from "@/server/http/api-error";
import { confirmLoginPin } from "@/server/services/auth/pin";
import { checkOrderPayment, createMerchantOrder, selectOrderPayment } from "@/server/services/orders/service";
import type { AppEnv } from "@/shared/types/env";

export function botToken(env: AppEnv) {
  if (!env.TGBOT_TOKEN) throw new AppError(500, "bot_token_missing", "未配置环境变量 TGBOT_TOKEN");
  return env.TGBOT_TOKEN;
}

export async function getBotInfo(env: AppEnv) {
  const response = await fetch(`https://api.telegram.org/bot${botToken(env)}/getMe`);
  const payload = (await response.json()) as { description?: string; ok: boolean; result?: { username?: string } };
  if (!payload.ok || !payload.result?.username) {
    throw new AppError(500, "bot_token_invalid", "TGBOT_TOKEN 无效");
  }
  return payload.result;
}

export async function setupWebhook(env: AppEnv, domain: string, secret: string) {
  const url = `${domain.replace(/\/$/, "")}/telegram/webhook/${secret}`;
  const response = await fetch(`https://api.telegram.org/bot${botToken(env)}/setWebhook`, {
    body: JSON.stringify({ allowed_updates: ["message", "callback_query", "inline_query"], url }),
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
  return { url };
}

export async function createBot(env: AppEnv) {
  const bot = new Bot(botToken(env));

  bot.use(async (ctx, next) => {
    if (ctx.message && await bindSetupAdmin(env, ctx)) return;
    await next();
  });

  bot.command("start", async (ctx) => {
    const adminId = Number(await getConfig(env, "admin_id"));
    if (!adminId || ctx.from?.id !== adminId) return;
    const domain = await getConfig(env, "domain");
    if (!domain) return;
    await ctx.reply("欢迎使用 HashPay。", {
      reply_markup: new InlineKeyboard().webApp("访问小程序", `${domain.replace(/\/$/, "")}/admin`),
    });
  });

  bot.command("login", async (ctx) => {
    const adminId = Number(await getConfig(env, "admin_id"));
    if (!adminId || ctx.from?.id !== adminId) return;
    const pin = typeof ctx.match === "string" ? ctx.match.trim() : "";
    try {
      await confirmLoginPin(env, pin, {
        firstName: ctx.from.first_name,
        id: ctx.from.id,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
      });
    } catch {
      await ctx.reply("登录 PIN 无效或已过期。");
      return;
    }
    await ctx.reply(`✅ ${new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}\n已确认你的登录，请返回浏览器继续。`);
  });

  bot.callbackQuery(/^check:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery("正在检查付款");
    try {
      await checkOrderPayment(env, orderId, "button");
      await ctx.editMessageText("已确认付款，订单状态已更新。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "暂未找到匹配付款";
      await ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().text("我已完成付款", `check:${orderId}`),
      });
      await ctx.answerCallbackQuery({ show_alert: true, text: message });
    }
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const match = /^\/pay\s+([0-9.]+)\s*([A-Za-z]*)/.exec(text);
    if (!match) {
      await ctx.reply("发送 /pay 10 USDT 创建一笔 Telegram 收款。");
      return;
    }
    const merchantKey = await getConfig(env, "telegram_merchant_key");
    if (!merchantKey) {
      await ctx.reply("请先在后台创建商户，并把 API Key 保存到 telegram_merchant_key。");
      return;
    }
    const { order } = await createMerchantOrder(env, merchantKey, {
      amount: Number(match[1]),
      currency: match[2] || "USD",
      merchant_order_no: `tg-${ctx.message.message_id}-${Date.now()}`,
    });
    const defaultPayway = Number(await getConfig(env, "telegram_default_payway"));
    if (defaultPayway) {
      await selectOrderPayment(env, order.id, defaultPayway, match[2] || "USDT").catch(() => undefined);
    }
    const domain = await getConfig(env, "domain");
    await ctx.reply(`订单已创建：${order.id}`, {
      reply_markup: new InlineKeyboard()
        .url("打开付款页", `${domain ?? ""}/pay/${order.id}`)
        .text("我已完成付款", `check:${order.id}`),
    });
  });

  return bot;
}

export async function handleTelegramWebhook(c: Context<{ Bindings: AppEnv }>) {
  const secret = c.req.param("secret");
  const expected = await getConfig(c.env, "webhook_secret");
  if (!expected || secret !== expected) throw new AppError(404, "webhook_not_found", "Webhook is not found");
  const bot = await createBot(c.env);
  return webhookCallback(bot, "hono")(c);
}

export async function saveTelegramSetup(env: AppEnv, domain: string, adminId: number) {
  const secret = crypto.randomUUID().replaceAll("-", "");
  await setConfig(env, "domain", domain);
  await setConfig(env, "admin_id", String(adminId));
  await setConfig(env, "webhook_secret", secret);
  const webhook = await setupWebhook(env, domain, secret);
  return { webhook };
}

export async function startTelegramSetup(env: AppEnv, domain: string, setupToken: string) {
  const secret = crypto.randomUUID().replaceAll("-", "");
  await setConfig(env, "domain", domain);
  await setConfig(env, "webhook_secret", secret);
  await setConfig(env, "setup_token", setupToken);
  await setConfig(env, "setup_expires_at", String(now() + 10 * 60));
  const webhook = await setupWebhook(env, domain, secret);
  return { webhook };
}

async function bindSetupAdmin(env: AppEnv, ctx: GrammyContext) {
  const adminId = await getConfig(env, "admin_id");
  if (adminId) return false;
  const setupToken = await getConfig(env, "setup_token");
  const expiresAt = Number(await getConfig(env, "setup_expires_at"));
  if (!setupToken || !Number.isFinite(expiresAt) || expiresAt < now()) return false;
  const user = ctx.from;
  if (!user?.id) return false;
  await setConfig(env, "admin_id", String(user.id));
  await setConfig(env, "admin_user", JSON.stringify({
    firstName: user.first_name,
    id: user.id,
    lastName: user.last_name,
    username: user.username,
  }));
  await ctx.reply("🎉");
  await ctx.reply("管理员账户已绑定，请回到页面继续完成配置。");
  return true;
}
