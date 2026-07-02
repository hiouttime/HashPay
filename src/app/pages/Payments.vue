<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useMessage } from "naive-ui";
import AppIcon from "@/app/components/AppIcon.vue";
import * as payment from "@/app/payments";
import { api, type PaymentMethod, type PaymentMethodInput } from "@/app/api";

interface PaymentForm {
  address: string;
  assets: string[];
  credentials: Record<string, string>;
  driver: string;
  enabled: boolean;
  name: string;
}

const message = useMessage();
const saving = ref(false);
const methods = ref<PaymentMethod[]>([]);
const dialog = reactive({
  method: null as PaymentMethod | null,
  mode: "" as "" | "edit" | "new",
});
const selection = reactive({
  evm: {} as Record<string, string[]>,
  kind: "chain" as payment.Kind,
});
const form = reactive<PaymentForm>(defaultForm());

const isEdit = computed(() => dialog.mode === "edit");
const dialogOpen = computed(() => dialog.mode !== "" && payment.drivers.length > 0);
const drivers = computed(() => payment.choices(payment.drivers, selection.kind, isEdit.value ? form.driver : ""));
const currentDriver = computed(() => drivers.value.find((driver) => driver.id === form.driver) ?? drivers.value[0]!);
const editableFields = computed(() => {
  const driver = payment.isEvm(currentDriver.value) ? payment.evmDriver(payment.drivers, payment.evmIconNetwork) : currentDriver.value;
  return [payment.fieldFor(driver)];
});
const selectedAssets = computed(() => form.assets);
const selectedNetwork = computed(() => payment.driverNetwork(currentDriver.value));
const availableAssets = computed(() => payment.assetsFor(currentDriver.value, selectedNetwork.value));
const selectedNetworks = computed(() => Object.keys(selection.evm));

async function load() {
  methods.value = await api.payments.list();
}

async function save() {
  if (!validate()) return;

  saving.value = true;
  try {
    if (!isEdit.value && payment.isEvm(currentDriver.value.id)) {
      await Promise.all(selectedNetworks.value.map((network) => api.payments.create(payload(payment.evmDriver(payment.drivers, network).id, network, selection.evm[network]))));
    } else if (isEdit.value) {
      await api.payments.update(dialog.method!.id, payload(currentDriver.value.id, selectedNetwork.value, selectedAssets.value));
    } else {
      await api.payments.create(payload(currentDriver.value.id, selectedNetwork.value, selectedAssets.value));
    }
    message.success(isEdit.value ? "支付方式已保存" : "支付方式已新增");
    await load();
    closeDialog();
  } finally {
    saving.value = false;
  }
}

function payload(driverId: string, network: string, assets: string[]): PaymentMethodInput {
  return {
    address: form.address.trim(),
    assets,
    credentials: { ...form.credentials },
    driver: driverId,
    name: selectedNetworks.value.length > 1 && payment.isEvmDriver(payment.drivers, driverId) ? `${form.name.trim()} · ${networkName(network)}` : form.name.trim(),
    status: isEdit.value && !form.enabled ? "disabled" : "enabled",
  };
}

async function remove(id: number) {
  await api.payments.remove(id);
  message.success("支付方式已删除");
  await load();
}

function validate() {
  if (!form.name.trim()) {
    message.error("请填写通道名称");
    return false;
  }

  const missing = editableFields.value.find((field) => field.required && !form.address.trim());
  if (missing) {
    message.error(`请填写 ${missing.label}`);
    return false;
  }

  const addressError = payment.addressError(currentDriver.value, form.address.trim());
  if (addressError) {
    message.error(addressError);
    return false;
  }

  if (!isEdit.value && payment.isEvm(currentDriver.value.id)) {
    if (!selectedNetworks.value.length) {
      message.error("请至少选择一个 EVM 网络");
      return false;
    }
    for (const network of selectedNetworks.value) {
      if (!selection.evm[network].length) {
        message.error(`请至少选择 ${networkName(network)} 的一个币种`);
        return false;
      }
    }
    return true;
  }

  if (!selectedAssets.value.length) {
    message.error("请至少选择一个币种");
    return false;
  }
  return true;
}

function resetForm() {
  selection.kind = "chain";
  selection.evm = {};
  Object.assign(form, defaultForm());
  const first = payment.drivers.find((driver) => driver.kind === selection.kind) ?? payment.drivers[0];
  if (first) setDriver(first.id);
}

