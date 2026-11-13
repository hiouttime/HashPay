import { getConfig, one } from "@/server/db";
import { marketAmount, rateContext } from "@/server/services/app/settings";
import { getMerchant } from "@/server/services/merchants";
import { sendTelegramImage, sendTelegramMessage, telegramAmount, telegramHtml, telegramTime } from "@/server/services/telegram/api";
import { t } from "@/shared/i18n";
import { assetName, paymentAssetTelegramEmojiId, paymentExplorerUrl } from "@/shared/payments";
import type { Order } from "@/server/services/orders/repository";
import type { PaymentSnapshot } from "@/shared/types/domain";
import type { AppEnv } from "@/server/types/env";

export async function notifyPayment(env: AppEnv, order: Order, payment: PaymentSnapshot) {
  try {
    const adminId = Number(await getConfig(env, "admin_id"));
    if (!adminId) return;
    const source = order.merchant === "INLINE" ? t("zh-CN", "telegram.payment_notice.source_inline") : (await getMerchant(env, order.merchant)).name;
    const channel = order.payway ? await one<{ name: string }>(env, "SELECT name FROM payments WHERE id = ?", order.payway) : null;
    const rate = await rateContext(env);
    const systemAmount = marketAmount(order.amount, order.currency, rate.settings.currency, rate);
    await sendTelegramMessage(env, adminId, paymentNoticeText(order, payment, source, channel?.name ?? payment.driver, {
      amount: systemAmount,
      currency: rate.settings.currency,
    }));
  } catch (error) {
    console.error("telegram:payment_notice_failed", error);
  }
}

export async function notifyReview(env: AppEnv, order: Order, answer: string, image: ArrayBuffer) {
  try {
    const adminId = Number(await getConfig(env, "admin_id"));
    if (!adminId) return;
    const imageNotice = await sendTelegramImage(env, adminId, image).then(() => "", (error) => {
      console.error("telegram:review_image_failed", error);
      return t("zh-CN", "telegram.review_notice.image_unavailable");
    });
    const text = [
      t("zh-CN", "telegram.review_notice.title", {
        amount: telegramAmount(order.amount),
        currency: assetName(order.currency),
      }),
      t("zh-CN", "telegram.review_notice.order_id", { orderId: `<code>${telegramHtml(order.id)}</code>` }),
      "",
      telegramHtml(answer),
      ...(imageNotice ? ["", imageNotice] : []),
    ].join("\n");
    await sendTelegramMessage(env, adminId, text, {
      inline_keyboard: [[
        { callback_data: `audit:delete:${order.id}`, text: t("zh-CN", "telegram.review_notice.delete") },
        { callback_data: `audit:confirm:${order.id}`, text: t("zh-CN", "telegram.review_notice.confirm") },
      ]],
    });
  } catch (error) {
    console.error("telegram:review_notice_failed", error);
  }
}

export function paymentNoticeText(
  order: Order,
  payment: PaymentSnapshot,
  source: string,
  channel: string,
  systemAmount = { amount: order.amount, currency: order.currency },
) {
  const txUrl = paymentExplorerUrl(payment.driver, payment.tx?.txid);
  const amount = telegramAmount(systemAmount.amount);
  const currency = assetName(systemAmount.currency);
  const orderAmount = telegramAmount(order.amount);
  const orderCurrency = assetName(order.currency);
  const paidAmount = telegramAmount(payment.tx?.amount ?? payment.amount);
  const paidCurrency = assetName(payment.currency);
  const emojiId = paymentAssetTelegramEmojiId(payment.currency);
  const paidAt = Number(payment.tx?.timestamp);
  const emoji = emojiId ? `<tg-emoji emoji-id="${emojiId}">💵</tg-emoji>` : "💵";
  const lines = [
    t("zh-CN", "telegram.payment_notice.title", { amount, currency }),
    "",
    t("zh-CN", "telegram.payment_notice.order_id"),
    `<pre>${telegramHtml(order.id)}</pre>`,
    t("zh-CN", "telegram.payment_notice.order_amount", { amount: orderAmount, currency: orderCurrency }),
    t("zh-CN", "telegram.payment_notice.paid_amount", { amount: paidAmount, currency: paidCurrency, emoji }),
    t("zh-CN", "telegram.payment_notice.channel", { channel: telegramHtml(channel) }),
    t("zh-CN", "telegram.payment_notice.paid_at", { time: paidAt > 0 ? telegramTime(paidAt, "zh-CN") : "--" }),
    t("zh-CN", "telegram.payment_notice.source", { source: telegramHtml(source) }),
  ];
  if (txUrl) lines.push("", `<a href="${telegramHtml(txUrl)}">${t("zh-CN", "telegram.payment_notice.view_tx")}</a>`);
  return lines.join("\n");
}
