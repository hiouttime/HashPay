<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useMessage } from "naive-ui";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { api, telegramInitData } from "@/frontend/services/api";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const tab = computed(() => String(route.params.tab ?? "orders"));
const botStartUrl = computed(() => state.value.botUsername ? `https://t.me/${state.value.botUsername}?start=hashpay` : "");
const orders = ref<any[]>([]);
const payments = ref<any[]>([]);
const merchants = ref<any[]>([]);
const catalog = ref<any>({ drivers: [], schema: {} });
const settings = ref<Record<string, string>>({});
const state = ref<{ botReady?: boolean; botUsername?: string | null; installed?: boolean }>({});
const authenticated = ref(false);
const pin = ref("");
const pinChallenge = ref("");
const pinCommand = ref("");
const pinExpiresAt = ref(0);
const pinStatus = ref("");
let pinPollTimer: ReturnType<typeof setInterval> | undefined;
const ready = ref(false);
const paymentForm = ref({
  driver: "chain/tron",
  enabled: true,
  fields: {
    account: "",
    address: "",
    currencies: "USDT,TRX",
    instructions: "",
    network: "tron",
  },
  name: "TRON",
});
const merchantForm = ref({ callbackUrl: "", name: "" });

async function loadAll() {
  ready.value = false;
  state.value = await api<{ botReady?: boolean; botUsername?: string | null; installed?: boolean }>("/api/state").catch(() => ({}));
  if (!state.value.installed) {
    await router.replace("/setup");
    return;
  }
  const me = await api("/api/auth/me").catch(() => null);
  authenticated.value = Boolean(me);
  if (!authenticated.value) {
    if (!telegramInitData()) await loadPin();
    ready.value = true;
    return;
  }
  [orders.value, payments.value, merchants.value, catalog.value, settings.value] = await Promise.all([
    api<any[]>("/api/admin/orders"),
    api<any[]>("/api/admin/payments"),
    api<any[]>("/api/admin/merchants"),
    api("/api/admin/payments/catalog"),
    api<Record<string, string>>("/api/admin/settings"),
  ]);
  ready.value = true;
}

async function login() {
  const initData = telegramInitData();
  if (!initData) return;
  const payload = { initData };
  await api("/api/auth/telegram", { body: JSON.stringify(payload), method: "POST" });
  await loadAll();
}

function clearPinPolling() {
  if (pinPollTimer) {
    clearInterval(pinPollTimer);
    pinPollTimer = undefined;
  }
}

function createSixDigitPin() {
  const data = new Uint32Array(1);
  crypto.getRandomValues(data);
  return String(Math.floor((data[0] / 0x100000000) * 1000000)).padStart(6, "0");
}

async function loadPin() {
  clearPinPolling();
  try {
    pin.value = createSixDigitPin();
    const result = await api<{ challenge: string; command: string; expiresAt: number }>("/api/auth/pin", {
      body: JSON.stringify({ pin: pin.value }),
      method: "POST",
    });
    pinChallenge.value = result.challenge;
    pinCommand.value = result.command;
    pinExpiresAt.value = result.expiresAt;
    pinStatus.value = "等待确认，页面会自动跳转。";
    await pollPinStatus();
    pinPollTimer = setInterval(() => void pollPinStatus(), 2000);
  } catch (error) {
    pinStatus.value = error instanceof Error ? error.message : "登录 PIN 创建失败";
  }
}

async function pollPinStatus() {
  if (!pin.value || !pinChallenge.value) return;
  if (pinExpiresAt.value && Math.floor(Date.now() / 1000) > pinExpiresAt.value) {
    clearPinPolling();
    await loadPin();
    return;
  }
  try {
    const result = await api<{ authenticated: boolean }>(
      `/api/auth/pin/status?pin=${encodeURIComponent(pin.value)}&challenge=${encodeURIComponent(pinChallenge.value)}`,
    );
    if (!result.authenticated) return;
    clearPinPolling();
    pinStatus.value = "登录成功";
    await loadAll();
  } catch (error) {
    clearPinPolling();
    pinStatus.value = error instanceof Error ? error.message : "登录检查失败";
  }
}

async function copyPin() {
  await navigator.clipboard.writeText(pinCommand.value);
  message.success("已复制登录指令");
}

async function savePayment() {
  await api("/api/admin/payments", { body: JSON.stringify(paymentForm.value), method: "POST" });
  message.success("支付方式已保存");
  await loadAll();
}

async function saveMerchant() {
  const result = await api<any>("/api/admin/merchants", { body: JSON.stringify(merchantForm.value), method: "POST" });
  message.success(result.apiKey ? `API Key: ${result.apiKey}` : "商户已保存");
  merchantForm.value = { callbackUrl: "", name: "" };
  await loadAll();
}

async function saveSettings() {
  await api("/api/admin/settings", { body: JSON.stringify(settings.value), method: "PUT" });
  message.success("设置已保存");
}

async function checkOrder(id: string) {
  await api(`/api/admin/orders/${id}/check`, { method: "POST" });
  message.success("检查完成");
  await loadAll();
}

