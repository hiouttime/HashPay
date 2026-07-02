import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import type { Context as GrammyContext } from "grammy";
import type { Context } from "hono";
import { getConfig, now } from "@/server/db";
import { AppError } from "@/server/http/api";
import { confirmLoginPin } from "@/server/services/auth/pin";
import { createTelegramOrder } from "@/server/services/orders/create";
import { checkOrderPayment, checkoutData, selectTelegramOrderPaymentByNetwork } from "@/server/services/orders/checkout";
import { getOrder } from "@/server/services/orders/repository";
import { botToken } from "@/server/services/telegram/api";
import { bindSetupAdmin } from "@/server/services/telegram/setup";
import { assetLabel, networkLabel, normalizePaymentAsset } from "@/shared/payments";
import { paymentExplorerUrl } from "@/server/payments/driver";
import type { PaymentSnapshot } from "@/shared/types/domain";
import type { Order } from "@/server/services/orders/repository";
import type { AppEnv, HonoEnv } from "@/shared/types/env";

type TelegramPaymentOption = {
  amount: number;
  asset: string;
  network: string;
};

export async function createBot(env: AppEnv) {
  const bot = new Bot(botToken(env));
  bot.catch((error) => {
    console.error("Telegram bot update failed", error.error);
  });

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
    await answerCallback(ctx, "正在检查付款");
    try {
      const snapshot = await checkOrderPayment(env, orderId);
      await editPaidPaymentMessage(ctx, env, renderPaidPaymentText(orderId, snapshot));
    } catch (error) {
      await refreshReviewKeyboardIfNeeded(ctx, env, orderId);
      await answerCallback(ctx, { show_alert: true, text: "付款未被确认。请稍等" });
    }
  });

  bot.callbackQuery(/^review:(.+)$/, async (ctx) => {
    await answerCallback(ctx, {
      show_alert: true,
      text: "请打开订单页面，上传付款截图并填写说明，管理员会进行审核。",
    });
  });

  bot.callbackQuery(/^payways:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const checkout = await checkoutData(env, orderId);
    if (checkout.options.length === 0) {
      await editPaymentMessage(ctx, "暂无可用收款通道，请先在后台启用收款通道。");
      await answerCallback(ctx);
      return;
    }
    await editMenuMessage(ctx, env, renderPaymentMenuText(checkout.order), renderAssetMenu(orderId, checkout.options));
    await answerCallback(ctx);
  });

  bot.callbackQuery(/^payasset:([^:]+):([A-Za-z0-9_-]+)$/, async (ctx) => {
    const [, orderId, asset] = ctx.match;
    const checkout = await checkoutData(env, orderId);
    await editMenuMessage(ctx, env, renderNetworkMenuText(checkout.order, checkout.options, asset), renderNetworkMenu(orderId, checkout.options, asset));
    await answerCallback(ctx);
  });

  bot.callbackQuery(/^paynet:([^:]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/, async (ctx) => {
    const [, orderId, asset, network] = ctx.match;
    try {
      const snapshot = await selectTelegramOrderPaymentByNetwork(env, orderId, asset, network);
      const order = await getOrder(env, orderId);
      await editSelectedPaymentMessage(ctx, env, orderId, renderPaymentSnapshotText(order, snapshot), await renderSelectedPaymentKeyboard(env, order), snapshot);
      await answerCallback(ctx, "已选择收款网络");
    } catch (error) {
      await answerCallback(ctx, { show_alert: true, text: telegramPaymentErrorText(error) });
    }
  });

  bot.callbackQuery("noop", async (ctx) => {
    await answerCallback(ctx);
  });

  bot.on("inline_query", async (ctx) => {
    const adminId = Number(await getConfig(env, "admin_id"));
    const from = ctx.inlineQuery.from;
    console.log("telegram:inline_query", { from: from.id, query: ctx.inlineQuery.query });
    if (!adminId || from.id !== adminId) {
      await ctx.answerInlineQuery([{
        id: "forbidden",
        input_message_content: { message_text: "当前账号无权创建 HashPay 收款。" },
        title: "仅管理员可用",
        type: "article",
      }], { cache_time: 1, is_personal: true });
      return;
    }
    const parsed = parseInlinePaymentQuery(ctx.inlineQuery.query);
    if (!parsed) {
      await ctx.answerInlineQuery([{
        description: "例如：20 / 20 USDT / 20 CNY",
        id: "help",
        input_message_content: { message_text: "请输入收款金额，例如：20、20 USDT、20 CNY。" },
        title: "输入金额创建收款",
        type: "article",
      }], { cache_time: 1, is_personal: true });
      return;
    }
    const resultId = `pay:${parsed.amount}:${parsed.currency}:${Date.now().toString(36)}`;
    const title = `发起收款 ${formatInlineAmount(parsed.amount)} ${assetLabel(parsed.currency)}`;
    const pendingText = `⏳ 正在创建收款订单：${formatInlineAmount(parsed.amount)} ${assetLabel(parsed.currency)}`;
    await ctx.answerInlineQuery([{
      description: "发送后自动创建收款订单",
      id: resultId,
      input_message_content: { message_text: pendingText },
      reply_markup: new InlineKeyboard().text("创建中…", "noop"),
      title,
      type: "article",
    }], { cache_time: 1, is_personal: true });
  });

  bot.on("chosen_inline_result", async (ctx) => {
    const result = ctx.chosenInlineResult;
    const adminId = Number(await getConfig(env, "admin_id"));
    console.log("telegram:chosen_inline_result", {
      from: result?.from.id,
      hasInlineMessageId: Boolean(result?.inline_message_id),
      resultId: result?.result_id,
    });
    if (!result || !adminId || result.from.id !== adminId || !result.inline_message_id) return;
    const parsed = parseInlineResultId(result.result_id);
    if (!parsed) return;
    const { order } = await createTelegramOrder(env, {
      amount: parsed.amount,
      currency: parsed.currency,
      description: "Telegram 内收款",
      orderNo: `inline:${result.inline_message_id}`,
    });
    const checkout = await checkoutData(env, order.id);
    if (checkout.options.length === 0) {
      await editInlinePaymentMessage(ctx, env, result.inline_message_id, "暂无可用收款通道，请先在后台启用收款通道。");
      return;
    }
    await editInlinePaymentMessage(ctx, env, result.inline_message_id, renderPaymentMenuText(order), renderAssetMenu(order.id, checkout.options));
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const match = /^\/pay\s+([0-9.]+)\s*([A-Za-z]*)/.exec(text);
    if (!match) {
      await ctx.reply("发送 /pay 10 USDT 创建一笔 Telegram 收款。");
      return;
    }
    const { order } = await createTelegramOrder(env, {
      amount: Number(match[1]),
      currency: match[2] || "USDT",
      description: "Telegram 机器人收款",
      orderNo: `message:${ctx.chat.id}:${ctx.message.message_id}`,
    });
    const checkout = await checkoutData(env, order.id);
    if (checkout.options.length === 0) {
      await ctx.reply("暂无可用收款通道，请先在后台启用收款通道。");
      return;
    }
    await replyPaymentMessage(ctx, env, renderPaymentMenuText(order), renderAssetMenu(order.id, checkout.options));
  });

  return bot;
}

