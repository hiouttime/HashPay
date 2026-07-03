<script setup lang="ts">
import { computed, ref } from "vue";
import { useMessage } from "naive-ui";
import AppIcon from "@/app/components/AppIcon.vue";
import * as pay from "@/app/payments";
import { formatDisplayAmount as formatAmount } from "@/app/utils/format";
import { copyText } from "@/app/utils/clipboard";
import { useI18n } from "@/app/i18n";

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
const { t } = useI18n();
const address = computed(() => splitAddress(props.payment.address));

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
      <span>{{ t('common.network') }}</span>
      <strong class="checkout-network-title">
        <AppIcon v-if="pay.networkIcon(payment.network)" :name="pay.networkIcon(payment.network)" :label="pay.networkName(payment.network)" />
        <span>{{ payment.networkName || pay.networkName(payment.network) }}</span>
      </strong>
    </div>
    <n-button size="small" text type="primary" @click="emit('change')">{{ t('checkout.change') }}</n-button>
  </div>

  <div v-if="payment.address" class="checkout-copy-field checkout-copy-field--address">
      <div class="checkout-copy-head">
        <span>{{ t('checkout.address') }}</span>
        <div class="checkout-copy-actions">
          <n-button size="small" text type="primary" @click="copyText(payment.address, { message })">{{ t('common.copy') }}</n-button>
          <n-button class="checkout-mobile-qr-button" size="small" secondary type="primary" @click="qrVisible = true">{{ t('checkout.show_qr') }}</n-button>
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
  </div>

  <div class="checkout-due-amount">
    <div>
      <span>{{ t('checkout.amount_due') }}</span>
      <strong class="checkout-currency-title">
        <AppIcon v-if="pay.assetIcon(payment.currency)" :name="pay.assetIcon(payment.currency)" :label="pay.assetName(payment.currency)" />
        <span>{{ formatAmount(payment.amount) }} {{ payment.currencyName || pay.assetName(payment.currency) }}</span>
      </strong>
      <small>{{ t('checkout.amount_help') }}</small>
    </div>
    <n-button size="small" secondary type="primary" @click="copyText(formatAmount(payment.amount), { message })">{{ t('checkout.copy_amount') }}</n-button>
  </div>

  <div class="checkout-warning">
    <strong>{{ pay.paymentInstruction(payment) }}</strong>
    <span>{{ t('checkout.network_warning') }}</span>
  </div>

  <n-button
    v-if="showReview"
    block
    secondary
    type="warning"
    @click="emit('review')"
  >
    {{ t('checkout.review_button') }}
  </n-button>

  <n-modal v-model:show="qrVisible">
    <n-card
      closable
      class="checkout-qr-modal"
      :title="t('checkout.qr')"
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
