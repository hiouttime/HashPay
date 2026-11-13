<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { NButton, NCard, NCollapse, NCollapseItem, NEmpty, NFormItem, NInput, NModal, NSwitch, useMessage } from "naive-ui";
import AppIcon from "@/app/components/AppIcon.vue";
import NSegmented from "@/app/components/NSegmented.vue";
import { useI18n } from "@/app/i18n";
import { choices, evmId, networkIcon, networkName, type DriverChoice } from "@/app/payments";
import { api, type Payment } from "@/app/api";
import { ask } from "@/app/utils/telegram";
import { assetName, paymentById, paymentByNetwork, paymentKindOrder, type PaymentKind } from "@/shared/payments";

interface PaymentForm {
  address: string;
  assets: string[];
  data: Record<string, string>;
  driver: string;
  enabled: boolean;
  name: string;
}

const message = useMessage();
const { t } = useI18n();
const saving = ref(false);
const methods = ref<Payment[]>([]);
const dialog = reactive({
  method: null as Payment | null,
  mode: "" as "" | "edit" | "new",
});
const selection = reactive({
  evm: {} as Record<string, string[]>,
  kind: "chain" as PaymentKind,
});
const form = reactive<PaymentForm>(defaultForm());

const isEdit = computed(() => dialog.mode === "edit");
const drivers = computed(() => choices(selection.kind, isEdit.value ? form.driver : ""));
const currentDriver = computed(() => drivers.value.find((driver) => driver.id === form.driver) ?? drivers.value[0]!);
// The EVM choice creates one channel per selected network. Editing always targets one real driver.
const isEvm = computed(() => currentDriver.value.id === evmId);
const dataFields = computed(() => currentDriver.value.data ?? []);
const primaryDataFields = computed(() => dataFields.value.filter((field) => !field.optional));
const advancedDataFields = computed(() => dataFields.value.filter((field) => field.optional));
const selectedNetworks = computed(() => Object.keys(selection.evm));
const kindOptions = computed(() => paymentKindOrder.map((kind) => ({ label: t(`payment.kind.${kind}`), value: kind })));
const allChoices = paymentKindOrder.flatMap((kind) => choices(kind));
const channelStatus = {
  disabled: "common.disabled",
  enabled: "common.enabled",
  error: "payment.channel_error",
} as const;

async function load() {
  methods.value = await api.payments.list();
}

async function save() {
  const error = formError();
  if (error) {
    message.error(error);
    return;
  }

  saving.value = true;
  try {
    const inputs = isEvm.value
      ? selectedNetworks.value.map((network) => payload(paymentByNetwork(network)!.id, network, selection.evm[network]))
      : [payload(currentDriver.value.id, currentDriver.value.network, form.assets)];
    await Promise.all(inputs.map((input) => isEdit.value ? api.payments.update(dialog.method!.id, input) : api.payments.create(input)));
    message.success(t(isEdit.value ? "payment.save_updated" : "payment.save_created"));
    await load();
    closeDialog();
  } finally {
    saving.value = false;
  }
}

function payload(driver: string, network: string, assets: string[]) {
  return {
    address: form.address.trim(),
    assets,
    data: { ...form.data },
    driver,
    // Channels created together from the EVM choice share one name, so the network tells them apart.
    name: selectedNetworks.value.length > 1 ? `${form.name.trim()} · ${networkName(network)}` : form.name.trim(),
    status: isEdit.value && !form.enabled ? "disabled" as const : "enabled" as const,
  };
}

async function remove(id: number) {
  if (!await ask(t("payment.delete_warning"))) return;
  await api.payments.remove(id);
  message.success(t("payment.deleted"));
  await load();
}

function formError() {
  const address = currentDriver.value.address;
  if (!form.name.trim()) return t("payment.validation.name_required");
  if (!form.address.trim()) return t("payment.validation.field_required", { field: t(address.nameKey) });
  if (address.pattern && !address.pattern.test(form.address.trim())) return t("payment.validation.address_invalid", { field: t(address.nameKey) });
  const missing = isEdit.value ? undefined : primaryDataFields.value.find((field) => !form.data[field.id]?.trim());
  if (missing) return t("payment.validation.field_required", { field: t(missing.nameKey) });
  if (!isEvm.value) return form.assets.length ? "" : t("payment.validation.asset_required");
  if (!selectedNetworks.value.length) return t("payment.validation.evm_network_required");
  const empty = selectedNetworks.value.find((network) => !selection.evm[network].length);
  return empty ? t("payment.validation.network_asset_required", { network: networkName(empty) }) : "";
}

function closeDialog() {
  dialog.mode = "";
  dialog.method = null;
}

