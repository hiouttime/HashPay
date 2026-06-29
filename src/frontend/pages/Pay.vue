<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useMessage } from "naive-ui";
import bnbIcon from "@/frontend/assets/chains/bnb.svg";
import ethereumIcon from "@/frontend/assets/chains/ethereum.svg";
import polygonIcon from "@/frontend/assets/chains/polygon.svg";
import tonIcon from "@/frontend/assets/chains/ton.svg";
import tronIcon from "@/frontend/assets/chains/tron.svg";
import usdcIcon from "@/frontend/assets/currencies/usdc.svg";
import usdtIcon from "@/frontend/assets/currencies/usdt.svg";
import { api } from "@/frontend/services/api";

const paymentProbeIntervalMs = 3000;
const statusPollIntervalMs = 5000;
const tronGridBaseUrl = "https://nile.trongrid.io";

interface CheckoutOption {
  amount: number;
  currency: string;
  label: string;
  network: string;
  value: string;
}

const route = useRoute();
const message = useMessage();
const data = ref<any>(null);
const selectedCurrency = ref("");
const selectedNetwork = ref("");
const selectionStep = ref<"currency" | "network">("currency");
const changingPayment = ref(false);
const reviewImage = ref("");
const reviewImageName = ref("");
const reviewLoading = ref(false);
const reviewReturnStep = ref(0);
const reviewStep = ref(0);
const reviewTxid = ref("");
const reviewVisible = ref(false);
const reviewAnswers = ref<Record<string, string>>({});
const qrVisible = ref(false);
const paidReturnDueAt = ref(0);
const paidReturning = ref(false);
const nowMs = ref(Date.now());
const pollingStatus = ref(false);
const probingPayment = ref(false);
let clock: ReturnType<typeof setInterval> | undefined;
let statusPoll: ReturnType<typeof setInterval> | undefined;
let paymentProbePoll: ReturnType<typeof setInterval> | undefined;
const submittedTxHashes = new Set<string>();
const currencyIcons: Record<string, string> = {
  BNB: bnbIcon,
  ETH: ethereumIcon,
  GRAM: tonIcon,
  MATIC: polygonIcon,
  TRX: tronIcon,
  USDC: usdcIcon,
  USDT: usdtIcon,
};
const networkIcons: Record<string, string> = {
  bsc: bnbIcon,
  eth: ethereumIcon,
  ethereum: ethereumIcon,
  polygon: polygonIcon,
  ton: tonIcon,
  tron: tronIcon,
};

