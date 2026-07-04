import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import type { Context as GrammyContext } from "grammy";
import type { Context } from "hono";
import { getConfig, now } from "@/server/db";
import { AppError } from "@/server/http/api";
import { confirmLoginPin } from "@/server/services/auth/pin";
import { createTelegramOrder } from "@/server/services/orders/create";
import { checkOrderPayment, checkoutData, selectTelegramPayment } from "@/server/services/orders/checkout";
import { getOrder } from "@/server/services/orders/repository";
import { botToken } from "@/server/services/telegram/api";
import { bindSetupAdmin } from "@/server/services/telegram/setup";
import { assetLabel, networkLabel, normalizePaymentAsset } from "@/shared/payments";
import { paymentExplorerUrl } from "@/server/payments/driver";
import { normalizeLocale, t, type Locale } from "@/shared/i18n";
import { ceilAmount } from "@/shared/amount";
import type { PaymentSnapshot } from "@/shared/types/domain";
import type { Order } from "@/server/services/orders/repository";
import type { AppEnv, HonoEnv } from "@/server/types/env";

type TelegramPaymentOption = {
  amount: number;
  asset: string;
  network: string;
};

type TelegramOrderRef = {
  createdAt: number;
  expireAt: number;
  id: string;
};

type ReviewOrderRef = {
  createdAt: number;
  expireAt: number;
};