function parseInlinePaymentQuery(query: string) {
  const trimmed = query.trim();
  if (/^[0-9]+(?:\.[0-9]+)?\s*[uU]$/.test(trimmed)) {
    const amount = Number(trimmed.replace(/[uU]\s*$/, ""));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { amount, currency: "USDT" };
  }
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]{0,12})$/.exec(trimmed);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency: (match[2] || "USDT").toUpperCase() };
}

function parseInlineResultId(resultId: string) {
  const parts = resultId.split(":");
  if (parts.length < 3 || parts[0] !== "pay") return null;
  const amount = Number(parts[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency: (parts[2] || "USDT").toUpperCase() };
}

function formatInlineAmount(amount: number) {
  return ceilDisplayAmount(amount).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function ceilDisplayAmount(amount: number) {
  return Math.ceil((amount - Number.EPSILON) * 100) / 100;
}

function renderPaymentMenuText(order: { amount: number; currency: string }) {
  return `💰 向你收款 ${formatInlineAmount(order.amount)} ${assetLabel(order.currency)}\n\n你想通过什么资产进行支付？`;
}

function renderAssetMenu(orderId: string, options: TelegramPaymentOption[]) {
  const keyboard = new InlineKeyboard();
  for (const asset of paymentAssets(options)) {
    keyboard.text(assetLabel(asset), `payasset:${orderId}:${asset}`).row();
  }
  return keyboard;
}

function renderNetworkMenuText(order: { amount: number; currency: string }, options: TelegramPaymentOption[], asset: string) {
  const targetAsset = normalizePaymentAsset(asset);
  const payAmount = options.find((option) => normalizePaymentAsset(option.asset) === targetAsset)?.amount ?? order.amount;
  return `💰 向你收款 ${formatInlineAmount(order.amount)} ${assetLabel(order.currency)}\n\n将支付 ${formatInlineAmount(payAmount)} ${assetLabel(asset)}。\n你想通过什么网络进行支付？`;
}

function renderNetworkMenu(orderId: string, options: TelegramPaymentOption[], asset: string) {
  const keyboard = new InlineKeyboard();
  const targetAsset = normalizePaymentAsset(asset);
  const networks = [...new Set(
    options
      .filter((option) => normalizePaymentAsset(option.asset) === targetAsset)
      .map((option) => option.network.trim().toLowerCase())
      .filter(Boolean),
  )].sort((a, b) => networkLabel(a).localeCompare(networkLabel(b)));
  for (const network of networks) {
    keyboard.text(networkLabel(network), `paynet:${orderId}:${targetAsset}:${network}`).row();
  }
  keyboard.text("重新选择资产", `payways:${orderId}`);
  return keyboard;
}

function paymentAssets(options: TelegramPaymentOption[]) {
  return [...new Set(options.map((option) => normalizePaymentAsset(option.asset)).filter(Boolean))].sort();
}

async function renderSelectedPaymentKeyboard(env: AppEnv, order: Pick<Order, "createdAt" | "expireAt" | "id">) {
  const keyboard = new InlineKeyboard()
    .text("我已完成付款", `check:${order.id}`)
    .row();
  if (shouldShowReviewButton(order)) {
    keyboard.text("已付款，仍未到账", `review:${order.id}`).row();
    const url = await checkoutUrl(env, order.id);
    if (url) keyboard.url("检查付款信息", url).row();
  }
  return keyboard.text("更换资产", `payways:${order.id}`);
}

async function refreshReviewKeyboardIfNeeded(ctx: GrammyContext, env: AppEnv, orderId: string) {
  try {
    const order = await getOrder(env, orderId);
    if (!shouldShowReviewButton(order)) return;
    const snapshot = orderPaymentSnapshot(order.payment);
    if (!snapshot.driver) return;
    await editPaymentMessage(ctx, renderPaymentSnapshotText(order, snapshot), await renderSelectedPaymentKeyboard(env, order));
  } catch (error) {
    console.warn("telegram:review_keyboard_refresh_failed", error);
  }
}

function shouldShowReviewButton(order: Pick<Order, "createdAt" | "expireAt">) {
  const createdAt = Number(order.createdAt);
  const expireAt = Number(order.expireAt);
  if (!createdAt || !expireAt || expireAt <= createdAt) return false;
  return now() - createdAt >= (expireAt - createdAt) / 2;
}

async function checkoutUrl(env: AppEnv, orderId: string) {
  const domain = await getConfig(env, "domain");
  return domain ? `${domain.replace(/\/$/, "")}/pay/${encodeURIComponent(orderId)}` : "";
}

function orderPaymentSnapshot(raw: string) {
  try {
    return JSON.parse(raw || "{}") as PaymentSnapshot;
  } catch {
    return {} as PaymentSnapshot;
  }
}

function renderPaidPaymentText(orderId: string, snapshot: PaymentSnapshot) {
  const tx = snapshot.tx!;
  const lines = [
    "✅ 谢谢，已收到付款。",
    "",
    "订单号：",
    `<pre>${escapeHtml(orderId)}</pre>`,
  ];
  const url = paymentExplorerUrl(snapshot.network, tx.txid);
  if (url) lines.push(`<a href="${escapeHtml(url)}">查看交易详细</a>`);
  return lines.join("\n");
}

function renderPaymentSnapshotText(order: Pick<Order, "expireAt" | "id">, snapshot: PaymentSnapshot) {
  return snapshot.address ? renderChainPaymentText(order, snapshot) : renderAccountPaymentText(order, snapshot);
}

function renderChainPaymentText(order: Pick<Order, "expireAt" | "id">, snapshot: PaymentSnapshot) {
  return [
    `请通过 ${escapeHtml(networkLabel(snapshot.network))} 网络，发送 ${escapeHtml(assetLabel(snapshot.currency))}`,
    "网络或资产不符将无法确认充值，且可能会丢失资金。",
    "",
    `收款地址，可使用 App 扫码：\n<pre>${escapeHtml(snapshot.address ?? "")}</pre>`,
    `应到账金额；必须完全一致，请勿多付：\n<pre>${escapeHtml(formatInlineAmount(snapshot.amount))}</pre>`,
    `遇到问题？您可提供此订单号：\n<pre>${escapeHtml(order.id)}</pre>`,
    `在此时间前完成支付，超时请勿继续付款：\n<pre>${escapeHtml(formatInlineTime(order.expireAt))}</pre>`,
  ].join("\n");
}

function renderAccountPaymentText(order: Pick<Order, "expireAt" | "id">, snapshot: PaymentSnapshot) {
  const lines = [
    `请通过 ${escapeHtml(networkLabel(snapshot.network))} 转账 ${escapeHtml(assetLabel(snapshot.currency))}`,
    "请核对收款账户和金额完全一致。",
    "",
  ];
  if (snapshot.account) lines.push(`收款账户：\n<pre>${escapeHtml(snapshot.account)}</pre>`);
  lines.push(
    `应到账金额；必须完全一致，请勿多付：\n<pre>${escapeHtml(formatInlineAmount(snapshot.amount))}</pre>`,
    `遇到问题？您可提供此订单号：\n<pre>${escapeHtml(order.id)}</pre>`,
    `在此时间前完成支付，超时请勿继续付款：\n<pre>${escapeHtml(formatInlineTime(order.expireAt))}</pre>`,
  );
  return lines.join("\n");
}

function formatInlineTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).replaceAll("/", "-");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function telegramPaymentErrorText(error: unknown) {
  if (error instanceof AppError && error.code === "order_paid") return "订单已支付";
  if (error instanceof AppError && error.code === "order_unavailable") return "订单已失效";
  if (error instanceof AppError && error.code === "payment_network_unavailable") return "当前网络不可用";
  if (error instanceof AppError && error.code === "payment_disabled") return "当前收款通道不可用";
  return "当前收款方式不可用";
}

async function answerCallback(ctx: GrammyContext, options?: string | { show_alert?: boolean; text?: string }) {
  try {
    if (typeof options === "string") {
      await ctx.answerCallbackQuery(options);
      return;
    }
    await ctx.answerCallbackQuery(options);
  } catch (error) {
    console.warn("telegram:answer_callback_failed", error);
  }
}

async function siteBannerUrl(env: AppEnv) {
  const domain = await getConfig(env, "domain");
  return domain ? `${domain.replace(/\/$/, "")}/banner.webp` : "";
}

async function editInlinePaymentMessage(ctx: GrammyContext, env: AppEnv, inlineMessageId: string, text: string, replyMarkup?: InlineKeyboard) {
  const bannerUrl = await siteBannerUrl(env);
  if (bannerUrl) {
    try {
      await ctx.api.editMessageMediaInline(
        inlineMessageId,
        { caption: text, media: bannerUrl, parse_mode: "HTML", type: "photo" },
        replyMarkup ? { reply_markup: replyMarkup } : undefined,
      );
      return;
    } catch (error) {
      console.warn("telegram:inline_banner_edit_failed", error);
    }
  }
  await ctx.api.editMessageTextInline(inlineMessageId, text, { parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

async function editPaymentMessage(ctx: GrammyContext, text: string, replyMarkup?: InlineKeyboard) {
  const inlineMessageId = ctx.callbackQuery?.inline_message_id;
  const extra = { parse_mode: "HTML" as const, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) };
  if (inlineMessageId) {
    try {
      await ctx.api.editMessageCaptionInline(inlineMessageId, { caption: text, ...extra });
      return;
    } catch {
      await ctx.api.editMessageTextInline(inlineMessageId, text, extra);
      return;
    }
  }
  const message = ctx.callbackQuery?.message;
  if (!message) return;
  if ("photo" in message) {
    try {
      await ctx.api.editMessageCaption(message.chat.id, message.message_id, { caption: text, ...extra });
      return;
    } catch {
      // Continue to text edit for messages that were created before banner support.
    }
  }
  await ctx.api.editMessageText(message.chat.id, message.message_id, text, extra);
}

async function editMenuMessage(ctx: GrammyContext, env: AppEnv, text: string, replyMarkup?: InlineKeyboard) {
  const bannerUrl = await siteBannerUrl(env);
  const inlineMessageId = ctx.callbackQuery?.inline_message_id;
  const extra = replyMarkup ? { reply_markup: replyMarkup } : undefined;
  if (bannerUrl && inlineMessageId) {
    try {
      await ctx.api.editMessageMediaInline(
        inlineMessageId,
        { caption: text, media: bannerUrl, parse_mode: "HTML", type: "photo" },
        extra,
      );
      return;
    } catch (error) {
      console.warn("telegram:inline_menu_banner_edit_failed", error);
    }
  }
  const message = ctx.callbackQuery?.message;
  if (bannerUrl && message) {
    try {
      await ctx.api.editMessageMedia(
        message.chat.id,
        message.message_id,
        { caption: text, media: bannerUrl, parse_mode: "HTML", type: "photo" },
        extra,
      );
      return;
    } catch (error) {
      console.warn("telegram:menu_banner_edit_failed", error);
    }
  }
  await editPaymentMessage(ctx, text, replyMarkup);
}

async function editPaidPaymentMessage(ctx: GrammyContext, env: AppEnv, text: string) {
  const bannerUrl = await siteBannerUrl(env);
  const clearMarkup = new InlineKeyboard();
  const inlineMessageId = ctx.callbackQuery?.inline_message_id;
  if (bannerUrl && inlineMessageId) {
    try {
      await ctx.api.editMessageMediaInline(
        inlineMessageId,
        { caption: text, media: bannerUrl, parse_mode: "HTML", type: "photo" },
        { reply_markup: clearMarkup },
      );
      return;
    } catch (error) {
      console.warn("telegram:inline_paid_banner_edit_failed", error);
    }
  }
  const message = ctx.callbackQuery?.message;
  if (bannerUrl && message) {
    try {
      await ctx.api.editMessageMedia(
        message.chat.id,
        message.message_id,
        { caption: text, media: bannerUrl, parse_mode: "HTML", type: "photo" },
        { reply_markup: clearMarkup },
      );
      return;
    } catch (error) {
      console.warn("telegram:paid_banner_edit_failed", error);
    }
  }
  await editPaymentMessage(ctx, text, clearMarkup);
}

async function editSelectedPaymentMessage(ctx: GrammyContext, env: AppEnv, orderId: string, text: string, replyMarkup: InlineKeyboard, snapshot: PaymentSnapshot) {
  const imageUrl = await orderQrUrl(env, orderId, snapshot);
  if (!imageUrl) {
    await editPaymentMessage(ctx, text, replyMarkup);
    return;
  }
  const media = { caption: text, media: imageUrl, parse_mode: "HTML" as const, type: "photo" as const };
  const extra = { reply_markup: replyMarkup };
  const inlineMessageId = ctx.callbackQuery?.inline_message_id;
  if (inlineMessageId) {
    try {
      await ctx.api.editMessageMediaInline(inlineMessageId, media, extra);
      return;
    } catch (error) {
      console.warn("telegram:inline_qr_edit_failed", error);
      await editPaymentMessage(ctx, text, replyMarkup);
      return;
    }
  }
  const message = ctx.callbackQuery?.message;
  if (!message) return;
  try {
    await ctx.api.editMessageMedia(message.chat.id, message.message_id, media, extra);
  } catch (error) {
    console.warn("telegram:qr_edit_failed", error);
    await editPaymentMessage(ctx, text, replyMarkup);
  }
}

async function replyPaymentMessage(ctx: GrammyContext, env: AppEnv, text: string, replyMarkup?: InlineKeyboard) {
  const bannerUrl = await siteBannerUrl(env);
  if (bannerUrl && ctx.chat?.id) {
    try {
      await ctx.api.sendPhoto(ctx.chat.id, bannerUrl, { caption: text, parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      return;
    } catch {
      // Telegram must fetch the banner from a public URL; local domains fall back to text.
    }
  }
  await ctx.reply(text, { parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

async function orderQrUrl(env: AppEnv, orderId: string, snapshot: PaymentSnapshot) {
  if (!snapshot.address?.trim()) return "";
  const domain = await getConfig(env, "domain");
  return domain ? `${domain.replace(/\/$/, "")}/order/${encodeURIComponent(orderId)}/qr.png` : "";
}

export async function handleTelegramWebhook(c: Context<HonoEnv>) {
  const secret = c.req.param("secret");
  const expected = await getConfig(c.env, "bot_secret");
  if (!expected || secret !== expected) throw new AppError(404, "webhook_not_found", "Webhook is not found");
  const bot = await createBot(c.env);
  return webhookCallback(bot, "hono")(c);
}