const orderId = computed(() => String(route.params.id));
const order = computed(() => data.value?.order ?? {});
const merchant = computed(() => data.value?.merchant ?? {});
const payment = computed(() => order.value?.payment ?? {});
const isPaid = computed(() => order.value.status === "paid");
const isPending = computed(() => order.value.status === "pending");
const isExpired = computed(() => order.value.status === "expired" || Number(order.value.expire_at ?? 0) * 1000 <= nowMs.value);
const paymentTarget = computed(() => payment.value.address || payment.value.account || "");
const paymentAddressParts = computed(() => splitAddress(paymentTarget.value));
const hasPayment = computed(() => Boolean(payment.value?.driver));
const fastConfirm = computed(() => data.value?.fast_confirm === true || data.value?.fast_confirm === "true");
const canProbePaymentInBrowser = computed(() => {
  return isPending.value
    && !isExpired.value
    && payment.value?.network === "tron"
    && Boolean(payment.value?.address);
});
const paymentOptions = computed<CheckoutOption[]>(() => {
  const seen = new Set<string>();
  return (data.value?.options ?? []).flatMap((option: any) => {
    const currency = String(option.currency || "").toUpperCase();
    const network = String(option.network || "").toLowerCase();
    const key = `${currency}:${network}`;
    if (!currency || !network || seen.has(key)) return [];
    seen.add(key);
    return [{
      amount: option.amount,
      currency,
      label: `${networkLabel(network)} / ${currencyLabel(currency)}`,
      network,
      value: key,
    }];
  });
});
const currencyOptions = computed(() => {
  const map = new Map<string, CheckoutOption[]>();
  for (const option of paymentOptions.value) {
    const list = map.get(option.currency) ?? [];
    list.push(option);
    map.set(option.currency, list);
  }
  return Array.from(map.entries()).map(([currency, options]) => ({
    amount: options[0]?.amount,
    currency,
    networks: options,
  }));
});
const networkOptions = computed(() => paymentOptions.value.filter((item) => item.currency === selectedCurrency.value));
const selectedOption = computed(() => networkOptions.value.find((item) => item.network === selectedNetwork.value));
const selectedCurrencyOption = computed(() => currencyOptions.value.find((item) => item.currency === selectedCurrency.value));
const statusText = computed(() => {
  const labels: Record<string, string> = {
    expired: "已过期",
    invalid: "异常",
    paid: "已支付",
    pending: isExpired.value ? "已过期" : "待支付",
  };
  return labels[order.value.status] ?? order.value.status ?? "--";
});
const statusType = computed(() => {
  if (isPaid.value) return "success";
  if (isExpired.value) return "warning";
  if (order.value.status === "invalid") return "error";
  return "default";
});
const expireText = computed(() => formatTime(order.value.expire_at));
const createdText = computed(() => formatTime(order.value.created_at));
const shouldAskPaymentReview = computed(() => {
  if (!isPending.value || isExpired.value || !hasPayment.value) return false;
  const createdAt = Number(order.value.created_at ?? 0) * 1000;
  const expireAt = Number(order.value.expire_at ?? 0) * 1000;
  if (!createdAt || !expireAt || expireAt <= createdAt) return false;
  return nowMs.value - createdAt >= (expireAt - createdAt) / 2;
});
const remainingText = computed(() => {
  const expireAt = Number(order.value.expire_at ?? 0) * 1000;
  const seconds = Math.max(0, Math.floor((expireAt - nowMs.value) / 1000));
  if (!seconds) return "已到期";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} 分 ${String(rest).padStart(2, "0")} 秒`;
});
const remainingPercentage = computed(() => {
  const createdAt = Number(order.value.created_at ?? 0) * 1000;
  const expireAt = Number(order.value.expire_at ?? 0) * 1000;
  if (!createdAt || !expireAt || expireAt <= createdAt) return 0;
  const remaining = Math.max(0, expireAt - nowMs.value);
  return Math.ceil((remaining / (expireAt - createdAt)) * 100);
});
const merchantReturnUrl = computed(() => String(order.value.return_url || "").trim());
const paidReturnSeconds = computed(() => {
  if (!paidReturnDueAt.value) return 5;
  return Math.max(0, Math.ceil((paidReturnDueAt.value - nowMs.value) / 1000));
});
const txUrl = computed(() => {
  const hash = payment.value?.tx?.hash;
  if (!hash || payment.value.network !== "tron") return "";
  return `https://nile.tronscan.org/#/transaction/${encodeURIComponent(hash)}`;
});
const reviewQuestions = computed(() => {
  const currency = String(payment.value?.currency || selectedCurrency.value || "USDT").toUpperCase();
  const network = String(payment.value?.network || selectedNetwork.value || "tron").toLowerCase();
  const amount = Number(payment.value?.amount || selectedOption.value?.amount || order.value?.amount || 0);
  const networkCorrect = reviewNetworkAnswer(network);
  const currencyCorrect = currencyLabel(currency);
  const amountCorrect = `${formatExactAmount(amount)} ${currencyCorrect}`;
  const networkOptions = buildFourOptions(networkCorrect, ["TRON (TRC20)", "Ethereum (ERC20)", "BNB Smart Chain (BEP20)", "TON", "Polygon"]);
  const currencyOptions = buildFourOptions(currencyCorrect, ["USDT", "USDC", "TRX", "Gram (ex TON)", "BNB", "ETH"]);
  const amountOptions = buildAmountOptions(amount, currencyCorrect, amountCorrect);
  return [
    {
      id: "network",
      options: networkOptions,
      title: "你通过哪种网络完成付款？",
      correct: networkCorrect,
      risk: `看起来你使用了错误的网络发送代币，你应使用 ${networkCorrect}。\n这种情况，你的付款可能存在丢失风险。`,
    },
    {
      id: "currency",
      options: currencyOptions,
      title: "你支付了哪种币种？",
      correct: currencyCorrect,
      risk: `看起来你支付了错误的币种，你应支付 ${currencyCorrect}。\n这种情况，你的付款可能存在丢失风险。`,
    },
    {
      id: "amount",
      options: amountOptions,
      title: "提现时，最终到账金额是多少？",
      correct: amountCorrect,
      risk: "由于区块链的匿名性，系统仅能依靠金额区分订单，如果您没有按照系统的指示支付金额，则您的付款可能会确认到其他订单上。\n这种情况，您的付款很可能无效。",
    },
  ];
});
const currentReviewQuestion = computed(() => reviewQuestions.value[reviewStep.value]);
const isReviewCredentialStep = computed(() => reviewStep.value >= reviewQuestions.value.length);
const reviewHelpSuffix = "不过，你可以上传付款信息来让我们帮你核实。";
const reviewFinalRisk = computed(() => {
  const question = reviewQuestions.value.find((item) => {
    const value = reviewAnswers.value[item.id];
    return value && value !== item.correct;
  });
  return `${question?.risk ?? "这可能是交易网络存在一些问题导致无法确认，非常抱歉给您带来不便。"}\n\n${reviewHelpSuffix}`;
});
const canGoNextReviewStep = computed(() => {
  const question = currentReviewQuestion.value;
  return Boolean(question && reviewAnswers.value[question.id]);
});
const canSubmitReview = computed(() => {
  return isReviewCredentialStep.value
    && Boolean(reviewTxid.value.trim())
    && Boolean(reviewImage.value);
});

