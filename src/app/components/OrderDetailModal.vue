<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import * as pay from "@/app/payments";
import { api } from "@/app/api";
import { formatDisplayAmount as formatAmount } from "@/app/utils/amount-format";
import { copyText } from "@/app/utils/clipboard";
import { assetLabel } from "@/shared/payments";

const props = defineProps<{
  orderId?: string | null;
  show: boolean;
}>();

const emit = defineEmits<{
  changed: [];
  deleted: [id: string];
  "update:show": [show: boolean];
}>();

const message = useMessage();
const detail = ref<any>(null);
const action = ref("");
const loading = ref(false);

const visible = computed({
  get: () => props.show,
  set: (show) => emit("update:show", show),
});
const pending = computed(() => detail.value?.order?.status === "pending");
const paid = computed(() => detail.value?.order?.status === "paid");

watch(
  () => [props.show, props.orderId] as const,
  ([show, id]) => {
    if (show && id) void load(id);
    if (!show) detail.value = null;
  },
  { immediate: true },
);

async function load(id = props.orderId) {
  if (!id) return;
  loading.value = true;
  try {
    detail.value = await api.orders.get(id);
  } finally {
    loading.value = false;
  }
}

async function run(name: string, fn: () => Promise<void>) {
  action.value = name;
  try {
    await fn();
  } catch {
    // API layer displays the error.
  } finally {
    action.value = "";
  }
}

async function checkPayment() {
  const id = detail.value?.order?.id;
  if (!id) return;
  await run("check", async () => {
    await api.orders.check(id);
    message.success("检查完成");
    await load(id);
    emit("changed");
  });
}

async function confirmPayment() {
  const id = detail.value?.order?.id;
  if (!id) return;
  await run("confirm", async () => {
    await api.orders.confirm(id);
    message.success("订单已确认付款");
    await load(id);
    emit("changed");
  });
}

async function resendNotify() {
  const id = detail.value?.order?.id;
  if (!id) return;
  await run("notify", async () => {
    await api.orders.resend(id);
    message.success("通知已重新发送");
    await load(id);
  });
}

async function deleteOrder() {
  const id = detail.value?.order?.id;
  if (!id) return;
  await run("delete", async () => {
    await api.orders.remove(id);
    message.success("订单已删除");
    emit("deleted", id);
    visible.value = false;
  });
}

function confirmTimeLabel(order: any) {
  return order.status === "expired" ? "过期时间" : "确认时间";
}

function confirmTimeText(order: any) {
  if (order.status === "expired") return formatTime(order.expireAt);
  return order.paidAt ? formatTime(order.paidAt) : "--";
}

function confirmMethodText(order: any) {
  if (!order?.payment?.tx?.confirmedBy) return "--";
  return order.payment.tx.confirmedBy === "admin" ? "手动确认" : "自动确认";
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    expired: "已超时",
    invalid: "异常",
    paid: "已支付",
    pending: "待支付",
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  const classes: Record<string, string> = {
    expired: "is-muted",
    invalid: "is-error",
    paid: "is-success",
    pending: "is-warning",
  };
  return classes[status] ?? "";
}