function fillForm() {
  if (dialog.mode === "new") {
    resetForm();
    return;
  }

  const method = dialog.method!;
  selection.kind = payment.kindOf(payment.drivers, method.driver);
  selection.evm = payment.isEvmDriver(payment.drivers, method.driver) ? { [methodDriver(method)!.network]: method.assets } : {};
  Object.assign(form, {
    address: method.address,
    assets: [...method.assets],
    credentials: { ...method.credentials },
    driver: method.driver,
    enabled: method.status !== "disabled",
    name: method.name,
  });
}

function closeDialog() {
  dialog.mode = "";
  dialog.method = null;
}

function add() {
  dialog.mode = "new";
  dialog.method = null;
  fillForm();
}

function edit(method: PaymentMethod) {
  dialog.mode = "edit";
  dialog.method = method;
  fillForm();
}

function setKind(kind: payment.Kind) {
  selection.kind = kind;
  const driver = payment.drivers.find((item) => item.kind === kind);
  if (driver) setDriver(driver.id);
}

function setDriver(driverId: string) {
  const driver = drivers.value.find((item) => item.id === driverId)!;
  const network = payment.driverNetwork(driver);
  form.driver = driver.id;
  form.address = "";
  form.assets = [...driver.assets];
  form.credentials = {};
  selection.evm = payment.isEvm(driver.id) ? { [network]: [...payment.assetsFor(driver, network)] } : {};
}

function toggleAsset(asset: string) {
  if (selectedAssets.value.includes(asset) && selectedAssets.value.length === 1) {
    message.warning("至少需要一个币种");
    return;
  }
  form.assets = selectedAssets.value.includes(asset)
    ? selectedAssets.value.filter((item) => item !== asset)
    : [...selectedAssets.value, asset];
}

function toggleEvmNetwork(network: string) {
  const next = { ...selection.evm };
  if (next[network]) {
    if (Object.keys(next).length === 1) {
      message.warning("至少需要一个 EVM 网络");
      return;
    }
    delete next[network];
  } else {
    next[network] = [...payment.assetsFor(currentDriver.value, network)];
  }
  selection.evm = next;
}

function toggleEvmAsset(network: string, asset: string) {
  const selected = selection.evm[network];
  if (selected.includes(asset) && selected.length === 1) {
    message.warning(`至少需要一个${networkName(network)}币种`);
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
    credentials: {},
    driver: "",
    enabled: true,
    name: "",
  };
}

function driverByNetwork(network: string) {
  return payment.drivers.find((driver) => driver.network === network);
}

function methodDriver(method: PaymentMethod) {
  return payment.drivers.find((driver) => driver.id === method.driver);
}

function networkName(network: string) {
  return driverByNetwork(network)?.name ?? network;
}

function networkIcon(network: string) {
  return driverByNetwork(network)?.icon ?? "";
}

function driverIcon(driver: payment.DriverChoice, network = payment.driverNetwork(driver)) {
  return payment.isEvm(driver) ? networkIcon(payment.evmIconNetwork) : driver.icon;
}

function driverIconLabel(driver: payment.DriverChoice, network = payment.driverNetwork(driver)) {
  return payment.isEvm(driver) ? networkName(payment.evmIconNetwork) : driver.name || network;
}

onMounted(load);
</script>

