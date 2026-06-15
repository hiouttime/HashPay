<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useRouter } from "vue-router";
import hashPayIcon from "@/frontend/assets/hashtag.svg";
import { api } from "@/frontend/services/api";

interface State {
  botReady?: boolean;
  botStatus?: "invalid" | "missing" | "ready";
  botUsername?: string | null;
  d1Error?: string | null;
  d1Ready?: boolean;
  environmentReady?: boolean;
  queueError?: string | null;
  queueReady?: boolean;
  suggestedDomain?: string;
}

const message = useMessage();
const router = useRouter();
const loading = ref(false);
const checking = ref(false);
const probingDomain = ref(false);
const polling = ref(false);
const finalizing = ref(false);
const finalized = ref(false);
const finalizeError = ref("");
const setupStarted = ref(false);
const setupComplete = ref(false);
const stateLoaded = ref(false);
const state = ref<State>({});
const domain = ref("");
const domainError = ref("");
const submittedDomain = ref("");
const admin = ref<{ firstName?: string; id: number; lastName?: string; username?: string } | null>(null);
let pollTimer: ReturnType<typeof setInterval> | undefined;
let setupTimer: ReturnType<typeof setTimeout> | undefined;
let domainProbeId = 0;
const envChecks = computed(() => [
  {
    detail: botTokenDetail(),
    label: "Telegram Bot Token",
    ready: Boolean(state.value.botReady),
  },
  {
    detail: state.value.d1Ready ? "数据库与表结构正确" : "数据库或表结构不可用",
    label: "数据库",
    ready: Boolean(state.value.d1Ready),
  },
  {
    detail: state.value.queueReady ? "已配置回调队列" : "未配置回调队列",
    label: "任务队列",
    ready: Boolean(state.value.queueReady),
  },
]);
const botUrl = computed(() => state.value.botUsername ? `https://t.me/${state.value.botUsername}?start=start` : "");
const canEnterAdmin = computed(() => Boolean(admin.value));

function botTokenDetail() {
  if (state.value.botReady) return `已识别 @${state.value.botUsername}`;
  if (state.value.botStatus === "invalid") return "TGBOT_TOKEN 无效\n请检查 Workers 设置中的环境变量";
  return "未配置环境变量 TGBOT_TOKEN\n请在 Workers 设置中配置环境变量";
}

async function loadState() {
  checking.value = true;
  try {
    state.value = await api<State>("/api/state");
    domain.value = state.value.suggestedDomain ?? location.origin;
  } catch (error) {
    state.value = {
      d1Error: error instanceof Error ? error.message : "环境检查失败",
      d1Ready: false,
      environmentReady: false,
    };
  } finally {
    checking.value = false;
    stateLoaded.value = true;
  }
}

async function setupWebhook() {
  if (!state.value.environmentReady || !isPublicHttpsDomain(domain.value) || submittedDomain.value === domain.value) return;
  loading.value = true;
  try {
    await api("/api/admin/setup", { body: JSON.stringify({ domain: domain.value }), method: "POST" });
    submittedDomain.value = domain.value;
    setupStarted.value = true;
    startPolling();
  } catch (error) {
    message.error(error instanceof Error ? error.message : "Webhook 配置失败");
  } finally {
    loading.value = false;
  }
}

function scheduleSetupWebhook() {
  if (setupTimer) clearTimeout(setupTimer);
  if (submittedDomain.value && domain.value !== submittedDomain.value) {
    setupStarted.value = false;
    submittedDomain.value = "";
    admin.value = null;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
    polling.value = false;
  }
  if (!state.value.environmentReady || setupStarted.value) return;
  if (!domain.value) {
    domainError.value = "";
    return;
  }
  domainError.value = isPublicHttpsDomain(domain.value) ? "" : "请填写有效站点地址";
  if (domainError.value) return;
  setupTimer = setTimeout(() => {
    void probeAndSetupWebhook();
  }, 600);
}

async function probeAndSetupWebhook() {
  const currentDomain = domain.value;
  const probeId = ++domainProbeId;
  probingDomain.value = true;
  domainError.value = "";
  const ok = await probeDomain(currentDomain);
  if (probeId !== domainProbeId || currentDomain !== domain.value) return;
  probingDomain.value = false;
  if (!ok) {
    domainError.value = "请填写有效站点地址";
    return;
  }
  await setupWebhook();
}

async function probeDomain(value: string) {
  try {
    await fetch(value, { cache: "no-store", method: "GET", mode: "cors" });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return message.includes("cors") || message.includes("cross-origin") || message.includes("access-control");
  }
}

function isPublicHttpsDomain(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && isPublicHostname(url.hostname) && url.pathname === "/";
  } catch {
    return false;
  }
}

function isPublicHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".local")) return false;
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(lower) ? lower.split(".").map(Number) : null;
  if (ipv4) {
    const [a, b] = ipv4;
    if (ipv4.some((part) => part < 0 || part > 255)) return false;
    return !(a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254));
  }
  return lower.includes(".");
}

function startPolling() {
  if (pollTimer) return;
  polling.value = true;
  void pollSetupStatus();
  pollTimer = setInterval(pollSetupStatus, 2500);
}

async function pollSetupStatus() {
  try {
    const result = await api<{ admin: typeof admin.value; bound: boolean }>("/api/admin/setup/status");
    if (!result.bound || !result.admin) return;
    admin.value = result.admin;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
    polling.value = false;
  } catch (error) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
    polling.value = false;
  }
}

async function goNext() {
  if (!canEnterAdmin.value) return;
  setupComplete.value = true;
  await finalizeSetup();
}

async function finalizeSetup() {
  finalizing.value = true;
  finalizeError.value = "";
  try {
    await api("/api/admin/setup/finalize", { method: "POST" });
    finalized.value = true;
  } catch (error) {
    finalizeError.value = error instanceof Error ? error.message : "Mini App 配置失败";
  } finally {
    finalizing.value = false;
  }
}

onMounted(loadState);
watch(domain, scheduleSetupWebhook);
watch(() => state.value.environmentReady, scheduleSetupWebhook);
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (setupTimer) clearTimeout(setupTimer);
  domainProbeId += 1;
});
</script>

<template>
  <main class="setup-shell">
    <section class="setup-panel">
      <div class="setup-logo">
        <img :src="hashPayIcon" alt="" aria-hidden="true" />
      </div>
      <div class="section-title">
        <h1>{{ setupComplete ? '一切完成！' : '欢迎使用 HashPay' }}</h1>
      </div>
      <div v-if="setupComplete" class="grid">
        <div class="setup-done">
          <p>以后可以从 Telegram 机器人打开 HashPay 小程序进入管理后台。</p>
          <p>也可以直接在浏览器访问站点；浏览器登录会通过给机器人发送 PIN 码完成。</p>
          <p class="muted">{{ finalizing ? '正在配置机器人入口' : finalized ? '机器人入口已配置' : finalizeError }}</p>
        </div>
        <n-button type="primary" @click="router.push('/admin')">进入后台</n-button>
      </div>
      <div v-else class="grid">
        <div v-if="!stateLoaded" class="setup-checks">
          <div v-for="item in 3" :key="item" class="setup-check setup-check--skeleton">
            <span class="setup-check__dot"></span>
            <div>
              <span class="skeleton-line skeleton-title"></span>
              <span class="skeleton-line skeleton-text"></span>
            </div>
          </div>
        </div>
        <div v-else-if="!state.environmentReady" class="setup-checks">
          <div v-for="check in envChecks" :key="check.label" class="setup-check" :class="{ 'is-ready': check.ready }">
            <span class="setup-check__dot"></span>
            <div>
              <strong>{{ check.label }}</strong>
              <p>{{ check.detail }}</p>
            </div>
          </div>
        </div>
        <n-button v-if="stateLoaded && !state.environmentReady" :loading="checking" type="primary" @click="loadState">重新检查</n-button>
        <template v-if="state.environmentReady">
          <div class="setup-steps">
            <div class="setup-step">
              <span class="setup-step__index">1</span>
              <div>
                <strong>即将与 @{{ state.botUsername }} 绑定</strong>
              </div>
            </div>
            <div class="setup-step">
              <span class="setup-step__index">2</span>
              <div>
                <strong>配置站点地址</strong>
                <n-input v-model:value="domain" :disabled="loading" placeholder="https://hashpay.example.com" />
                <p v-if="domainError" class="muted is-error">{{ domainError }}</p>
                <p v-else-if="probingDomain" class="muted">正在检查站点地址</p>
                <p v-else-if="loading" class="muted">正在配置站点地址</p>
              </div>
            </div>
            <div class="setup-step">
              <span class="setup-step__index">3</span>
              <div>
                <strong>配置管理员账户</strong>
                <p v-if="!setupStarted" class="muted">需先配置站点地址</p>
                <template v-else-if="!admin">
                  <a :href="botUrl" target="_blank" rel="noreferrer">
                    <n-button type="primary">访问机器人</n-button>
                  </a>
                  <p class="muted">{{ polling ? `使用管理员账号给 @${state.botUsername} 发送任意消息` : '等待管理员绑定' }}</p>
                </template>
                <p v-else class="muted">已绑定 {{ admin.username ? '@' + admin.username : admin.id }}</p>
              </div>
            </div>
          </div>
          <n-button :disabled="!canEnterAdmin" type="primary" @click="goNext">下一步</n-button>
        </template>
      </div>
    </section>
  </main>
</template>