type PaidOrderRef = {
  expireAt: number;
  id: string;
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
    const locale = telegramLocale(ctx);
    const adminId = Number(await getConfig(env, "admin_id"));
    if (!adminId || ctx.from?.id !== adminId) return;
    const domain = await getConfig(env, "domain");
    if (!domain) return;
    await ctx.reply(t(locale, "telegram.start"), {
      reply_markup: new InlineKeyboard().webApp(t(locale, "telegram.open_app"), `${domain.replace(/\/$/, "")}/admin`),
    });
  });

  bot.command("login", async (ctx) => {
    const locale = telegramLocale(ctx);
    const adminId = Number(await getConfig(env, "admin_id"));
    if (!adminId || ctx.from?.id !== adminId) return;
    const pin = typeof ctx.match === "string" ? ctx.match.trim() : "";
    try {
      await confirmLoginPin(env, pin, {
        firstName: ctx.from.first_name || "",
        id: ctx.from.id,
        lastName: ctx.from.last_name || "",
      });
    } catch {
      await ctx.reply(t(locale, "telegram.login_invalid"));
      return;
    }
    await ctx.reply(t(locale, "telegram.login_confirmed", { time: formatInlineTime(Date.now() / 1000, locale) }));
  });

  bot.callbackQuery(/^check:(.+)$/, async (ctx) => {
    const locale = telegramLocale(ctx);
    const orderId = ctx.match[1];
    await answerCallback(ctx, t(locale, "telegram.checking"));
    try {
      const snapshot = await checkOrderPayment(env, orderId);
      await editPaidPaymentMessage(ctx, env, renderPaidPaymentText(orderId, snapshot, locale));
    } catch (error) {
      await refreshReviewKeyboardIfNeeded(ctx, env, orderId, locale);
      await answerCallback(ctx, { show_alert: true, text: t(locale, "telegram.not_confirmed") });
    }
  });

  bot.callbackQuery(/^review:(.+)$/, async (ctx) => {
    const locale = telegramLocale(ctx);
    await answerCallback(ctx, {
      show_alert: true,
      text: t(locale, "telegram.review_hint"),
    });
  });

  bot.callbackQuery(/^payways:(.+)$/, async (ctx) => {
    const locale = telegramLocale(ctx);
    const orderId = ctx.match[1];
    const checkout = await checkoutData(env, orderId);
    if (checkout.options.length === 0) {
      await editPaymentMessage(ctx, t(locale, "telegram.no_channels"));
      await answerCallback(ctx);
      return;
    }
    await editMenuMessage(ctx, env, renderPaymentMenuText(checkout.order, locale), renderAssetMenu(orderId, checkout.options));
    await answerCallback(ctx);
  });

  bot.callbackQuery(/^payasset:([^:]+):([A-Za-z0-9_-]+)$/, async (ctx) => {
    const locale = telegramLocale(ctx);
    const [, orderId, asset] = ctx.match;
    const checkout = await checkoutData(env, orderId);
    await editMenuMessage(ctx, env, renderNetworkMenuText(checkout.order, checkout.options, asset, locale), renderNetworkMenu(orderId, checkout.options, asset, locale));
    await answerCallback(ctx);
  });

  bot.callbackQuery(/^paynet:([^:]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/, async (ctx) => {
    const locale = telegramLocale(ctx);
    const [, orderId, asset, network] = ctx.match;
    try {
      const snapshot = await selectTelegramPayment(env, orderId, asset, network);
      const order = await getOrder(env, orderId);
      await editSelectedPaymentMessage(ctx, env, orderId, renderPaymentSnapshotText(order, snapshot, locale), await renderSelectedPaymentKeyboard(env, order, locale), snapshot);
      await answerCallback(ctx, t(locale, "telegram.network_selected"));
    } catch (error) {
      await answerCallback(ctx, { show_alert: true, text: telegramPaymentErrorText(error, locale) });
    }
  });

  bot.callbackQuery("noop", async (ctx) => {
    await answerCallback(ctx);
  });

  bot.on("inline_query", async (ctx) => {
    const locale = normalizeLocale(ctx.inlineQuery.from.language_code);
    const adminId = Number(await getConfig(env, "admin_id"));
    const from = ctx.inlineQuery.from;
    console.log("telegram:inline_query", { from: from.id, query: ctx.inlineQuery.query });
    if (!adminId || from.id !== adminId) {
      await ctx.answerInlineQuery([{
        id: "forbidden",
        input_message_content: { message_text: t(locale, "telegram.forbidden") },
        title: t(locale, "telegram.admin_only"),
        type: "article",
      }], { cache_time: 1, is_personal: true });
      return;
    }
    const parsed = parseInlinePaymentQuery(ctx.inlineQuery.query);
    if (!parsed) {
      await ctx.answerInlineQuery([{
        description: t(locale, "telegram.inline_help_desc"),
        id: "help",
        input_message_content: { message_text: t(locale, "telegram.inline_help_text") },
        title: t(locale, "telegram.inline_help_title"),
        type: "article",
      }], { cache_time: 1, is_personal: true });
      return;
    }
    const resultId = `pay:${parsed.amount}:${parsed.currency}:${Date.now().toString(36)}`;
    const title = t(locale, "telegram.inline_title", { amount: formatInlineAmount(parsed.amount), asset: assetLabel(parsed.currency) });
    const pendingText = t(locale, "telegram.inline_pending", { amount: formatInlineAmount(parsed.amount), asset: assetLabel(parsed.currency) });
    await ctx.answerInlineQuery([{
      description: t(locale, "telegram.inline_desc"),
      id: resultId,
      input_message_content: { message_text: pendingText },
      reply_markup: new InlineKeyboard().text(t(locale, "telegram.creating"), "noop"),
      title,
      type: "article",
    }], { cache_time: 1, is_personal: true });
  });

  bot.on("chosen_inline_result", async (ctx) => {
    const result = ctx.chosenInlineResult;
    const locale = normalizeLocale(result?.from.language_code);
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
      description: t(locale, "telegram.inline_order_desc"),
      orderNo: `inline:${result.inline_message_id}`,
    });
    const checkout = await checkoutData(env, order.id);
    if (checkout.options.length === 0) {
      await editInlinePaymentMessage(ctx, env, result.inline_message_id, t(locale, "telegram.no_channels"));
      return;
    }
    await editInlinePaymentMessage(ctx, env, result.inline_message_id, renderPaymentMenuText(order, locale), renderAssetMenu(order.id, checkout.options));
  });

  bot.on("message:text", async (ctx) => {
    const locale = telegramLocale(ctx);
    const text = ctx.message.text.trim();
    const match = /^\/pay\s+([0-9.]+)\s*([A-Za-z]*)/.exec(text);
    if (!match) {
      await ctx.reply(t(locale, "telegram.message_help"));
      return;
    }
    const { order } = await createTelegramOrder(env, {
      amount: Number(match[1]),
      currency: match[2] || "USDT",
      description: t(locale, "telegram.bot_order_desc"),
      orderNo: `message:${ctx.chat.id}:${ctx.message.message_id}`,
    });
    const checkout = await checkoutData(env, order.id);
    if (checkout.options.length === 0) {
      await ctx.reply(t(locale, "telegram.no_channels"));
      return;
    }
    await replyPaymentMessage(ctx, env, renderPaymentMenuText(order, locale), renderAssetMenu(order.id, checkout.options));
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
  return ceilAmount(amount).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function renderPaymentMenuText(order: { amount: number; currency: string }, locale: Locale) {
  return t(locale, "telegram.payment_menu", { amount: formatInlineAmount(order.amount), asset: assetLabel(order.currency) });
}

function renderAssetMenu(orderId: string, options: TelegramPaymentOption[]) {
  const keyboard = new InlineKeyboard();
  for (const asset of paymentAssets(options)) {
    keyboard.text(assetLabel(asset), `payasset:${orderId}:${asset}`).row();
  }
  return keyboard;
}

function renderNetworkMenuText(order: { amount: number; currency: string }, options: TelegramPaymentOption[], asset: string, locale: Locale) {
  const targetAsset = normalizePaymentAsset(asset);
  const payAmount = options.find((option) => normalizePaymentAsset(option.asset) === targetAsset)?.amount ?? order.amount;
  return t(locale, "telegram.network_menu", {
    amount: formatInlineAmount(order.amount),
    asset: assetLabel(order.currency),
    payAmount: formatInlineAmount(payAmount),
    payAsset: assetLabel(asset),
  });
}

function renderNetworkMenu(orderId: string, options: TelegramPaymentOption[], asset: string, locale: Locale) {
  const keyboard = new InlineKeyboard();
  const targetAsset = normalizePaymentAsset(asset);
  const networks = [...new Set(
    options
      .filter((option) => normalizePaymentAsset(option.asset) === targetAsset)
      .map((option) => option.network.trim().toLowerCase())
      .filter(Boolean),
  )].sort((a, b) => t(locale, networkLabel(a)).localeCompare(t(locale, networkLabel(b))));
  for (const network of networks) {
    keyboard.text(t(locale, networkLabel(network)), `paynet:${orderId}:${targetAsset}:${network}`).row();
  }
  keyboard.text(t(locale, "telegram.reselect_asset"), `payways:${orderId}`);
  return keyboard;
}

function paymentAssets(options: TelegramPaymentOption[]) {
  return [...new Set(options.map((option) => normalizePaymentAsset(option.asset)).filter(Boolean))].sort();
}

async function renderSelectedPaymentKeyboard(env: AppEnv, order: TelegramOrderRef, locale: Locale) {
  const keyboard = new InlineKeyboard()
    .text(t(locale, "telegram.done_button"), `check:${order.id}`)
    .row();
  if (shouldShowReviewButton(order)) {
    keyboard.text(t(locale, "telegram.review_button"), `review:${order.id}`).row();
    const url = await checkoutUrl(env, order.id);
    if (url) keyboard.url(t(locale, "telegram.review_link"), url).row();
  }
  return keyboard.text(t(locale, "telegram.change_asset"), `payways:${order.id}`);
}

async function refreshReviewKeyboardIfNeeded(ctx: GrammyContext, env: AppEnv, orderId: string, locale: Locale) {
  try {
    const order = await getOrder(env, orderId);
    if (!shouldShowReviewButton(order)) return;
    const snapshot = orderPaymentSnapshot(order.payment);
    if (!snapshot.driver) return;
    await editPaymentMessage(ctx, renderPaymentSnapshotText(order, snapshot, locale), await renderSelectedPaymentKeyboard(env, order, locale));
  } catch (error) {
    console.warn("telegram:review_keyboard_refresh_failed", error);
  }
}

function shouldShowReviewButton(order: ReviewOrderRef) {
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

function renderPaidPaymentText(orderId: string, snapshot: PaymentSnapshot, locale: Locale) {
  const tx = snapshot.tx!;
  const lines = [
    t(locale, "telegram.paid"),
    "",
    t(locale, "telegram.order_id"),
    `<pre>${escapeHtml(orderId)}</pre>`,
  ];
  const url = paymentExplorerUrl(snapshot.driver, tx.txid);
  if (url) lines.push(`<a href="${escapeHtml(url)}">${escapeHtml(t(locale, "telegram.tx_link"))}</a>`);
  return lines.join("\n");
}

function renderPaymentSnapshotText(order: PaidOrderRef, snapshot: PaymentSnapshot, locale: Locale) {
  return [
    escapeHtml(t(locale, "telegram.pay_chain", { network: t(locale, networkLabel(snapshot.driver)), asset: assetLabel(snapshot.currency) })),
    escapeHtml(t(locale, "telegram.network_warning")),
    "",
    t(locale, "telegram.address", { address: escapeHtml(snapshot.address ?? "") }),
    t(locale, "telegram.amount_due", { amount: escapeHtml(formatInlineAmount(snapshot.amount)) }),
    t(locale, "telegram.problem_order", { orderId: escapeHtml(order.id) }),
    t(locale, "telegram.deadline", { time: escapeHtml(formatInlineTime(order.expireAt, locale)) }),
  ].join("\n");
}

function formatInlineTime(timestamp: number, locale: Locale) {
  return new Date(timestamp * 1000).toLocaleString(locale, {
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

function telegramPaymentErrorText(error: unknown, locale: Locale) {
  if (error instanceof AppError && error.key === "errors.order_paid") return t(locale, "telegram.error.order_paid");
  if (error instanceof AppError && error.key === "errors.order_unavailable") return t(locale, "telegram.error.order_unavailable");
  if (error instanceof AppError && error.key === "errors.payment_network_unavailable") return t(locale, "telegram.error.network_unavailable");
  if (error instanceof AppError && error.key === "errors.payment_disabled") return t(locale, "telegram.error.payment_disabled");
  return t(locale, "telegram.error.payment_unavailable");
}

function telegramLocale(ctx: GrammyContext) {
  return normalizeLocale(ctx.from?.language_code);
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
  if (!expected || secret !== expected) throw new AppError(404, "errors.webhook_not_found");
  const bot = await createBot(c.env);
  return webhookCallback(bot, "hono")(c);
}
