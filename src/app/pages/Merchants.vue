<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import { api, type MerchantDto, type MerchantInput } from "@/app/api";
import { copyText } from "@/app/utils/clipboard";

type MerchantStatus = "active" | "paused";
type MerchantType = "telegram" | "website";

interface MerchantForm {
  callback: string;
  name: string;
  status: MerchantStatus;
  type: MerchantType;
}

const route = useRoute();
const router = useRouter();
const message = useMessage();
const merchants = ref<MerchantDto[]>([]);
const credential = ref<{ merchantId: string; privateKey: string } | null>(null);
const loading = ref(false);
const form = reactive<MerchantForm>({ callback: "", name: "", status: "active", type: "website" });

const typeOptions: Array<{ description: string; label: string; value: MerchantType }> = [
  {
    description: "通过 REST API 下单，以跳转收银台或直接返回二维码等形式完成付款。",
    label: "网站",
    value: "website",
  },
  {
    description: "在 Telegram 内下单，跳转钱包机器人完成付款。",
    label: "Telegram 机器人",
    value: "telegram",
  },
];
const typeLabels: Record<string, string> = Object.fromEntries(typeOptions.map((item) => [item.value, item.label]));

const mode = computed<"" | "edit" | "new">(() => {
  if (route.path.endsWith("/new")) return "new";
  return route.params.id ? "edit" : "";
});
const editingId = computed(() => (mode.value === "edit" ? String(route.params.id) : ""));
const current = computed(() => merchants.value.find((item) => item.id === editingId.value) ?? null);
const isEdit = computed(() => mode.value === "edit");
const typeDescription = computed(() => typeOptions.find((item) => item.value === form.type)?.description ?? "");
const formOpen = computed({
  get: () => mode.value !== "",
  set: (show) => {
    if (!show) closeForm();
  },
});
const credentialOpen = computed({
  get: () => Boolean(credential.value),
  set: (show) => {
    if (!show) credential.value = null;
  },
});

async function run(action: () => Promise<void>) {
  loading.value = true;
  try {
    await action();
  } finally {
    loading.value = false;
  }
}

async function load() {
  merchants.value = await api.merchants.list();
  syncForm();
}

async function save() {
  const name = form.name.trim();
  const callback = form.callback.trim();
  if (!name) {
    message.error("请填写商户名称");
    return;
  }
  if (callback && !callback.startsWith("https://")) {
    message.error("回调 URL 必须以 https:// 开头");
    return;
  }

  const creating = mode.value === "new";
  const input: MerchantInput = { callback, name, status: form.status, type: form.type };

  await run(async () => {
    const result = editingId.value
      ? await api.merchants.update(editingId.value, input)
      : await api.merchants.create(input);
    message.success(creating ? "商户已新增" : "商户已保存");
    await load();
    closeForm();
    if (creating && result.privateKey) {
      credential.value = { merchantId: result.merchant.id, privateKey: result.privateKey };
    }
  });
}

async function remove(id: string) {
  await run(async () => {
    await api.merchants.remove(id);
    message.success("商户已删除");
    closeForm();
    await load();
  });
}

async function setStatus(item: MerchantDto, status: string) {
  const next = status === "active" ? "active" : "paused";
  const previous = item.status;
  item.status = next;
  try {
    await run(async () => {
      const result = await api.merchants.update(item.id, {
        callback: item.callback ?? "",
        name: item.name,
        status: next,
        type: item.type,
      });
      merchants.value = merchants.value.map((merchant) => (merchant.id === result.merchant.id ? result.merchant : merchant));
      message.success(next === "active" ? "商户已启用" : "商户已停用");
    });
  } catch {
    item.status = previous;
  }
}

async function resetKey() {
  if (!editingId.value) return;
  await run(async () => {
    const result = await api.merchants.rotateKey(editingId.value);
    message.success("接入凭据已重置");
    await load();
    closeForm();
    if (result.privateKey) {
      credential.value = { merchantId: result.merchant.id, privateKey: result.privateKey };
    }
  });
}

function closeForm() {
  Object.assign(form, { callback: "", name: "", status: "active", type: "website" });
  void router.push("/admin/merchants");
}

function syncForm() {
  if (mode.value === "new") {
    Object.assign(form, { callback: "", name: "", status: "active", type: "website" });
    return;
  }
  if (!current.value) return;
  Object.assign(form, {
    callback: current.value.callback ?? "",
    name: current.value.name,
    status: current.value.status as MerchantStatus,
    type: current.value.type as MerchantType,
  });
}

