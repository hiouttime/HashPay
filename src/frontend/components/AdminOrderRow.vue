<script setup lang="ts">
const props = withDefaults(defineProps<{
  compact?: boolean;
  order: Record<string, any>;
  selectable?: boolean;
  selected?: boolean;
}>(), {
  compact: false,
  selectable: false,
  selected: false,
});

const emit = defineEmits<{
  open: [id: string];
  select: [checked: boolean];
}>();

function shortText(value: unknown, start = 12, end = 8) {
  const text = String(value || "");
  return text.length > start + end + 3 ? `${text.slice(0, start)}...${text.slice(-end)}` : text;
}

function orderIdText(id: string) {
  return /^[0-9A-Za-z]{12,24}$/.test(id) ? id : shortText(id, 8, 6);
}

function orderDescription(order: Record<string, any>) {
  return order.description || order.merchant_order_no || "-";
}

function orderStatusText(status: string) {
  const labels: Record<string, string> = {
    expired: "已超时",
    invalid: "异常",
    paid: "已支付",
    pending: "待支付",
  };
  return labels[status] ?? status;
}

function orderStatusClass(status: string) {
  const classes: Record<string, string> = {
    expired: "is-muted",
    invalid: "is-error",
    paid: "is-success",
    pending: "is-warning",
  };
  return classes[status] ?? "";
}

function formatOrderAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return ceilDisplayAmount(amount).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function currencyLabel(currency: unknown) {
  const value = String(currency || "").toUpperCase();
  return value === "GRAM" ? "Gram (ex TON)" : value;
}

function ceilDisplayAmount(amount: number) {
  return Math.ceil((amount - Number.EPSILON) * 100) / 100;
}

function formatOrderTime(value: unknown) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  const date = new Date(ts * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function orderPaywayLabel(order: Record<string, any>) {
  if (!order.payway) return "未选择";
  return order.payway_name || order.payment?.name || "已删除通道";
}

function orderPaymentTarget(order: Record<string, any>) {
  return order.payment?.address || order.payment?.account || order.payment?.memo || "";
}
</script>

<template>
  <div class="order-row" :class="{ 'order-row--plain': !selectable, 'order-row--compact': compact }">
    <div v-if="selectable" class="order-select-cell">
      <n-checkbox :checked="selected" @update:checked="(checked: boolean) => emit('select', checked)" />
    </div>
    <div class="order-cell order-id-cell">
      <button class="order-id-button" type="button" :title="props.order.id" @click="emit('open', props.order.id)">
        {{ orderIdText(props.order.id) }}
      </button>
      <span>{{ orderDescription(props.order) }}</span>
    </div>
    <div class="order-cell">
      <span class="order-status" :class="orderStatusClass(props.order.status)">{{ orderStatusText(props.order.status) }}</span>
    </div>
    <div class="order-cell order-amount-cell">
      <strong>{{ formatOrderAmount(props.order.amount) }} {{ currencyLabel(props.order.currency) }}</strong>
      <span v-if="props.order.payment?.amount">{{ formatOrderAmount(props.order.payment.amount) }} {{ currencyLabel(props.order.payment.currency) }}</span>
    </div>
    <div class="order-cell order-payment-cell">
      <strong class="order-payway-title">
        <span v-if="props.order.payway" class="order-payway-id">#{{ props.order.payway }}</span>
        <span>{{ orderPaywayLabel(props.order) }}</span>
      </strong>
      <span :title="orderPaymentTarget(props.order)">{{ shortText(orderPaymentTarget(props.order), 14, 8) || '-' }}</span>
    </div>
    <div class="order-cell order-time-cell">
      <span>{{ formatOrderTime(props.order.created_at) }}</span>
    </div>
  </div>
</template>