async function load() {
  data.value = await api(`/api/checkout/${orderId.value}`);
  const currentCurrency = payment.value?.currency ? String(payment.value.currency).toUpperCase() : "";
  const currentNetwork = payment.value?.network ? String(payment.value.network).toLowerCase() : "";
  selectedCurrency.value = currentCurrency || selectedCurrency.value || currencyOptions.value[0]?.currency || "";
  selectedNetwork.value = currentNetwork || selectedNetwork.value || "";
  if (hasPayment.value) selectionStep.value = "network";
}

async function pollOrderStatus() {
  if (!data.value || pollingStatus.value || ["paid", "invalid", "expired"].includes(String(order.value.status || ""))) return;
  pollingStatus.value = true;
  try {
    const latest = await api<Record<string, unknown>>(`/api/checkout/${orderId.value}/status`);
    const previousStatus = order.value.status;
    data.value = {
      ...data.value,
      order: {
        ...order.value,
        ...latest,
      },
    };
    if (previousStatus !== "paid" && latest.status === "paid") {
      message.success("付款已确认");
    }
  } catch {
    // Polling should not interrupt the checkout flow.
  } finally {
    pollingStatus.value = false;
  }
}

async function probePaymentFromBrowser() {
  if (!canProbePaymentInBrowser.value || probingPayment.value) return;
  probingPayment.value = true;
  try {
    const candidates = (await fetchTronCandidatesFromBrowser()).filter((item) => !submittedTxHashes.has(item.hash));
    if (!candidates.length) return;
    try {
      await api(`/api/checkout/${orderId.value}/tx-candidates`, {
        body: JSON.stringify({ candidates }),
        method: "POST",
      });
      await pollOrderStatus();
    } finally {
      for (const candidate of candidates) submittedTxHashes.add(candidate.hash);
    }
  } catch {
    // Browser-side probing depends on public API CORS and visitor network state.
  } finally {
    probingPayment.value = false;
  }
}

async function fetchTronCandidatesFromBrowser() {
  const address = String(payment.value?.address || "");
  const currency = String(payment.value?.currency || "").toUpperCase();
  const minTimestamp = Math.max(0, Number(order.value.created_at ?? 0)) * 1000;
  const onlyConfirmed = fastConfirm.value ? "false" : "true";
  const candidates = [];
  if (currency !== "TRX") {
    const tokens = await fetch(`${tronGridBaseUrl}/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?limit=50&only_confirmed=${onlyConfirmed}&min_timestamp=${minTimestamp}`).then((res) => res.json() as Promise<{ data?: any[] }>);
    candidates.push(...(tokens.data ?? []).flatMap((item: any) => {
      const symbol = String(item.token_info?.symbol || "").toUpperCase();
      if (symbol !== currency) return [];
      return [{
        amount: Number(item.value) / 10 ** Number(item.token_info?.decimals ?? 6),
        currency: symbol,
        from: item.from,
        hash: item.transaction_id,
        raw: item,
        timestamp: Math.floor(Number(item.block_timestamp) / 1000),
        to: item.to,
      }];
    }));
  }
  if (currency === "TRX") {
    const native = await fetch(`${tronGridBaseUrl}/v1/accounts/${encodeURIComponent(address)}/transactions?limit=50&only_to=true&only_confirmed=${onlyConfirmed}&min_timestamp=${minTimestamp}`).then((res) => res.json() as Promise<{ data?: any[] }>);
    candidates.push(...(native.data ?? []).flatMap((item: any) => {
      const contract = item.raw_data?.contract?.[0];
      const value = contract?.parameter?.value;
      if (contract?.type !== "TransferContract" || !value?.amount) return [];
      return [{
        amount: Number(value.amount) / 1_000_000,
        currency: "TRX",
        from: value.owner_address,
        hash: item.txID,
        raw: item,
        timestamp: Math.floor(Number(item.block_timestamp) / 1000),
        to: address,
      }];
    }));
  }
  return candidates.filter((item) => item.hash && Number.isFinite(item.amount) && Number.isFinite(item.timestamp));
}

