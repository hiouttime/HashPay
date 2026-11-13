<script setup lang="ts">
import { NButton } from "naive-ui";
import { computed, ref } from "vue";
import AppIcon from "@/app/components/AppIcon.vue";
import NSegmented from "@/app/components/NSegmented.vue";
import { networkIcon, networkName, type CheckoutOption } from "@/app/payments";
import { formatAmount } from "@/app/utils/format";
import { useI18n } from "@/app/i18n";
import { assetName, key, paymentAssetIcon, paymentKind, paymentKindOrder, type PaymentKind } from "@/shared/payments";

const props = defineProps<{
  disabled: boolean;
  initialAsset?: string;
  initialNetwork?: string;
  options: CheckoutOption[];
}>();

const emit = defineEmits<{
  select: [option: CheckoutOption];
}>();

const { t } = useI18n();
const asset = ref(key(props.initialAsset));
const kind = ref<PaymentKind>(props.initialNetwork ? paymentKind(props.initialNetwork) : "chain");
const assets = computed(() => {
  const map = new Map<string, CheckoutOption[]>();
  for (const option of props.options) {
    const list = map.get(option.asset) ?? [];
    list.push(option);
    map.set(option.asset, list);
  }
  return Array.from(map.entries()).map(([name, options]) => ({
    amount: options[0]?.amount,
    asset: name,
    networks: options,
  }));
});
const networks = computed(() => props.options.filter((option) => option.asset === asset.value));
const kinds = computed(() => paymentKindOrder.filter((item) => networks.value.some((option) => paymentKind(option.network) === item)));
const kindTabs = computed(() => kinds.value.map((item) => ({
  label: t(`payment.kind.${item}`),
  tag: item === "chain" ? undefined : t("checkout.zero_fee"),
  value: item,
})));
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
          <AppIcon v-if="paymentAssetIcon(item.asset)" :name="paymentAssetIcon(item.asset)" :label="assetName(item.asset)" />
          <strong>{{ assetName(item.asset) }}</strong>
        </span>
        <span>{{ formatAmount(item.amount) }} {{ assetName(item.asset) }}</span>
      </button>
    </div>
  </div>

  <div v-else class="checkout-choice-stack">
    <div class="checkout-flow-head">
      <span>{{ t('checkout.select_network') }}</span>
      <h1>{{ t('checkout.use_network', { asset: assetName(asset) }) }}</h1>
    </div>
    <div class="checkout-step-back">
      <span class="checkout-currency-text">
        <AppIcon v-if="paymentAssetIcon(selectedAsset?.asset)" :name="paymentAssetIcon(selectedAsset?.asset)" :label="assetName(selectedAsset?.asset)" />
        <span>{{ formatAmount(selectedAsset?.amount) }} {{ assetName(selectedAsset?.asset) }}</span>
      </span>
      <n-button size="small" text type="primary" @click="asset = ''">{{ t('checkout.change_asset') }}</n-button>
    </div>
    <NSegmented :value="kind" :options="kindTabs" @update:value="kind = $event as PaymentKind" />
    <div class="checkout-network-list">
      <button
        v-for="item in networks"
        v-show="paymentKind(item.network) === kind"
        :key="item.value"
        :disabled="disabled"
        type="button"
        @click="emit('select', item)"
      >
        <span class="checkout-network-option-main">
          <AppIcon v-if="networkIcon(item.network)" :name="networkIcon(item.network)" :label="networkName(item.network)" />
          <strong>{{ networkName(item.network) }}</strong>
        </span>
      </button>
    </div>
  </div>
</template>
