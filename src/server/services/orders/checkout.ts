import { all, jsonParseObject, now, run } from "@/server/db";
import { AppError } from "@/server/http/api";
import { getMerchant } from "@/server/services/merchants";
import { assignPayment, checkPayment, paymentOptions } from "@/server/payments/driver";
import { listPayments, recordCheck, type PaymentChannel } from "@/server/payments/channels";
import { getOrder, publicOrder, refreshOrderPaymentWindow, setOrderPayment } from "@/server/services/orders/repository";
import { createNotify } from "@/server/services/orders/notifications";
import { conversionContext, convertAmount, convertAmountWithContext, systemSettings } from "@/server/services/app/settings";
import { normalizeNetworkKey, normalizePaymentAsset } from "@/shared/payments";
import { ceilAmount, sameAmount } from "@/shared/amount";
import type { Order } from "@/server/services/orders/repository";
import type { PaymentReviewEvidence, PaymentSnapshot, PaymentTxEvidence } from "@/shared/types/domain";
import type { AppEnv } from "@/server/types/env";

type PaymentTxInput = Partial<Pick<PaymentTxEvidence, "txid" | "timestamp">> & {
  confirmedBy?: PaymentTxEvidence["confirmedBy"];
};

export async function checkoutData(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  const merchant = order.merchant === "INLINE" ? { id: "INLINE", name: "Telegram" } : await getMerchant(env, order.merchant);
  const channels = (await listPayments(env)).filter((item) => item.status === "enabled");
  const rateContext = await conversionContext(env);
  const options = [];
  for (const channel of channels) {
    for (const option of paymentOptions(channel)) {
      options.push({
        amount: convertAmountWithContext(order.amount, order.currency, option.asset, rateContext),
        asset: option.asset,
        network: option.network,
      });
    }
  }
  return {
    fastConfirm: rateContext.settings.fast_confirm,
    merchant: { id: merchant.id, name: merchant.name },
    options,
    order: publicOrder(order),
  };
}

function randomIndex(length: number) {
  const data = new Uint32Array(1);
  crypto.getRandomValues(data);
  return data[0] % length;
}

export async function selectCheckoutPayment(env: AppEnv, orderId: string, asset: string, network: string) {
  const order = await getOrder(env, orderId);
  if (order.status !== "pending" || now() > order.expireAt) throw new AppError(400, "errors.order_unavailable");
  return selectPayment(env, order, asset, network, false);
}

export async function selectTelegramPayment(env: AppEnv, orderId: string, asset: string, network: string) {
  const order = await getOrder(env, orderId);
  if (order.merchant !== "INLINE") throw new AppError(400, "errors.order_unavailable");
  if (order.status === "paid") throw new AppError(400, "errors.order_paid");
  if (order.status === "invalid") throw new AppError(400, "errors.order_unavailable");
  return selectPayment(env, order, asset, network, true);
}

async function selectPayment(env: AppEnv, order: Order, asset: string, network: string, refreshWindow: boolean) {
  const targetAsset = normalizePaymentAsset(asset);
  const targetNetwork = normalizeNetworkKey(network);
  const channels = [];
  for (const channel of (await listPayments(env)).filter((item) => item.status === "enabled")) {
    for (const quote of paymentOptions(channel)) {
      if (normalizePaymentAsset(quote.asset) === targetAsset && normalizeNetworkKey(quote.network) === targetNetwork) {
        channels.push(channel);
      }
    }
  }
  if (!channels.length) throw new AppError(400, "errors.payment_network_unavailable");
  const channel = channels[randomIndex(channels.length)];
  const payAmount = await uniqueAmount(env, channel, order.id, targetAsset, targetNetwork, await convertAmount(env, order.amount, order.currency, targetAsset));
  const snapshot = assignPayment(channel, payAmount, targetAsset);
  const ts = now();
  if (refreshWindow) {
    await refreshOrderPaymentWindow(env, order.id, channel.id, snapshot, (await systemSettings(env)).timeout, ts);
  } else {
    await setOrderPayment(env, order.id, channel.id, snapshot, ts);
  }
  return snapshot;
}