function formatTime(value: unknown) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  const date = new Date(ts * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

watch(
  () => [mode.value, editingId.value, current.value] as const,
  syncForm,
  { immediate: true },
);

onMounted(() => run(load));
</script>

<template>
  <div class="grid">
    <div class="section-title">
      <div>
        <h2>商户列表</h2>
      </div>
      <n-button type="primary" @click="router.push('/admin/merchants/new')">新增商户</n-button>
    </div>

    <section class="panel grid">
      <n-empty v-if="!merchants.length" description="暂无商户" />
      <div
        v-for="item in merchants"
        :key="item.id"
        class="list-card merchant-card is-clickable"
        @click="router.push(`/admin/merchants/${item.id}/edit`)"
      >
        <div class="merchant-card-main">
          <div class="merchant-card-title">
            <strong>{{ item.name }}</strong>
            <n-tag size="small">{{ typeLabels[item.type] || item.type }}</n-tag>
          </div>
          <p>创建时间：{{ formatTime(item.createdAt) }}</p>
          <p>回调 URL：{{ item.callback || '未配置' }}</p>
        </div>
        <div class="merchant-card-actions" @click.stop>
          <n-button size="small" quaternary @click="router.push(`/admin/merchants/${item.id}/edit`)">编辑</n-button>
          <div class="merchant-status-control">
            <span>{{ item.status === 'active' ? '启用' : '停用' }}</span>
            <n-switch
              :disabled="loading"
              :value="item.status"
              checked-value="active"
              unchecked-value="paused"
              @update:value="setStatus(item, $event)"
            />
          </div>
        </div>
      </div>
    </section>

    <n-modal v-model:show="formOpen">
      <n-card
        :title="isEdit ? '编辑商户' : '新增商户'"
        closable
        class="payment-modal-card"
        role="dialog"
        aria-modal="true"
        @close="formOpen = false"
      >
        <div class="payment-modal-body grid">
          <div class="form-section grid">
            <h3>商户名称</h3>
            <n-input v-model:value="form.name" placeholder="用于标识商户" />
            <div v-if="isEdit" class="switch-line">
              <span>是否启用</span>
              <n-switch v-model:value="form.status" checked-value="active" unchecked-value="paused" />
            </div>
          </div>

          <div class="form-section grid">
            <h3>商户类型</h3>
            <n-radio-group v-model:value="form.type" size="small">
              <n-radio-button
                v-for="item in typeOptions"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </n-radio-button>
            </n-radio-group>
            <p class="muted">{{ typeDescription }}</p>
          </div>

          <div class="form-section grid">
            <h3>回调 URL</h3>
            <n-input v-model:value="form.callback" placeholder="https://merchant.example.com/callback" />
            <p class="muted merchant-doc-help">
              <span>在订单状态更新时，将会向此地址进行异步通知。你可以稍后修改这个参数。</span>
              <a class="text-link" href="/docs/merchant-api" target="_blank" rel="noreferrer">开发文档</a>
            </p>
          </div>

          <div class="form-section grid">
            <div class="credential-title-row">
              <h3>接入凭据</h3>
              <n-popconfirm
                v-if="isEdit"
                negative-text="取消"
                positive-text="重置"
                @positive-click="resetKey"
              >
                <template #trigger>
                  <n-button :loading="loading" secondary size="small" type="warning">重置</n-button>
                </template>
                重置后，旧私钥签名将无法通过验签。系统会生成新的私钥，请立即保存。
              </n-popconfirm>
            </div>
            <div class="credential-grid credential-grid-single">
              <div v-if="current" class="credential-field">
                <span>商户 ID</span>
                <div class="detail-copy-row">
                  <strong>{{ current.id }}</strong>
                  <n-button secondary size="small" @click="copyText(current.id, { message })">复制</n-button>
                </div>
              </div>
              <div v-if="current" class="form-field-block">
                <span class="field-label">公钥</span>
                <n-input
                  :value="current.publicKey || ''"
                  :input-props="{ style: { overflowWrap: 'normal', whiteSpace: 'pre' }, wrap: 'off' }"
                  readonly
                  placeholder="暂无公钥"
                  type="textarea"
                  :autosize="{ minRows: 5, maxRows: 10 }"
                />
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="modal-actions">
            <n-button v-if="isEdit && current" secondary type="error" @click="remove(current.id)">删除商户</n-button>
            <span class="modal-actions-spacer"></span>
            <n-button secondary @click="formOpen = false">取消</n-button>
            <n-button :loading="loading" type="primary" @click="save">{{ isEdit ? '保存' : '新增' }}</n-button>
          </div>
        </template>
      </n-card>
    </n-modal>

    <n-modal v-model:show="credentialOpen">
      <n-card
        title="接入凭据"
        closable
        class="payment-modal-card"
        role="dialog"
        aria-modal="true"
        @close="credentialOpen = false"
      >
        <div class="payment-modal-body grid">
          <div class="credential-field">
            <span>商户 ID</span>
            <strong>{{ credential?.merchantId }}</strong>
          </div>
          <div class="form-field-block">
            <div class="credential-title-row">
              <span class="field-label">私钥</span>
            </div>
            <n-input
              :value="credential?.privateKey || ''"
              readonly
              placeholder="-----BEGIN PRIVATE KEY-----"
              type="textarea"
              :autosize="{ minRows: 8, maxRows: 14 }"
            />
            <small class="field-help">私钥用于请求签名，仅显示一次，请妥善保存。</small>
          </div>
        </div>

        <template #footer>
          <div class="modal-actions">
            <n-button secondary @click="credentialOpen = false">关闭</n-button>
            <n-button type="primary" @click="copyText(credential?.privateKey || '', { message })">复制私钥</n-button>
          </div>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>