function add() {
  dialog.mode = "new";
  dialog.method = null;
  Object.assign(form, defaultForm());
  setKind("chain");
}

function edit(method: Payment) {
  dialog.mode = "edit";
  dialog.method = method;
  selection.kind = paymentById(method.driver)!.kind;
  selection.evm = {};
  Object.assign(form, {
    address: method.address,
    assets: [...method.assets],
    data: {},
    driver: method.driver,
    enabled: method.status !== "disabled",
    name: method.name,
  });
}

function setKind(kind: PaymentKind) {
  selection.kind = kind;
  setDriver(drivers.value[0]!);
}

function setDriver(driver: DriverChoice) {
  form.driver = driver.id;
  form.address = "";
  form.assets = [...driver.assets];
  form.data = {};
  selection.evm = driver.id === evmId ? { [driver.network]: [...paymentByNetwork(driver.network)!.assets] } : {};
}

function toggleAsset(asset: string) {
  if (form.assets.includes(asset) && form.assets.length === 1) {
    message.warning(t("payment.validation.asset_required"));
    return;
  }
  form.assets = form.assets.includes(asset) ? form.assets.filter((item) => item !== asset) : [...form.assets, asset];
}

function toggleEvmNetwork(network: string) {
  const next = { ...selection.evm };
  if (!next[network]) {
    selection.evm = { ...next, [network]: [...paymentByNetwork(network)!.assets] };
    return;
  }
  if (selectedNetworks.value.length === 1) {
    message.warning(t("payment.validation.evm_network_required"));
    return;
  }
  delete next[network];
  selection.evm = next;
}

function toggleEvmAsset(network: string, asset: string) {
  const selected = selection.evm[network];
  if (selected.includes(asset) && selected.length === 1) {
    message.warning(t("payment.validation.network_asset_required", { network: networkName(network) }));
    return;
  }
  selection.evm = {
    ...selection.evm,
    [network]: selected.includes(asset) ? selected.filter((item) => item !== asset) : [...selected, asset],
  };
}

function defaultForm(): PaymentForm {
  return {
    address: "",
    assets: [],
    data: {},
    driver: "",
    enabled: true,
    name: "",
  };
}

onMounted(load);
</script>