async function selectPayment(option = selectedOption.value) {
  if (!option || !isPending.value || isExpired.value) return;
  const snapshot = await api<Record<string, unknown>>(`/api/checkout/${orderId.value}/payment`, {
    body: JSON.stringify({ currency: option.currency, network: option.network }),
    method: "POST",
  });
  data.value = {
    ...data.value,
    order: {
      ...order.value,
      payment: snapshot,
    },
  };
  changingPayment.value = false;
  message.success("收款方式已选择");
  void probePaymentFromBrowser();
}

function chooseCurrency(currency: string) {
  if (isExpired.value) return;
  selectedCurrency.value = currency;
  selectedNetwork.value = "";
  selectionStep.value = "network";
}

async function chooseNetwork(option: CheckoutOption) {
  if (isExpired.value) return;
  selectedNetwork.value = option.network;
  await selectPayment(option);
}

function changeCurrency() {
  if (isExpired.value) return;
  selectionStep.value = "currency";
}

function changePayment() {
  if (isExpired.value) return;
  changingPayment.value = true;
  selectionStep.value = "currency";
}

function openReview() {
  reviewAnswers.value = {};
  reviewImage.value = "";
  reviewImageName.value = "";
  reviewReturnStep.value = 0;
  reviewStep.value = 0;
  reviewTxid.value = "";
  reviewVisible.value = true;
}

function returnToMerchant() {
  if (!merchantReturnUrl.value) return;
  window.location.href = merchantReturnUrl.value;
}

async function uploadReviewImage(options: { file: { file?: File | null }; onError?: () => void; onFinish?: () => void }) {
  const file = options.file.file;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    message.warning("请上传图片");
    options.onError?.();
    return;
  }
  if (file.size > 2_000_000) {
    message.warning("图片不能超过 2MB");
    options.onError?.();
    return;
  }
  try {
    reviewImageName.value = file.name;
    reviewImage.value = await fileToDataUrl(file);
    options.onFinish?.();
  } catch {
    options.onError?.();
  }
}

async function submitReview() {
  if (!reviewTxid.value.trim()) {
    message.warning("请填写交易编号");
    return;
  }
  if (!reviewImage.value) {
    message.warning("请上传付款截图");
    return;
  }
  reviewLoading.value = true;
  try {
    await api(`/api/checkout/${orderId.value}/review`, {
      body: JSON.stringify({
        answer: buildReviewAnswer(),
        image: reviewImage.value,
      }),
      method: "POST",
    });
    await load();
    reviewVisible.value = false;
    message.success("已提交，等待管理员审核");
  } finally {
    reviewLoading.value = false;
  }
}

function chooseReviewAnswer(questionId: string, answer: string) {
  reviewAnswers.value = { ...reviewAnswers.value, [questionId]: answer };
}

function nextReviewStep() {
  const question = currentReviewQuestion.value;
  if (!question || !reviewAnswers.value[question.id]) {
    message.warning("请先选择一个答案");
    return;
  }
  reviewReturnStep.value = reviewStep.value;
  if (reviewAnswers.value[question.id] !== question.correct || reviewStep.value >= reviewQuestions.value.length - 1) {
    reviewStep.value = reviewQuestions.value.length;
    return;
  }
  reviewStep.value += 1;
}

function previousReviewStep() {
  if (isReviewCredentialStep.value) {
    reviewStep.value = reviewReturnStep.value;
    return;
  }
  reviewStep.value = Math.max(0, reviewStep.value - 1);
}

function buildReviewAnswer() {
  return [
    ...reviewQuestions.value.map((question) => `${question.title}\n${reviewAnswers.value[question.id] || "未继续询问"}`),
    `交易哈希/TXID/交易编号/转账ID\n${reviewTxid.value.trim()}`,
  ].join("\n\n");
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function copyText(value: unknown) {
  const text = String(value || "");
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    message.success("已复制");
  } catch {
    message.warning("请手动复制");
  }
}