async function uniqueAmount(env: AppEnv, channel: PaymentChannel, orderId: string, asset: string, network: string, amount: number) {
  const rows = await all<{ id: string; payment: string }>(
    env,
    "SELECT id, payment FROM orders WHERE status = 'pending' AND expire_at > ? AND payway = ? AND id <> ?",
    now(),
    channel.id,
    orderId,
  );
  const used = rows.flatMap((row) => {
    const snapshot = jsonParseObject<Partial<PaymentSnapshot>>(row.payment, {});
    if (snapshot.address !== channel.address) return [];
    if (normalizePaymentAsset(snapshot.currency) !== asset) return [];
    if (normalizeNetworkKey(snapshot.network) !== network) return [];
    const value = Number(snapshot.amount);
    return Number.isFinite(value) && value > 0 ? [value] : [];
  });

  let next = ceilAmount(amount);
  while (used.some((value) => sameAmount(value, next))) next = ceilAmount(next + 0.01);
  return next;
}

export async function markPaid(env: AppEnv, order: Order, tx: PaymentTxInput) {
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  const paidPayment = {
    ...snapshot,
    tx: {
      confirmedBy: tx.confirmedBy ?? "system",
      timestamp: tx.timestamp ?? now(),
      txid: tx.txid,
    },
  };
  const ts = now();
  await run(env, "UPDATE orders SET status = 'paid', payment = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'", JSON.stringify(paidPayment), ts, ts, order.id);
  await createNotify(env, order.id);
  return paidPayment;
}

export async function checkSubmittedPayment(env: AppEnv, orderId: string, input: unknown) {
  const order = await getOrder(env, orderId);
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  const result = await checkPayment({
    candidates: input,
    createdAt: order.createdAt,
    expireAt: order.expireAt,
    fastConfirm: (await systemSettings(env)).fast_confirm,
    snapshot,
  });
  if (result && order.payway) await recordCheck(env, order.payway, result);
  if (result?.status === "paid") return markPaid(env, order, { timestamp: result.time, txid: result.txid });
  if (result?.status === "error") throw new AppError(502, "errors.payment_check_failed");
  throw new AppError(400, "errors.tx_not_found");
}

export async function submitPaymentReview(env: AppEnv, orderId: string, input: Record<string, unknown>) {
  const order = await getOrder(env, orderId);
  if (order.status === "paid") throw new AppError(400, "errors.order_paid");
  if (order.status === "invalid") throw new AppError(400, "errors.order_unavailable");
  const image = String(input.image ?? "").trim();
  const answer = String(input.answer ?? "").trim();
  if (!answer) throw new AppError(400, "errors.review_answer_required");
  if (!image.startsWith("data:image/")) throw new AppError(400, "errors.review_image_invalid");
  if (image.length > 2_800_000) throw new AppError(400, "errors.review_image_too_large");
  const snapshot = jsonParseObject<Partial<PaymentSnapshot>>(order.payment, {});
  const review: PaymentReviewEvidence = {
    answer,
    image,
    status: "pending",
    submittedAt: now(),
  };
  const payment = { ...snapshot, review };
  await run(env, "UPDATE orders SET payment = ?, updated_at = ? WHERE id = ?", JSON.stringify(payment), review.submittedAt, order.id);
  return { review };
}

export async function checkOrderPayment(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  if (order.status !== "pending") return jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  if (!snapshot.driver) throw new AppError(400, "errors.payment_not_selected");
  const result = await checkPayment({
    createdAt: order.createdAt,
    expireAt: order.expireAt,
    fastConfirm: (await systemSettings(env)).fast_confirm,
    snapshot,
  });
  if (order.payway) await recordCheck(env, order.payway, result);
  if (result.status === "paid") return markPaid(env, order, { timestamp: result.time, txid: result.txid });
  if (result.status === "error") throw new AppError(502, "errors.payment_check_failed");
  throw new AppError(404, "errors.tx_not_found");
}

export async function confirmOrder(env: AppEnv, orderId: string, input: Record<string, unknown>) {
  const order = await getOrder(env, orderId);
  if (order.status !== "pending") throw new AppError(400, "errors.order_unavailable");
  const tx: PaymentTxEvidence = {
    confirmedBy: "admin",
    timestamp: Number(input.timestamp ?? now()),
    txid: typeof input.txid === "string" ? input.txid.trim() || undefined : undefined,
  };
  return markPaid(env, order, tx);
}