<template>
<div class="grid">
  <div class="section-title">
    <div>
      <h2>收款通道</h2>
    </div>
    <n-button type="primary" :disabled="!payment.drivers.length" @click="add">添加收款通道</n-button>
  </div>

  <section class="panel grid">
    <n-empty v-if="!methods.length" description="暂无收款通道" />
    <div
      v-for="item in methods"
      :key="item.id"
      class="list-card pay-card"
    >
      <div class="pay-card-main">
        <span v-if="methodDriver(item)?.icon" class="pay-icon">
          <AppIcon :name="methodDriver(item)!.icon" :label="methodDriver(item)!.name" />
        </span>
        <div>
          <strong>{{ item.name }} <span class="muted">#{{ item.id }}</span></strong>
          <p>{{ methodDriver(item)?.name || item.driver }} / {{ item.status === 'disabled' ? '已禁用' : item.status === 'error' ? '检查异常' : '已启用' }}</p>
          <div class="chip-row readonly">
            <span v-for="asset in item.assets" :key="`${item.id}-${asset}`">{{ payment.assetName(asset) }}</span>
          </div>
          <p>{{ item.address || '--' }}</p>
        </div>
      </div>
      <div class="form-actions">
        <n-button size="small" @click="edit(item)">编辑</n-button>
        <n-popconfirm @positive-click="remove(item.id)">
          <template #trigger>
            <n-button size="small" tertiary type="error">删除</n-button>
          </template>
          删除后，可能影响未付款的订单，并且历史订单可能会出现信息异常的问题。
        </n-popconfirm>
      </div>
    </div>
  </section>

  <n-modal :show="dialogOpen" @update:show="!$event && closeDialog()">
    <n-card
      :title="isEdit ? '编辑收款通道' : '新增收款通道'"
      closable
      class="payment-modal-card"
      role="dialog"
      aria-modal="true"
      @close="closeDialog"
    >
      <div class="payment-modal-body grid">
        <div class="form-section grid">
          <h3>通道名称</h3>
          <n-input v-model:value="form.name" placeholder="用于识别此收款通道" />
          <div v-if="isEdit" class="switch-line">
            <span>是否启用</span>
            <n-switch v-model:value="form.enabled" />
          </div>
        </div>

        <div v-if="isEdit" class="form-section">
          <h3>通道</h3>
          <div class="readonly-channel">
            <span v-if="currentDriver.icon" class="pay-icon">
              <AppIcon :name="currentDriver.icon" :label="currentDriver.name" />
            </span>
            <div>
              <strong>{{ currentDriver.name }}</strong>
              <p>{{ payment.kinds.find((item) => item.value === selection.kind)!.label }}</p>
            </div>
          </div>
        </div>

        <div v-if="!isEdit" class="form-section grid">
          <h3>类型</h3>
          <n-radio-group :value="selection.kind" size="small" @update:value="setKind">
            <n-radio-button v-for="item in payment.kinds" :key="item.value" :value="item.value">
              {{ item.label }}
            </n-radio-button>
          </n-radio-group>
        </div>

        <div v-if="!isEdit" class="form-section">
          <h3>收款网络/平台</h3>
          <n-empty v-if="!drivers.length" :description="selection.kind === 'wallet' ? '当前还没有第三方钱包驱动。' : '当前类型下没有可用驱动。'" />
          <div v-else class="network-choice-grid">
            <button
              v-for="driver in drivers"
              :key="driver.id"
              :class="{ 'is-active': form.driver === driver.id }"
              type="button"
              @click="setDriver(driver.id)"
            >
              <span class="choice-driver-title">
                <AppIcon
                  v-if="driverIcon(driver, payment.choiceNetwork(driver))"
                  class="choice-driver-icon"
                  :name="driverIcon(driver, payment.choiceNetwork(driver))"
                  :label="driverIconLabel(driver, payment.choiceNetwork(driver))"
                />
                <strong>{{ driver.name }}</strong>
              </span>
            </button>
          </div>
          <div v-if="payment.isEvm(currentDriver)" class="grid">
            <div class="chip-row">
              <button
                v-for="item in payment.driverNetworks(currentDriver)"
                :key="item"
                :class="{ 'is-active': selectedNetworks.includes(item) }"
                type="button"
                @click="toggleEvmNetwork(item)"
              >
                <AppIcon v-if="networkIcon(item)" class="chip-icon" :name="networkIcon(item)" :label="networkName(item)" />
                {{ networkName(item) }}
              </button>
            </div>
            <p class="muted">一个地址支持接收多个EVM网络的资产，如需单独指定地址，需单独新增。</p>
          </div>
        </div>

        <div class="form-section grid">
          <h3>币种</h3>
          <template v-if="!isEdit && payment.isEvm(currentDriver)">
            <div v-for="item in selectedNetworks" :key="item" class="form-field-block">
              <strong>{{ networkName(item) }} 币种</strong>
              <div class="chip-row">
                <button
                  v-for="asset in payment.assetsFor(currentDriver, item)"
                  :key="`${item}-${asset}`"
                  :class="{ 'is-active': selection.evm[item].includes(asset) }"
                  type="button"
                  @click="toggleEvmAsset(item, asset)"
                >
                  {{ payment.assetName(asset) }}
                </button>
              </div>
            </div>
          </template>
          <div v-else class="chip-row">
            <button v-for="asset in availableAssets" :key="asset" :class="{ 'is-active': selectedAssets.includes(asset) }" type="button" @click="toggleAsset(asset)">
              {{ payment.assetName(asset) }}
            </button>
          </div>
        </div>

        <div class="form-section grid">
          <h3>收款信息</h3>
          <template v-for="field in editableFields" :key="field.key">
            <div class="form-field-block">
              <n-form-item :show-label="false" class="field-form-item">
                <n-input v-model:value="form.address" :placeholder="field.label" />
              </n-form-item>
              <small v-if="field.help" class="field-help">{{ field.help }}</small>
            </div>
          </template>
        </div>
      </div>

      <template #footer>
        <div class="modal-actions">
          <n-button secondary @click="closeDialog">取消</n-button>
          <n-button type="primary" :loading="saving" @click="save">{{ isEdit ? '保存' : '新增' }}</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</div>
</template>
