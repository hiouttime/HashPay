<script setup lang="ts">
import { computed, ref } from "vue";
import { useMessage } from "naive-ui";
import AppIcon from "@/app/components/AppIcon.vue";
import * as pay from "@/app/payments";
import { formatDisplayAmount as formatAmount } from "@/app/utils/amount-format";
import { copyText } from "@/app/utils/clipboard";

const props = defineProps<{
  payment: any;
  showReview: boolean;
}>();

const emit = defineEmits<{
  change: [];
  review: [];
}>();

const message = useMessage();
const qrVisible = ref(false);
const target = computed(() => props.payment.address || props.payment.account || "");
const address = computed(() => splitAddress(target.value));

function splitAddress(value: unknown) {
  const text = String(value || "");
  if (text.length <= 10) return { middle: "", prefix: text, suffix: "" };
  return {
    middle: text.slice(5, -5),
    prefix: text.slice(0, 5),
    suffix: text.slice(-5),
  };
}
</script>

<template>
  <div class="checkout-pay-method">
    <div>
      <span>收款网络</span>
      <strong class="checkout-network-title">
        <AppIcon v-if="pay.networkIcon(payment.network)" :name="pay.networkIcon(payment.network)" :label="pay.networkName(payment.network)" />
        <span>{{ payment.networkName || pay.networkName(payment.network) }}</span>
      </strong>
    </div>
    <n-button size="small" text type="primary" @click="emit('change')">更换</n-button>
  </div>

  <div v-if="target" class="checkout-copy-field" :class="{ 'checkout-copy-field--address': payment.address }">
    <template v-if="payment.address">
      <div class="checkout-copy-head">
        <span>收款地址</span>
        <div class="checkout-copy-actions">
          <n-button size="small" text type="primary" @click="copyText(target, { message })">复制</n-button>
          <n-button class="checkout-mobile-qr-button" size="small" secondary type="primary" @click="qrVisible = true">显示二维码</n-button>
        </div>
      </div>
      <div class="checkout-address-qr-inline">
        <div class="checkout-qr-box">
          <n-qr-code :size="168" :value="payment.address" />
        </div>
      </div>
      <code class="checkout-address-code">
        <strong>{{ address.prefix }}</strong><span>{{ address.middle }}</span><strong>{{ address.suffix }}</strong>
      </code>
    </template>
    <template v-else>
      <span>收款账户</span>
      <code>{{ target }}</code>
      <n-button size="small" text type="primary" @click="copyText(target, { message })">复制</n-button>
    </template>
  </div>

  <div class="checkout-due-amount">
    <div>
      <span>应付金额</span>
      <strong class="checkout-currency-title">
        <AppIcon v-if="pay.assetIcon(payment.currency)" :name="pay.assetIcon(payment.currency)" :label="pay.assetName(payment.currency)" />
        <span>{{ formatAmount(payment.amount) }} {{ payment.currencyName || pay.assetName(payment.currency) }}</span>
      </strong>
      <small>请确保到账金额一致，部分平台可能存在手续费。</small>
    </div>
    <n-button size="small" secondary type="primary" @click="copyText(formatAmount(payment.amount), { message })">复制金额</n-button>
  </div>

  <div class="checkout-warning">
    <strong>{{ pay.paymentInstruction(payment) }}</strong>
    <span>网络或币种不符将无法确认充值，且可能会丢失资金。</span>
  </div>

  <n-button
    v-if="showReview"
    block
    secondary
    type="warning"
    @click="emit('review')"
  >
    已付款，仍未到账
  </n-button>

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
          <strong>{{ address.prefix }}</strong><span>{{ address.middle }}</span><strong>{{ address.suffix }}</strong>
        </code>
      </div>
    </n-card>
  </n-modal>
</template>
