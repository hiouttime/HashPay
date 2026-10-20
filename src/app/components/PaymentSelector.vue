<script setup lang="ts">
import { computed, ref } from "vue";
import AppIcon from "@/app/components/AppIcon.vue";
import NSegmented from "@/app/components/NSegmented.vue";
import * as pay from "@/app/payments";
import { formatDisplayAmount as formatAmount } from "@/app/utils/format";
import { useI18n } from "@/app/i18n";
import { paymentKind, paymentKindOrder, type PaymentKind } from "@/shared/payments";

const props = defineProps<{
  disabled: boolean;
  options: pay.CheckoutOption[];
}>();

const emit = defineEmits<{
  select: [option: pay.CheckoutOption];
}>();

const { t } = useI18n();
const asset = ref("");
const kind = ref<PaymentKind>("chain");
const assets = computed(() => {
  const map = new Map<string, pay.CheckoutOption[]>();
  for (const option of props.options) {
    const list = map.get(option.asset) ?? [];
    list.push(option);
    map.set(option.asset, list);
  }
  return Array.from(map.entries()).map(([key, options]) => ({
    amount: options[0]?.amount,
    asset: key,
    networks: options,
  }));
});
const kinds = computed(() => paymentKindOrder.filter((item) => props.options.some((option) => option.asset === asset.value && paymentKind(option.network) === item)));
const kindTabs = computed(() => kinds.value.map((item) => ({
  label: t(`payment.kind.${item}`),
  tag: item === "chain" ? undefined : t("checkout.zero_fee"),
  value: item,
})));
const networks = computed(() => props.options.filter((item) => item.asset === asset.value && paymentKind(item.network) === kind.value));
const selectedAsset = computed(() => assets.value.find((item) => item.asset === asset.value));

function chooseAsset(next: string) {
  asset.value = next;
  kind.value = kinds.value[0]!;
}
</script>

<template>
  <div v-if="!asset" class="checkout-choice-stack">
    <div class="checkout-flow-head">
      <span>{{ t('checkout.select_asset') }}</span>
      <h1>{{ t('checkout.select_asset_title') }}</h1>
    </div>
    <div class="checkout-currency-list">
      <button
        v-for="item in assets"
        :key="item.asset"
        :disabled="disabled"
        type="button"
        @click="chooseAsset(item.asset)"
      >
        <span class="checkout-currency-option-main">
          <AppIcon v-if="pay.assetIcon(item.asset)" :name="pay.assetIcon(item.asset)" :label="pay.assetName(item.asset)" />
          <strong>{{ pay.assetName(item.asset) }}</strong>
        </span>
        <span>{{ formatAmount(item.amount) }} {{ pay.assetName(item.asset) }}</span>
      </button>
    </div>
  </div>

  <div v-else class="checkout-choice-stack">
    <div class="checkout-flow-head">
      <span>{{ t('checkout.select_network') }}</span>
      <h1>{{ t('checkout.use_network', { asset: pay.assetName(asset) }) }}</h1>
    </div>
    <div class="checkout-step-back">
      <span class="checkout-currency-text">
        <AppIcon v-if="pay.assetIcon(selectedAsset?.asset)" :name="pay.assetIcon(selectedAsset?.asset)" :label="pay.assetName(selectedAsset?.asset)" />
        <span>{{ formatAmount(selectedAsset?.amount) }} {{ pay.assetName(selectedAsset?.asset) }}</span>
      </span>
      <n-button size="small" text type="primary" @click="asset = ''">{{ t('checkout.change_asset') }}</n-button>
    </div>
    <NSegmented :value="kind" :options="kindTabs" @update:value="kind = $event as PaymentKind" />
    <div class="checkout-network-list">
      <button
        v-for="item in networks"
        :key="item.value"
        :disabled="disabled"
        type="button"
        @click="emit('select', item)"
      >
        <span class="checkout-network-option-main">
          <AppIcon v-if="pay.networkIcon(item.network)" :name="pay.networkIcon(item.network)" :label="pay.networkName(item.network)" />
          <strong>{{ pay.networkName(item.network) }}</strong>
        </span>
      </button>
    </div>
  </div>
</template>
