import { all, getConfig, jsonParseObject, now, run } from "@/server/db";
import { AppError } from "@/server/http/api";
import { getMerchant } from "@/server/services/merchants";
import { assignPayment, checkPayment, createPayment, paymentOptions } from "@/server/payments/driver";
import { findPayment, listPayments, recordCheck, type PaymentChannel } from "@/server/payments/channels";
import { getOrder, listPendingChannelOrders, listPendingPaymentOrders, publicOrder, refreshOrderPaymentWindow, setOrderPayment } from "@/server/services/orders/repository";
import { createNotify } from "@/server/services/orders/notifications";
import { notifyPayment, notifyReview } from "@/server/services/telegram/notify";
import { clearReviewImage, saveReview } from "@/server/services/orders/review";
import { ezfpReturnUrl, preserveEzfpContext } from "@/server/services/merchants/ezfp";
import { payAmount, rateContext, systemSettings, toleranceOf } from "@/server/services/app/settings";
import { key } from "@/shared/payments";
import { ceilAmount, sameAmount } from "@/shared/amount";
import type { Order } from "@/server/services/orders/repository";
import type { PaymentSnapshot, PaymentTxEvidence } from "@/shared/types/domain";
import type { AppEnv } from "@/server/types/env";

type PaymentTxInput = {
  amount?: number;
  confirmedBy?: PaymentTxEvidence["confirmedBy"];
  timestamp?: number;
  txid?: string;
};

export async function checkoutData(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  const [merchant, payments, rate, title] = await Promise.all([
    order.merchant === "INLINE" ? null : getMerchant(env, order.merchant),
    listPayments(env),
    rateContext(env),
    getConfig(env, "title"),
  ]);
  return {
    fastConfirm: rate.settings.fastConfirm,
    merchant: merchant ? { id: merchant.id, name: merchant.name } : { id: "INLINE", name: "Telegram" },
    options: payments.filter((channel) => channel.status === "enabled").flatMap(paymentOptions).map((option) => ({
      amount: payAmount(order.amount, order.currency, option.asset, rate),
      asset: option.asset,
      network: option.network,
    })),
    order: checkoutOrder(order, merchant),
    title: title || "HashPay",
  };
}

export async function checkoutStatus(env: AppEnv, orderId: string) {
  let order = await getOrder(env, orderId);
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  if (order.status === "pending" && snapshot.url) {
    await checkClaimedOrder(env, order).catch(() => undefined);
    order = await getOrder(env, orderId);
  }
  const merchant = order.merchant === "INLINE" ? null : await getMerchant(env, order.merchant);
  return checkoutOrder(order, merchant);
}

function checkoutOrder(order: Order, merchant: Awaited<ReturnType<typeof getMerchant>> | null) {
  const returnUrl = merchant?.type === "ezfp" ? ezfpReturnUrl(order, merchant) : order.redirectUrl;
  return { ...publicOrder(order), returnUrl };
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
  const targetAsset = key(asset);
  const targetNetwork = key(network);
  const channels = (await listPayments(env)).filter((channel) => channel.status === "enabled"
    && paymentOptions(channel).some((option) => key(option.asset) === targetAsset && key(option.network) === targetNetwork));
  if (!channels.length) throw new AppError(400, "errors.payment_network_unavailable");
  const channel = channels[crypto.getRandomValues(new Uint32Array(1))[0] % channels.length];
  const rate = await rateContext(env);
  const amount = await uniqueAmount(env, channel, order.id, targetAsset, payAmount(order.amount, order.currency, targetAsset, rate));
  const snapshot = preserveEzfpContext(
    order.payment,
    await createPayment(channel, order, assignPayment(channel, amount, targetAsset)),
  );
  const ts = now();
  const saved = refreshWindow
    ? await refreshOrderPaymentWindow(env, order.id, channel.id, snapshot, rate.settings.timeout, ts)
    : await setOrderPayment(env, order.id, channel.id, snapshot, ts);
  if (!saved) throw new AppError(400, "errors.order_unavailable");
  return snapshot;
}

