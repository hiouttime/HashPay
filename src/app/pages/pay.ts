import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { MessageApi } from "naive-ui";
import * as pay from "@/app/payments";
import { api, type CheckoutData, type OrderDto } from "@/app/api";

const paymentProbeIntervalMs = 3000;
const statusPollIntervalMs = 5000;

export function useCheckout(orderId: string, message: MessageApi) {
  const checkout = ref<CheckoutData | null>(null);
  const changingPayment = ref(false);
  const paidReturnDueAt = ref(0);
  const nowMs = ref(Date.now());
  let pollingStatus = false;
  let probingPayment = false;
  let clock: ReturnType<typeof setInterval> | undefined;
  let statusPoll: ReturnType<typeof setInterval> | undefined;
  let paymentProbePoll: ReturnType<typeof setInterval> | undefined;
  const submittedTxHashes = new Set<string>();

  const paymentOptions = computed(() => pay.checkoutOptions(checkout.value?.options ?? []));
  const paidReturnSeconds = computed(() => {
    if (!paidReturnDueAt.value) return 5;
    return Math.max(0, Math.ceil((paidReturnDueAt.value - nowMs.value) / 1000));
  });

  async function load() {
    checkout.value = await api.checkout.order(orderId);
  }

  async function pollStatus() {
    const order = checkout.value?.order;
    if (!order || pollingStatus || ["paid", "invalid", "expired"].includes(String(order.status || ""))) return;
    pollingStatus = true;
    try {
      const latest = await api.checkout.status(orderId, { silent: true });
      const previousStatus = order.status;
      checkout.value = {
        ...checkout.value!,
        order: {
          ...order,
          ...latest,
        },
      };
      if (previousStatus !== "paid" && latest.status === "paid") {
        message.success("付款已确认");
      }
    } catch {
      // Polling should not interrupt the checkout flow.
    } finally {
      pollingStatus = false;
    }
  }

  async function probePayment() {
    const current = checkout.value;
    const order = current?.order;
    const payment = order?.payment ?? {};
    if (!order || !isPending(order) || isExpired(order, nowMs.value) || !pay.canProbeInBrowser(payment) || probingPayment) return;
    probingPayment = true;
    try {
      const candidates = (await pay.browserTxCandidates(payment, order, current.fastConfirm)).filter((item) => !submittedTxHashes.has(item.hash));
      if (!candidates.length) return;
      try {
        await api.checkout.submitTx(orderId, candidates, { silent: true });
        await pollStatus();
      } finally {
        for (const candidate of candidates) submittedTxHashes.add(candidate.hash);
      }
    } catch {
      // Browser-side probing depends on public API CORS and visitor network state.
    } finally {
      probingPayment = false;
    }
  }

  async function selectPayment(option: pay.CheckoutOption) {
    const current = checkout.value;
    const order = current?.order;
    if (!order || !isPending(order) || isExpired(order, nowMs.value)) return;
    const snapshot = await api.checkout.select(orderId, { asset: option.asset, network: option.network });
    checkout.value = {
      ...checkout.value!,
      order: {
        ...order,
        payment: snapshot,
      },
    };
    changingPayment.value = false;
    message.success("收款方式已选择");
    void probePayment();
  }

  function changePayment() {
    const order = checkout.value?.order;
    if (!order || isExpired(order, nowMs.value)) return;
    changingPayment.value = true;
  }

  function returnToMerchant() {
    const url = returnUrl(checkout.value?.order);
    if (!url) return;
    window.location.href = url;
  }

  onMounted(() => {
    void load().then(() => probePayment());
    clock = setInterval(() => {
      nowMs.value = Date.now();
    }, 1000);
    statusPoll = setInterval(() => {
      void pollStatus();
    }, statusPollIntervalMs);
    paymentProbePoll = setInterval(() => {
      void probePayment();
    }, paymentProbeIntervalMs);
  });

  watch(() => [checkout.value?.order?.status, checkout.value?.order?.returnUrl] as const, () => {
    const order = checkout.value?.order;
    paidReturnDueAt.value = order && isPaid(order) && returnUrl(order) ? Date.now() + 5000 : 0;
  }, { immediate: true });

  watch(nowMs, () => {
    const order = checkout.value?.order;
    if (!order || !isPaid(order) || !returnUrl(order) || !paidReturnDueAt.value) return;
    if (nowMs.value < paidReturnDueAt.value) return;
    paidReturnDueAt.value = 0;
    returnToMerchant();
  });

  onBeforeUnmount(() => {
    if (clock) clearInterval(clock);
    if (statusPoll) clearInterval(statusPoll);
    if (paymentProbePoll) clearInterval(paymentProbePoll);
  });

  return {
    changePayment,
    changingPayment,
    checkout,
    load,
    nowMs,
    paidReturnSeconds,
    paymentOptions,
    returnToMerchant,
    selectPayment,
  };
}

export function statusText(order: OrderDto, now = Date.now()) {
  const labels: Record<string, string> = {
    expired: "已过期",
    invalid: "异常",
    paid: "已支付",
    pending: isExpired(order, now) ? "已过期" : "待支付",
  };
  return labels[order.status] ?? order.status ?? "--";
}

export function statusType(order: OrderDto, now = Date.now()) {
  if (isPaid(order)) return "success";
  if (isExpired(order, now)) return "warning";
  if (order.status === "invalid") return "error";
  return "default";
}

export function isPaid(order: Pick<OrderDto, "status">) {
  return order.status === "paid";
}

export function isPending(order: Pick<OrderDto, "status">) {
  return order.status === "pending";
}

export function isExpired(order: Pick<OrderDto, "expireAt" | "status">, now = Date.now()) {
  return order.status === "expired" || Number(order.expireAt) * 1000 <= now;
}

export function shouldAskPaymentReview(order: OrderDto, now = Date.now()) {
  if (!isPending(order) || isExpired(order, now) || !order.payment?.driver) return false;
  const createdAt = Number(order.createdAt ?? 0) * 1000;
  const expireAt = Number(order.expireAt ?? 0) * 1000;
  if (!createdAt || !expireAt || expireAt <= createdAt) return false;
  return now - createdAt >= (expireAt - createdAt) / 2;
}

export function remainingText(order: OrderDto, now = Date.now()) {
  const expireAt = Number(order.expireAt ?? 0) * 1000;
  const seconds = Math.max(0, Math.floor((expireAt - now) / 1000));
  if (!seconds) return "已到期";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} 分 ${String(rest).padStart(2, "0")} 秒`;
}

export function remainingPercentage(order: OrderDto, now = Date.now()) {
  const createdAt = Number(order.createdAt ?? 0) * 1000;
  const expireAt = Number(order.expireAt ?? 0) * 1000;
  if (!createdAt || !expireAt || expireAt <= createdAt) return 0;
  const remaining = Math.max(0, expireAt - now);
  return Math.ceil((remaining / (expireAt - createdAt)) * 100);
}

export function returnUrl(order?: Pick<OrderDto, "returnUrl"> | null) {
  return String(order?.returnUrl || "").trim();
}

export function txUrl(payment: Record<string, any>) {
  return pay.txUrl(payment);
}

export function timeText(value: unknown) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  const date = new Date(ts * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