function shortText(value: unknown, start = 10, end = 8) {
  const text = String(value || "");
  return text.length > start + end + 3 ? `${text.slice(0, start)}...${text.slice(-end)}` : text;
}

onMounted(() => {
  void load().then(() => probePaymentFromBrowser());
  clock = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
  statusPoll = setInterval(() => {
    void pollOrderStatus();
  }, statusPollIntervalMs);
  paymentProbePoll = setInterval(() => {
    void probePaymentFromBrowser();
  }, paymentProbeIntervalMs);
});

watch(networkOptions, (options) => {
  if (!options.some((item) => item.network === selectedNetwork.value)) {
    selectedNetwork.value = "";
  }
});

watch([isPaid, merchantReturnUrl], ([paid, returnUrl]) => {
  paidReturnDueAt.value = paid && returnUrl ? Date.now() + 5000 : 0;
  paidReturning.value = false;
}, { immediate: true });

watch(nowMs, () => {
  if (!isPaid.value || !merchantReturnUrl.value || !paidReturnDueAt.value || paidReturning.value) return;
  if (nowMs.value < paidReturnDueAt.value) return;
  paidReturning.value = true;
  returnToMerchant();
});

onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
  if (statusPoll) clearInterval(statusPoll);
  if (paymentProbePoll) clearInterval(paymentProbePoll);
});

function networkLabel(network: string) {
  const labels: Record<string, string> = {
    binance: "Binance",
    bsc: "BNB Smart Chain (BEP20)",
    eth: "Ethereum (ERC20)",
    ethereum: "Ethereum (ERC20)",
    huobi: "Huobi",
    okpay: "Okpay",
    okx: "OKX",
    polygon: "Polygon",
    tron: "TRON (TRC20)",
    ton: "TON",
  };
  return labels[network] ?? network.toUpperCase();
}

function networkIcon(network: unknown) {
  return networkIcons[String(network || "").toLowerCase()] || "";
}

function currencyLabel(currency: unknown) {
  const value = String(currency || "").toUpperCase();
  return value === "GRAM" ? "Gram (ex TON)" : value;
}

function currencyIcon(currency: unknown) {
  return currencyIcons[String(currency || "").toUpperCase()] || "";
}

function splitAddress(value: unknown) {
  const text = String(value || "");
  if (text.length <= 10) return { middle: "", prefix: text, suffix: "" };
  return {
    middle: text.slice(5, -5),
    prefix: text.slice(0, 5),
    suffix: text.slice(-5),
  };
}

function formatAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return ceilDisplayAmount(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatExactAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return ceilDisplayAmount(Math.max(0, amount)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatIntegerAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return Math.max(0, Math.trunc(amount)).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function ceilDisplayAmount(amount: number) {
  return Math.ceil((amount - Number.EPSILON) * 100) / 100;
}

function reviewNetworkAnswer(network: string) {
  const labels: Record<string, string> = {
    bsc: "BNB Smart Chain (BEP20)",
    eth: "Ethereum (ERC20)",
    ethereum: "Ethereum (ERC20)",
    polygon: "Polygon",
    ton: "TON",
    tron: "TRON (TRC20)",
  };
  return labels[network] ?? networkLabel(network);
}

function shuffleOptions(items: string[]) {
  return [...new Set(items)].sort((left, right) => stableOptionScore(left) - stableOptionScore(right));
}

function buildFourOptions(correct: string, candidates: string[]) {
  const distractors = shuffleOptions(candidates.filter((item) => item !== correct)).slice(0, 3);
  return shuffleOptions([correct, ...distractors]);
}

function buildAmountOptions(amount: number, currency: string, correct: string) {
  const isIntegerAmount = Number.isInteger(ceilDisplayAmount(amount));
  const wrongOptions = isIntegerAmount
    ? [
        `${formatExactAmount(amount + 1)} ${currency}`,
        `${formatExactAmount(amount - 1.5)} ${currency}`,
        `${formatExactAmount(amount - 0.2)} ${currency}`,
      ]
    : [
        `${formatIntegerAmount(amount)} ${currency}`,
        `${formatExactAmount(amount - 1.5)} ${currency}`,
        `${formatExactAmount(amount - 0.2)} ${currency}`,
      ];
  return shuffleOptions([correct, ...wrongOptions]);
}

function stableOptionScore(value: string) {
  let score = orderId.value.length;
  for (let index = 0; index < value.length; index += 1) {
    score = (score * 31 + value.charCodeAt(index)) % 997;
  }
  return score;
}

function formatTime(value: unknown) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  const date = new Date(ts * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
</script>

<template>
  <n-layout class="checkout-shell">
    <n-layout-header class="checkout-topbar">
      <div class="checkout-topbar-inner">
        <div class="checkout-brand">
          <strong>HashPay</strong>
          <span>收银台</span>
        </div>
      </div>
    </n-layout-header>

    <n-layout-content v-if="data" class="checkout-content" content-class="checkout-page">
      <section class="checkout-receipt">
        <div class="checkout-receipt-head">
          <div>
            <span>商户</span>
            <strong>{{ merchant.name || 'HashPay' }}</strong>
          </div>
          <n-tag :type="statusType">{{ statusText }}</n-tag>
        </div>
        <div class="checkout-amount-block">
          <span>订单金额</span>
          <strong>{{ formatAmount(order.amount) }} {{ currencyLabel(order.currency) }}</strong>
        </div>
        <div v-if="isPending && !isExpired" class="checkout-countdown">
          <n-progress
            type="circle"
            :percentage="remainingPercentage"
            :stroke-width="6"
            color="#16a34a"
            rail-color="#e5e7eb"
          >
            <div class="checkout-countdown-content">
              <span>剩余付款时间</span>
              <strong>{{ remainingText }}</strong>
            </div>
          </n-progress>
        </div>
        <dl class="checkout-receipt-meta">
          <div>
            <dt>订单号</dt>
            <dd>
              <code>{{ order.id }}</code>
              <n-button size="tiny" text type="primary" @click="copyText(order.id)">复制</n-button>
            </dd>
          </div>
          <div>
            <dt>订单信息</dt>
            <dd>{{ order.description || '网页收银台订单' }}</dd>
          </div>
          <div>
            <dt>最后付款时间</dt>
            <dd>{{ expireText }}</dd>
          </div>
        </dl>
      </section>

      <section class="checkout-flow" :class="{ 'checkout-flow--paid': isPaid }">
        <template v-if="isPaid">
          <div class="checkout-paid-state">
            <div class="checkout-paid-mark">✓</div>
            <div>
              <strong>谢谢</strong>
              <span>你的付款已被确认。</span>
            </div>
          </div>
          <dl class="checkout-paid-meta">
            <div>
              <dt>收款方式</dt>
              <dd>{{ networkLabel(payment.network) }} / {{ currencyLabel(payment.currency) }}</dd>
            </div>
            <div>
              <dt>到账金额</dt>
              <dd>{{ formatAmount(payment.amount) }} {{ currencyLabel(payment.currency) }}</dd>
            </div>
            <div v-if="payment.tx?.hash">
              <dt>交易记录</dt>
              <dd>
                <a v-if="txUrl" :href="txUrl" target="_blank" rel="noreferrer">查看交易</a>
                <span v-else>{{ shortText(payment.tx.hash, 10, 8) }}</span>
              </dd>
            </div>
          </dl>
          <div v-if="merchantReturnUrl" class="checkout-return-actions">
            <n-button block type="primary" @click="returnToMerchant">返回商户</n-button>
            <span>{{ paidReturnSeconds }} 秒后返回商户</span>
          </div>
          <p v-else class="checkout-return-hint">请返回商户页面继续</p>
        </template>

        <template v-else-if="isExpired">
          <div class="checkout-expired-state">
            <strong>订单已过期</strong>
            <span>请勿继续付款，继续付款可能会导致您的财产损失。</span>
            <span>如您需要继续付款，请返回商户重新下单。</span>
          </div>
          <n-button v-if="merchantReturnUrl" block type="primary" @click="returnToMerchant">返回商户</n-button>
          <n-button block secondary type="warning" @click="openReview">已付款，仍未到账</n-button>
        </template>

        <template v-else-if="payment.driver && !changingPayment">
          <div class="checkout-pay-method">
            <div>
              <span>收款网络</span>
              <strong class="checkout-network-title">
                <img v-if="networkIcon(payment.network)" :src="networkIcon(payment.network)" :alt="networkLabel(payment.network)" />
                <span>{{ networkLabel(payment.network) }}</span>
              </strong>
            </div>
            <n-button size="small" text type="primary" @click="changePayment">更换</n-button>
          </div>
          <div v-if="paymentTarget" class="checkout-copy-field" :class="{ 'checkout-copy-field--address': payment.address }">
            <template v-if="payment.address">
              <div class="checkout-copy-head">
                <span>收款地址</span>
                <div class="checkout-copy-actions">
                  <n-button size="small" text type="primary" @click="copyText(paymentTarget)">复制</n-button>
                  <n-button class="checkout-mobile-qr-button" size="small" secondary type="primary" @click="qrVisible = true">显示二维码</n-button>
                </div>
              </div>
              <div class="checkout-address-qr-inline">
                <div class="checkout-qr-box">
                  <n-qr-code :size="168" :value="payment.address" />
                </div>
              </div>
              <code class="checkout-address-code">
                <strong>{{ paymentAddressParts.prefix }}</strong><span>{{ paymentAddressParts.middle }}</span><strong>{{ paymentAddressParts.suffix }}</strong>
              </code>
            </template>
            <template v-else>
              <span>收款账户</span>
              <code>{{ paymentTarget }}</code>
              <n-button size="small" text type="primary" @click="copyText(paymentTarget)">复制</n-button>
            </template>
          </div>
          <div v-if="payment.memo" class="checkout-copy-field">
            <span>转账备注</span>
            <code>{{ payment.memo }}</code>
            <n-button size="small" text type="primary" @click="copyText(payment.memo)">复制</n-button>
          </div>
          <div class="checkout-due-amount">
            <div>
              <span>应付金额</span>
              <strong class="checkout-currency-title">
                <img v-if="currencyIcon(payment.currency)" :src="currencyIcon(payment.currency)" :alt="payment.currency" />
                <span>{{ formatAmount(payment.amount) }} {{ currencyLabel(payment.currency) }}</span>
              </strong>
              <small>请确保到账金额一致，部分平台可能存在手续费。</small>
            </div>
            <n-button size="small" secondary type="primary" @click="copyText(formatAmount(payment.amount))">复制金额</n-button>
          </div>
          <div class="checkout-warning">
            <strong v-if="payment.network === 'tron' && payment.currency === 'USDT'">请通过 TRON (TRC20) 网络，发送 USDT</strong>
            <strong v-else>请通过 {{ networkLabel(payment.network) }} 网络，发送 {{ currencyLabel(payment.currency) }}</strong>
            <span>网络或币种不符将无法确认充值，且可能会丢失资金。</span>
          </div>
          <n-button
            v-if="shouldAskPaymentReview"
            block
            secondary
            type="warning"
            @click="openReview"
          >
            已付款，仍未到账
          </n-button>
        </template>

        <template v-else>
          <div v-if="selectionStep === 'currency'" class="checkout-choice-stack">
            <div class="checkout-flow-head">
              <span>选择币种</span>
              <h1>你要发送哪种资产？</h1>
            </div>
            <div class="checkout-currency-list">
              <button
                v-for="item in currencyOptions"
                :key="item.currency"
                :disabled="isExpired"
                type="button"
                @click="chooseCurrency(item.currency)"
              >
                <span class="checkout-currency-option-main">
                  <img v-if="currencyIcon(item.currency)" :src="currencyIcon(item.currency)" :alt="item.currency" />
                  <strong>{{ currencyLabel(item.currency) }}</strong>
                </span>
                <span>{{ formatAmount(item.amount) }} {{ currencyLabel(item.currency) }}</span>
              </button>
            </div>
          </div>

          <div v-else class="checkout-choice-stack">
            <div class="checkout-flow-head">
              <span>选择网络</span>
              <h1>使用哪个网络支付 {{ currencyLabel(selectedCurrency) }}？</h1>
            </div>
            <div class="checkout-step-back">
              <span class="checkout-currency-text">
                <img v-if="currencyIcon(selectedCurrencyOption?.currency)" :src="currencyIcon(selectedCurrencyOption?.currency)" :alt="selectedCurrencyOption?.currency" />
                <span>{{ formatAmount(selectedCurrencyOption?.amount) }} {{ currencyLabel(selectedCurrencyOption?.currency) }}</span>
              </span>
              <n-button size="small" text type="primary" @click="changeCurrency">更换币种</n-button>
            </div>
            <div class="checkout-network-list">
              <button
                v-for="item in networkOptions"
                :key="item.value"
                :disabled="isExpired"
                type="button"
                @click="chooseNetwork(item)"
              >
                <span class="checkout-network-option-main">
                  <img v-if="networkIcon(item.network)" :src="networkIcon(item.network)" :alt="networkLabel(item.network)" />
                  <strong>{{ networkLabel(item.network) }}</strong>
                </span>
              </button>
            </div>
          </div>
        </template>
      </section>
    </n-layout-content>

    <n-layout-content v-else class="checkout-content" content-class="checkout-page">
      <section class="checkout-receipt checkout-skeleton-card">
        <div class="checkout-skeleton-head">
          <div>
            <span class="skeleton-line skeleton-text"></span>
            <span class="skeleton-line skeleton-title"></span>
          </div>
          <span class="skeleton-line checkout-skeleton-tag"></span>
        </div>
        <div class="checkout-skeleton-amount">
          <span class="skeleton-line skeleton-text"></span>
          <span class="skeleton-line"></span>
        </div>
        <div class="checkout-skeleton-countdown">
          <span class="checkout-skeleton-circle"></span>
        </div>
        <div class="checkout-skeleton-meta">
          <span class="skeleton-line"></span>
          <span class="skeleton-line"></span>
        </div>
      </section>

      <section class="checkout-flow checkout-skeleton-card">
        <div class="checkout-flow-head">
          <span class="skeleton-line skeleton-text"></span>
          <span class="skeleton-line skeleton-title"></span>
        </div>
        <div class="checkout-skeleton-step-back">
          <span class="skeleton-line skeleton-text"></span>
          <span class="skeleton-line skeleton-title"></span>
        </div>
        <div class="checkout-skeleton-network-list">
          <div class="checkout-skeleton-network-option">
            <span class="checkout-skeleton-icon"></span>
            <span class="skeleton-line"></span>
          </div>
          <div class="checkout-skeleton-network-option">
            <span class="checkout-skeleton-icon"></span>
            <span class="skeleton-line"></span>
          </div>
          <div class="checkout-skeleton-network-option">
            <span class="checkout-skeleton-icon"></span>
            <span class="skeleton-line"></span>
          </div>
        </div>
      </section>
    </n-layout-content>

    <n-modal v-model:show="reviewVisible">
      <n-card
        closable
        class="checkout-review-modal"
        title="检查付款信息"
        role="dialog"
        aria-modal="true"
        @close="reviewVisible = false"
      >
        <div class="checkout-review-form">
          <template v-if="!isReviewCredentialStep && currentReviewQuestion">
            <div class="checkout-review-question">
              <strong>{{ currentReviewQuestion.title }}</strong>
              <div class="checkout-review-options">
                <button
                  v-for="option in currentReviewQuestion.options"
                  :key="option"
                  :class="{ 'is-active': reviewAnswers[currentReviewQuestion.id] === option }"
                  type="button"
                  @click="chooseReviewAnswer(currentReviewQuestion.id, option)"
                >
                  {{ option }}
                </button>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-if="reviewFinalRisk" class="checkout-review-help">
              <p>{{ reviewFinalRisk }}</p>
            </div>
            <n-input
              v-model:value="reviewTxid"
              placeholder="交易哈希/TXID/交易编号/转账ID"
            />
            <n-upload
              accept="image/*"
              :custom-request="uploadReviewImage"
              directory-dnd
              :max="1"
              :show-file-list="false"
            >
              <n-upload-dragger>
                <div class="checkout-upload-dragger">
                  <strong>{{ reviewImageName || '上传付款截图' }}</strong>
                  <span>请上传钱包/交易所或支付平台中的付款信息截图。</span>
                </div>
              </n-upload-dragger>
            </n-upload>
          </template>
        </div>
        <template #footer>
          <div class="modal-actions">
            <n-button v-if="reviewStep === 0" @click="reviewVisible = false">取消</n-button>
            <n-button v-else @click="previousReviewStep">上一步</n-button>
            <n-button v-if="!isReviewCredentialStep" :disabled="!canGoNextReviewStep" type="primary" @click="nextReviewStep">下一步</n-button>
            <n-button v-else :disabled="!canSubmitReview" :loading="reviewLoading" type="primary" @click="submitReview">提交审核</n-button>
          </div>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="qrVisible">
      <n-card
        closable
        class="checkout-qr-modal"
        title="收款二维码"
        role="dialog"
        aria-modal="true"
        @close="qrVisible = false"
      >
        <div class="checkout-qr-modal-body">
          <div v-if="payment.address" class="checkout-qr-box checkout-qr-box--modal">
            <n-qr-code :size="260" :value="payment.address" />
          </div>
          <code v-if="payment.address" class="checkout-address-code">
            <strong>{{ paymentAddressParts.prefix }}</strong><span>{{ paymentAddressParts.middle }}</span><strong>{{ paymentAddressParts.suffix }}</strong>
          </code>
        </div>
      </n-card>
    </n-modal>
  </n-layout>
</template>