// Amounts are reserved per receiving address and asset, not per channel row: two channels
// may share one address, and a payment is attributed only by address + amount.
async function uniqueAmount(env: AppEnv, channel: PaymentChannel, orderId: string, asset: string, amount: number) {
  const rows = await all<{ id: string; payment: string }>(
    env,
    "SELECT id, payment FROM orders WHERE status = 'pending' AND expire_at > ? AND json_extract(payment, '$.driver') = ? AND id <> ?",
    now(),
    channel.driver,
    orderId,
  );
  const used = rows.flatMap((row) => {
    const snapshot = jsonParseObject<Partial<PaymentSnapshot>>(row.payment, {});
    if (snapshot.address !== channel.address) return [];
    if (key(snapshot.currency) !== asset) return [];
    const value = Number(snapshot.amount);
    return Number.isFinite(value) && value > 0 ? [value] : [];
  });

  let next = ceilAmount(amount);
  while (used.some((value) => sameAmount(value, next))) next = ceilAmount(next + 0.01);
  return next;
}

export async function markPaid(env: AppEnv, order: Order, tx: PaymentTxInput) {
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  const manual = tx.confirmedBy === "admin";
  const driver = manual ? "manual" : key(snapshot.driver);
  const txid = manual ? crypto.randomUUID() : normalizeTxid(driver, tx.txid);
  if (!driver || !txid) return null;
  const received = Number(tx.amount);
  const paidPayment = {
    ...snapshot,
    tx: {
      confirmedBy: tx.confirmedBy ?? "system",
      timestamp: tx.timestamp ?? now(),
      ...(manual ? {} : { txid }),
      ...(Number.isFinite(received) && received > 0 ? { amount: received } : {}),
    },
  };
  const ts = now();
  // Only an admin may confirm an expired order. A transaction pays at most one order: the
  // NOT EXISTS guard and the unique (driver, txid) index both reject a second claim.
  const result = await run(
    env,
    `UPDATE orders SET status = 'paid', payment = ?, driver = ?, txid = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status IN (${manual ? "'pending', 'expired'" : "'pending'"}) AND NOT EXISTS (SELECT 1 FROM orders claimed WHERE claimed.driver = ? AND claimed.txid = ?)`,
    JSON.stringify(paidPayment),
    driver,
    txid,
    ts,
    ts,
    order.id,
    driver,
    txid,
  ).catch((error) => {
    if (txConflict(error)) return null;
    throw error;
  });
  if (!result) return null;
  if (!result.meta.changes) {
    const current = await getOrder(env, order.id);
    return current.status === "paid" ? jsonParseObject<PaymentSnapshot>(current.payment, {} as PaymentSnapshot) : null;
  }
  if (manual) await clearReviewImage(env, order.id);
  await createNotify(env, order.id);
  await notifyPayment(env, order, paidPayment);
  return paidPayment;
}

function normalizeTxid(driver: string, value: unknown) {
  const txid = String(value ?? "").trim();
  if (!txid) return "";
  return ["aptos", "base", "bep20", "erc20", "polygon", "trc20", "xlayer"].includes(driver) ? txid.toLowerCase() : txid;
}

function txConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("orders.driver, orders.txid") || message.includes("orders_driver_txid_unique");
}

export async function submitPaymentReview(env: AppEnv, orderId: string, input: { answer: string; image: Blob | null }) {
  const order = await getOrder(env, orderId);
  if (order.status === "paid") throw new AppError(400, "errors.order_paid");
  if (order.status === "invalid") throw new AppError(400, "errors.order_unavailable");
  const answer = input.answer.trim();
  if (!answer) throw new AppError(400, "errors.review_answer_required");
  const image = await saveReview(env, order.id, answer, input.image);
  await notifyReview(env, order, answer, image);
  return { ok: true };
}

// Public checks hit exchange/chain APIs with the merchant's credentials and quotas,
// so anonymous callers may trigger at most one provider query per order per window.
const publicCheckIntervalSeconds = 10;

export async function checkPublicOrderPayment(env: AppEnv, orderId: string) {
  return checkClaimedOrder(env, await getOrder(env, orderId));
}

export async function checkOrderPayment(env: AppEnv, orderId: string) {
  return checkLoadedOrder(env, await getOrder(env, orderId));
}

async function checkClaimedOrder(env: AppEnv, order: Order) {
  if (order.status === "paid") return jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  const ts = now();
  const claimed = await run(
    env,
    "UPDATE orders SET checked_at = ? WHERE id = ? AND status = 'pending' AND (checked_at IS NULL OR checked_at <= ?)",
    ts,
    order.id,
    ts - publicCheckIntervalSeconds,
  );
  if (!claimed.meta.changes) throw new AppError(404, "errors.tx_not_found");
  return checkLoadedOrder(env, order);
}