<template>
<div class="grid">
  <div class="section-title">
    <div>
      <h2>{{ t("payment.channel") }}</h2>
    </div>
    <n-button type="primary" @click="add">{{ t("payment.channel_add") }}</n-button>
  </div>

  <section class="panel grid">
    <n-empty v-if="!methods.length" :description="t('payment.channel_empty')" />
    <div
      v-for="item in methods"
      :key="item.id"
      class="list-card pay-card"
    >
      <div class="pay-card-main">
        <span v-if="networkIcon(item.driver)" class="pay-icon">
          <AppIcon :name="networkIcon(item.driver)" :label="networkName(item.driver)" />
        </span>
        <div class="pay-info">
          <strong>{{ item.name }} <span class="muted">#{{ item.id }}</span></strong>
          <p>
            {{ networkName(item.driver) }} /
            <span class="pay-status" :class="`is-${item.status}`">{{ t(channelStatus[item.status]) }}</span>
          </p>
          <div class="chip-row readonly">
            <span v-for="asset in item.assets" :key="`${item.id}-${asset}`">{{ assetName(asset) }}</span>
          </div>
          <p class="pay-address">{{ item.address || '--' }}</p>
        </div>
      </div>
      <div class="form-actions">
        <n-button size="small" @click="edit(item)">{{ t("common.edit") }}</n-button>
        <n-button size="small" tertiary type="error" @click="remove(item.id)">{{ t("common.delete") }}</n-button>
      </div>
    </div>
  </section>

  <n-modal :show="dialog.mode !== ''" @update:show="!$event && closeDialog()">
    <n-card
      :title="t(isEdit ? 'payment.channel_edit' : 'payment.channel_new')"
      closable
      class="payment-modal-card"
      role="dialog"
      aria-modal="true"
      @close="closeDialog"
    >
      <div class="payment-modal-body grid">
        <div class="form-section grid">
          <h3>{{ t("payment.channel_name") }}</h3>
          <n-input v-model:value="form.name" :placeholder="t('payment.channel_name_placeholder')" />
          <div v-if="isEdit" class="switch-line">
            <span>{{ t("payment.channel_enabled") }}</span>
            <n-switch v-model:value="form.enabled" />
          </div>
        </div>

        <div v-if="isEdit" class="form-section">
          <h3>{{ t("payment.channel") }}</h3>
          <div class="readonly-channel">
            <span v-if="currentDriver.icon" class="pay-icon">
              <AppIcon :name="currentDriver.icon" :label="networkName(currentDriver.network)" />
            </span>
            <div>
              <strong>{{ networkName(currentDriver.network) }}</strong>
              <p>{{ t(`payment.kind.${selection.kind}`) }}</p>
            </div>
          </div>
        </div>

        <div v-if="!isEdit" class="form-section grid">
          <h3>{{ t("common.type") }}</h3>
          <NSegmented :value="selection.kind" :options="kindOptions" @update:value="setKind($event as PaymentKind)" />
        </div>

        <div v-if="!isEdit" class="form-section">
          <h3>{{ t("payment.channel_network") }}</h3>
          <n-empty v-if="!drivers.length" :description="t(selection.kind === 'wallet' ? 'payment.network_empty_wallet' : 'payment.network_empty_kind')" />
          <div v-show="drivers.length" class="network-choice-grid">
            <button
              v-for="driver in allChoices"
              v-show="driver.kind === selection.kind"
              :key="driver.id"
              :class="{ 'is-active': form.driver === driver.id }"
              type="button"
              @click="setDriver(driver)"
            >
              <span class="choice-driver-title">
                <AppIcon v-if="driver.icon" class="choice-driver-icon" :name="driver.icon" :label="networkName(driver.network)" />
                <strong>{{ networkName(driver.network) }}</strong>
              </span>
            </button>
          </div>
          <div v-if="isEvm" class="grid">
            <div class="chip-row">
              <button
                v-for="item in currentDriver.networks"
                :key="item"
                :class="{ 'is-active': selectedNetworks.includes(item) }"
                type="button"
                @click="toggleEvmNetwork(item)"
              >
                <AppIcon v-if="networkIcon(item)" class="chip-icon" :name="networkIcon(item)" :label="networkName(item)" />
                {{ networkName(item) }}
              </button>
            </div>
            <p class="muted">{{ t("payment.evm_hint") }}</p>
          </div>
        </div>

        <div class="form-section grid">
          <h3>{{ t("payment.currency") }}</h3>
          <template v-if="isEvm">
            <div v-for="item in selectedNetworks" :key="item" class="form-field-block">
              <strong>{{ networkName(item) }} {{ t("payment.currency") }}</strong>
              <div class="chip-row">
                <button
                  v-for="asset in paymentByNetwork(item)!.assets"
                  :key="`${item}-${asset}`"
                  :class="{ 'is-active': selection.evm[item].includes(asset) }"
                  type="button"
                  @click="toggleEvmAsset(item, asset)"
                >
                  {{ assetName(asset) }}
                </button>
              </div>
            </div>
          </template>
          <div v-else class="chip-row">
            <button v-for="asset in currentDriver.assets" :key="asset" :class="{ 'is-active': form.assets.includes(asset) }" type="button" @click="toggleAsset(asset)">
              {{ assetName(asset) }}
            </button>
          </div>
        </div>

        <div class="form-section grid">
          <h3>{{ t("payment.channel_info") }}</h3>
          <div class="form-field-block">
            <n-form-item :show-label="false" class="field-form-item">
              <n-input v-model:value="form.address" :placeholder="t(currentDriver.address.nameKey)" />
            </n-form-item>
            <small v-if="currentDriver.address.helpKey" class="field-help">{{ t(currentDriver.address.helpKey) }}</small>
          </div>
          <div v-for="field in primaryDataFields" :key="field.id" class="form-field-block">
            <n-form-item :show-label="false" class="field-form-item">
              <n-input
                v-model:value="form.data[field.id]"
                type="password"
                show-password-on="click"
                :placeholder="t(field.nameKey)"
              />
            </n-form-item>
            <small v-if="field.helpKey" class="field-help" v-html="t(field.helpKey)"></small>
          </div>
          <n-collapse v-if="advancedDataFields.length" class="advanced-fields">
            <n-collapse-item :title="t('payment.advanced')" name="advanced">
              <div v-for="field in advancedDataFields" :key="field.id" class="form-field-block">
                <n-form-item :show-label="false" class="field-form-item">
                  <n-input
                    v-model:value="form.data[field.id]"
                    type="password"
                    show-password-on="click"
                    :placeholder="t(field.nameKey)"
                  />
                </n-form-item>
                <small v-if="field.helpKey" class="field-help" v-html="t(field.helpKey)"></small>
              </div>
            </n-collapse-item>
          </n-collapse>
        </div>
      </div>

      <template #footer>
        <div class="modal-actions">
          <n-button secondary @click="closeDialog">{{ t("common.cancel") }}</n-button>
          <n-button type="primary" :loading="saving" @click="save">{{ t(isEdit ? "common.save" : "common.add") }}</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</div>
</template>