function formatTime(value: unknown) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  const date = new Date(ts * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function currencyLabel(currency: unknown) {
  return assetLabel(currency);
}

function paywayLabel(order: any) {
  if (!order.payway) return "未选择";
  return order.paywayName || order.payment?.name || "已删除通道";
}

function paymentTarget(order: any) {
  return order.payment?.address || order.payment?.account || "";
}

function rateText(orderDetail: any) {
  const rate = Number(orderDetail?.rate?.rate);
  if (!Number.isFinite(rate) || rate <= 0) return "未选择收款方式";
  return `1 ${currencyLabel(orderDetail.rate.paymentCurrency)} = ${formatAmount(rate)} ${orderDetail.rate.originalCurrency}`;
}

function txUrl(order: any) {
  return pay.txUrl(order?.payment);
}

function notifyText(status: string) {
  const labels: Record<string, string> = {
    done: "已完成",
    failed: "失败",
    pending: "等待中",
    retry: "重试中",
  };
  return labels[status] ?? status;
}
</script>

<template>
  <n-modal v-model:show="visible">
    <n-card
      closable
      class="order-detail-modal"
      role="dialog"
      aria-modal="true"
      @close="visible = false"
    >
      <template #header>
        <div class="order-detail-title">
          <span>订单详细</span>
          <n-tag v-if="detail?.order" :class="statusClass(detail.order.status)" size="small">
            {{ statusText(detail.order.status) }}
          </n-tag>
        </div>
      </template>
      <n-spin :show="loading">
        <div v-if="detail?.order" class="order-detail-body">
          <div class="order-detail-tools">
            <n-button
              v-if="pending"
              :loading="action === 'check'"
              secondary
              size="small"
              @click="checkPayment"
            >
              <span class="tool-button-content">
                <span class="tool-icon tool-icon-check"></span>
                <span>检查付款</span>
              </span>
            </n-button>
            <n-popconfirm
              v-if="pending"
              negative-text="取消"
              positive-text="确认付款"
              @positive-click="confirmPayment"
            >
              <template #trigger>
                <n-button :loading="action === 'confirm'" secondary size="small" type="warning">
                  <span class="tool-button-content">
                    <span class="tool-icon tool-icon-confirm"></span>
                    <span>确认付款</span>
                  </span>
                </n-button>
              </template>
              将直接认为此订单已支付，并执行相关通知。
            </n-popconfirm>
            <n-button
              v-if="paid"
              :loading="action === 'notify'"
              secondary
              size="small"
              @click="resendNotify"
            >
              <span class="tool-button-content">
                <span class="tool-icon tool-icon-notify"></span>
                <span>重发通知</span>
              </span>
            </n-button>
            <n-button
              :loading="action === 'delete'"
              secondary
              size="small"
              type="error"
              @click="deleteOrder"
            >
              <span class="tool-button-content">
                <span class="tool-icon tool-icon-delete"></span>
                <span>删除订单</span>
              </span>
            </n-button>
          </div>

          <section class="order-detail-section">
            <div class="detail-grid">
              <div class="detail-item">
                <span>订单号</span>
                <div class="detail-copy-row">
                  <strong>{{ detail.order.id }}</strong>
                  <n-button size="small" secondary @click="copyText(detail.order.id, { message })">复制</n-button>
                </div>
              </div>
              <div class="detail-item">
                <span>商户</span>
                <strong>{{ detail.merchant?.name || detail.order.merchantId || '--' }}</strong>
              </div>
              <div class="detail-item detail-item-wide">
                <span>订单信息</span>
                <strong>{{ detail.order.description || '--' }}</strong>
              </div>
              <div class="detail-item">
                <span>创建时间</span>
                <strong>{{ formatTime(detail.order.createdAt) }}</strong>
              </div>
            </div>
          </section>

          <section class="order-detail-section">
            <h3>收款信息</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span>订单金额</span>
                <strong>{{ formatAmount(detail.order.amount) }} {{ currencyLabel(detail.order.currency) }}</strong>
              </div>
              <div class="detail-item">
                <span>应付金额</span>
                <strong>{{ detail.order.payment?.amount ? `${formatAmount(detail.order.payment.amount)} ${currencyLabel(detail.order.payment.currency)}` : '--' }}</strong>
              </div>
              <div class="detail-item">
                <span>汇率</span>
                <strong>{{ rateText(detail) }}</strong>
              </div>
              <div class="detail-item">
                <span>收款通道</span>
                <strong>{{ detail.payway?.name || paywayLabel(detail.order) }}</strong>
              </div>
              <div class="detail-item detail-item-wide">
                <span>收款地址</span>
                <strong>{{ paymentTarget(detail.order) || '--' }}</strong>
              </div>
              <div v-if="paid" class="detail-item detail-item-wide">
                <span>交易哈希</span>
                <a
                  v-if="txUrl(detail.order)"
                  class="detail-link"
                  :href="txUrl(detail.order)"
                  rel="noreferrer"
                  target="_blank"
                >
                  {{ detail.order.payment?.tx?.txid }}
                </a>
                <strong v-else>{{ detail.order.payment?.tx?.txid || '--' }}</strong>
              </div>
              <div v-if="paid" class="detail-item">
                <span>确认方式</span>
                <strong>{{ confirmMethodText(detail.order) }}</strong>
              </div>
              <div v-if="paid" class="detail-item">
                <span>{{ confirmTimeLabel(detail.order) }}</span>
                <strong>{{ confirmTimeText(detail.order) }}</strong>
              </div>
            </div>
          </section>

          <section v-if="detail.order.payment?.review" class="order-detail-section">
            <h3>审核凭证</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span>提交时间</span>
                <strong>{{ formatTime(detail.order.payment.review.submittedAt) }}</strong>
              </div>
              <div class="detail-item">
                <span>状态</span>
                <strong>待审核</strong>
              </div>
              <div class="detail-item detail-item-wide">
                <span>付款确认</span>
                <strong class="detail-review-answer">{{ detail.order.payment.review.answer }}</strong>
              </div>
              <div class="detail-item detail-item-wide">
                <span>付款截图</span>
                <img class="detail-review-image" :src="detail.order.payment.review.image" alt="付款截图" />
              </div>
            </div>
          </section>

          <section class="order-detail-section">
            <h3>通知记录</h3>
            <n-empty v-if="!detail.notify?.length" description="暂无通知记录" />
            <div v-else class="notify-list">
              <div v-for="item in detail.notify" :key="item.id" class="notify-item">
                <strong>{{ notifyText(item.status) }}</strong>
                <span>尝试 {{ item.attempts }} 次 / 下次 {{ formatTime(item.nextRunAt) }}</span>
                <small v-if="item.lastError">{{ item.lastError }}</small>
              </div>
            </div>
          </section>
        </div>
      </n-spin>
    </n-card>
  </n-modal>
</template>