async function checkLoadedOrder(env: AppEnv, order: Order) {
  if (order.status === "paid") return jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  if (order.status !== "pending" || now() > order.expireAt) throw new AppError(400, "errors.order_unavailable");
  const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
  if (!snapshot.driver) throw new AppError(400, "errors.payment_not_selected");
  const settings = await systemSettings(env);
  const result = await checkPayment({
    channel: order.payway ? await findPayment(env, order.payway) ?? undefined : undefined,
    fastConfirm: settings.fastConfirm,
    orders: await scanOrders(env, order, snapshot, settings.dynamicMatch),
    tolerance: toleranceOf(settings),
  });
  if (order.payway) await recordCheck(env, order.payway, result);
  if (result.status === "error") throw new AppError(502, "errors.payment_check_failed", { detail: result.error ?? "unknown" });
  const match = result.matches.find((item) => item.orderId === order.id);
  if (match) {
    const payment = await markPaid(env, order, { amount: match.amount, timestamp: match.time, txid: match.txid });
    if (payment) return payment;
  }
  throw new AppError(404, "errors.tx_not_found");
}

export async function checkPendingPayments(env: AppEnv) {
  const orders = await listPendingPaymentOrders(env, 200);
  if (!orders.length) return;
  const [channels, settings] = await Promise.all([
    listPayments(env),
    systemSettings(env),
  ]);
  const channelById = new Map(channels
    .filter((channel) => channel.status === "enabled")
    .map((channel) => [channel.id, channel]));
  const groups = new Map<number, Array<{ order: Order; snapshot: PaymentSnapshot }>>();
  for (const order of orders) {
    const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
    if (!order.payway || !snapshot.driver) continue;
    if (!channelById.has(order.payway)) continue;
    groups.set(order.payway, [...(groups.get(order.payway) ?? []), { order, snapshot }]);
  }
  if (settings.dynamicMatch) {
    for (const payway of groups.keys()) {
      const pending = await listPendingChannelOrders(env, payway);
      const items = pending.flatMap((order) => {
        const snapshot = jsonParseObject<PaymentSnapshot>(order.payment, {} as PaymentSnapshot);
        return snapshot.driver ? [{ order, snapshot }] : [];
      });
      if (items.length) groups.set(payway, items);
    }
  }

  for (const [payway, items] of groups) {
    const channel = channelById.get(payway);
    if (!channel) continue;
    const result = await checkPayment({
      channel,
      fastConfirm: settings.fastConfirm,
      orders: items.map((item) => checkOrder(item.order, item.snapshot)),
      tolerance: toleranceOf(settings),
    });
    await recordCheck(env, payway, result);
    if (result.status === "error") continue;
    for (const match of result.matches) {
      const item = items.find((entry) => entry.order.id === match.orderId);
      if (item) await markPaid(env, item.order, { amount: match.amount, timestamp: match.time, txid: match.txid });
    }
  }
}

async function scanOrders(env: AppEnv, order: Order, snapshot: PaymentSnapshot, dynamic: boolean) {
  if (!dynamic || !order.payway) return [checkOrder(order, snapshot)];
  const pending = await listPendingChannelOrders(env, order.payway);
  const orders = pending.flatMap((item) => {
    const itemSnapshot = item.id === order.id ? snapshot : jsonParseObject<PaymentSnapshot>(item.payment, {} as PaymentSnapshot);
    if (!itemSnapshot.driver) return [];
    return [checkOrder(item, itemSnapshot)];
  });
  return orders.some((item) => item.id === order.id) ? orders : [checkOrder(order, snapshot), ...orders];
}

function checkOrder(order: Order, snapshot: PaymentSnapshot) {
  return {
    createdAt: order.createdAt,
    expireAt: order.expireAt,
    id: order.id,
    snapshot,
  };
}

export async function confirmOrder(env: AppEnv, orderId: string) {
  const order = await getOrder(env, orderId);
  if (order.status !== "pending" && order.status !== "expired") throw new AppError(400, "errors.order_unavailable");
  const payment = await markPaid(env, order, {
    confirmedBy: "admin",
    timestamp: now(),
  });
  if (!payment) throw new AppError(400, "errors.order_unavailable");
  return payment;
}