async function confirmOrder(id: string) {
  await api(`/api/admin/orders/${id}/confirm`, { body: JSON.stringify({}), method: "POST" });
  message.success("已人工确认");
  await loadAll();
}

onMounted(loadAll);
onBeforeUnmount(clearPinPolling);
</script>

<template>
  <div class="shell">
    <div class="topbar">
      <div class="brand">HashPay</div>
      <div v-if="authenticated && telegramInitData()">
        <n-button size="small" @click="login">登录/刷新</n-button>
      </div>
    </div>
    <main v-if="!ready" class="page">
      <section class="panel">正在加载</section>
    </main>
    <main v-else-if="!authenticated" class="page">
      <section class="panel grid login-panel">
        <div class="section-title"><h2>欢迎</h2></div>
        <div v-if="telegramInitData()">
          <n-button type="primary" @click="login">登录/刷新</n-button>
        </div>
        <div v-else class="grid">
          <p class="muted">
            在
            <a v-if="state.botUsername" class="text-link" :href="botStartUrl" target="_blank" rel="noreferrer">@{{ state.botUsername }}</a>
            <span v-else>Telegram 机器人</span>
            中发送以下指令以完成登录。
          </p>
          <n-input-group>
            <n-input v-model:value="pinCommand" readonly />
            <n-button :disabled="!pinCommand" type="primary" @click="copyPin">复制</n-button>
          </n-input-group>
          <p class="muted">{{ pinStatus }}</p>
          <div v-if="state.botUsername" class="login-divider"><span>或</span></div>
          <div v-if="state.botUsername" class="grid">
            <p class="muted">使用管理员 Telegram 账号</p>
            <a :href="botStartUrl" target="_blank" rel="noreferrer">
              <n-button block secondary type="primary">访问小程序</n-button>
            </a>
          </div>
        </div>
      </section>
    </main>
    <main v-else class="page workspace">
      <nav class="nav">
        <RouterLink :class="{ 'is-active': tab === 'orders' }" to="/admin/orders">订单</RouterLink>
        <RouterLink :class="{ 'is-active': tab === 'payments' }" to="/admin/payments">支付</RouterLink>
        <RouterLink :class="{ 'is-active': tab === 'merchants' }" to="/admin/merchants">商户</RouterLink>
        <RouterLink :class="{ 'is-active': tab === 'settings' }" to="/admin/settings">设置</RouterLink>
      </nav>
      <section class="panel">
        <div v-if="tab === 'orders'">
          <div class="section-title"><h2>订单</h2></div>
          <div class="grid" style="margin-top: 12px">
            <div v-for="order in orders" :key="order.id" class="metric">
              <strong>{{ order.id }}</strong>
              <span>{{ order.status }} / {{ order.amount }} {{ order.currency }} / payway {{ order.payway || '-' }}</span>
              <div style="margin-top: 10px">
                <n-button size="small" @click="checkOrder(order.id)">自动检查</n-button>
                <n-button size="small" style="margin-left: 8px" @click="confirmOrder(order.id)">人工确认</n-button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="tab === 'payments'" class="grid">
          <div class="section-title"><h2>支付方式</h2></div>
          <n-select v-model:value="paymentForm.driver" :options="catalog.drivers.map((d:any) => ({ label: d.name, value: d.id }))" />
          <n-input v-model:value="paymentForm.name" placeholder="显示名称" />
          <n-input v-model:value="paymentForm.fields.address" placeholder="收款地址" />
          <n-input v-model:value="paymentForm.fields.account" placeholder="收款账户" />
          <n-input v-model:value="paymentForm.fields.network" placeholder="网络，如 tron / eth / bsc" />
          <n-input v-model:value="paymentForm.fields.currencies" placeholder="支持币种" />
          <n-input v-model:value="paymentForm.fields.instructions" placeholder="付款说明" type="textarea" />
          <n-button type="primary" @click="savePayment">保存支付方式</n-button>
          <n-list bordered>
            <n-list-item v-for="item in payments" :key="item.id">{{ item.id }} / {{ item.name }} / {{ item.driver }}</n-list-item>
          </n-list>
        </div>

        <div v-else-if="tab === 'merchants'" class="grid">
          <div class="section-title"><h2>商户</h2></div>
          <n-input v-model:value="merchantForm.name" placeholder="商户名称" />
          <n-input v-model:value="merchantForm.callbackUrl" placeholder="回调地址" />
          <n-button type="primary" @click="saveMerchant">创建商户</n-button>
          <n-list bordered>
            <n-list-item v-for="item in merchants" :key="item.id">{{ item.name }} / {{ item.api_key_prefix }}</n-list-item>
          </n-list>
        </div>

        <div v-else class="grid">
          <div class="section-title"><h2>设置</h2></div>
          <n-input v-model:value="settings.domain" placeholder="域名" />
          <n-input v-model:value="settings.telegram_merchant_key" placeholder="Telegram 默认商户 API Key" />
          <n-input v-model:value="settings.telegram_default_payway" placeholder="Telegram 默认支付方式 ID" />
          <n-button type="primary" @click="saveSettings">保存设置</n-button>
        </div>
      </section>
    </main>
  </div>
</template>
