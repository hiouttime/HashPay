<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "@/app/components/AppIcon.vue";
import { api, type AppState, type TelegramUser } from "@/app/api";

type Loading = "" | "domain" | "status" | "setup";

const router = useRouter();
const status = ref<Partial<AppState> | null>(null);
const domain = ref("");
const domainError = ref("");
const submittedDomain = ref("");
const admin = ref<TelegramUser | null>(null);
const loading = ref<Loading>("");
const polling = ref(false);
const complete = ref(false);
let pollTimer: ReturnType<typeof setInterval> | undefined;
let setupTimer: ReturnType<typeof setTimeout> | undefined;
let domainCheckId = 0;

const loaded = computed(() => Boolean(status.value));
const environmentReady = computed(() => Boolean(status.value?.environmentReady));
const setupStarted = computed(() => Boolean(submittedDomain.value && submittedDomain.value === domain.value));
const botLink = computed(() => status.value?.botUsername ? `https://t.me/${status.value.botUsername}?start=start` : "");
const checks = computed(() => [
  {
    detail: botDetail(),
    label: "Telegram Bot Token",
    ready: Boolean(status.value?.botReady),
  },
  {
    detail: status.value?.db_ready ? "数据库已就绪" : "数据库不可用",
    label: "数据库",
    ready: Boolean(status.value?.db_ready),
  },
  {
    detail: status.value?.queueReady ? "已配置回调队列" : "未配置回调队列",
    label: "任务队列",
    ready: Boolean(status.value?.queueReady),
  },
]);

function botDetail() {
  if (status.value?.botReady) return `已识别 @${status.value.botUsername}`;
  if (status.value?.botStatus === "invalid") return "TGBOT_TOKEN 无效\n请检查 Workers 设置中的环境变量";
  return "未配置环境变量 TGBOT_TOKEN\n请在 Workers 设置中配置环境变量";
}

async function load() {
  loading.value = "status";
  try {
    const next = await api.state.get({ silent: true });
    status.value = next;
    domain.value = next.suggestedDomain || location.origin;
  } catch (error) {
    status.value = {
      db_error: error instanceof Error ? error.message : "环境检查失败",
      db_ready: false,
      environmentReady: false,
    };
  } finally {
    loading.value = "";
  }
}

function scheduleSetup() {
  clearSetupTimer();
  domainCheckId += 1;
  if (loading.value === "domain") loading.value = "";

  if (submittedDomain.value && domain.value !== submittedDomain.value) {
    submittedDomain.value = "";
    admin.value = null;
    stopPolling();
  }
  if (!environmentReady.value || setupStarted.value) return;
  if (!domain.value) {
    domainError.value = "";
    return;
  }
  domainError.value = validDomain(domain.value) ? "" : "请填写有效站点地址";
  if (domainError.value) return;

  setupTimer = setTimeout(() => {
    void checkDomain();
  }, 600);
}

async function checkDomain() {
  const value = domain.value;
  const id = ++domainCheckId;
  loading.value = "domain";
  domainError.value = "";

  const ok = await reachableSite(value);
  if (id !== domainCheckId || value !== domain.value) return;
  if (!ok) {
    loading.value = "";
    domainError.value = "请填写有效站点地址";
    return;
  }
  await submitSetup();
}

async function submitSetup() {
  if (!environmentReady.value || !validDomain(domain.value) || submittedDomain.value === domain.value) return;
  loading.value = "setup";
  try {
    await api.setup.submit(domain.value);
    submittedDomain.value = domain.value;
    startPolling();
  } catch {
    // API layer displays the error.
  } finally {
    loading.value = "";
  }
}

async function reachableSite(value: string) {
  try {
    await fetch(value, { cache: "no-store", method: "GET", mode: "cors" });
    return true;
  } catch (error) {
    const text = error instanceof Error ? error.message.toLowerCase() : "";
    return text.includes("cors") || text.includes("cross-origin") || text.includes("access-control");
  }
}

function validDomain(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && publicHost(url.hostname) && url.pathname === "/";
  } catch {
    return false;
  }
}

function publicHost(hostname: string) {
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
  void checkAdmin();
  pollTimer = setInterval(checkAdmin, 2500);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
  polling.value = false;
}

async function checkAdmin() {
  try {
    const result = await api.setup.session({ silent: true });
    if (!result.bound || !result.admin) return;
    admin.value = result.admin;
    complete.value = true;
    stopPolling();
  } catch {
    stopPolling();
  }
}

function clearSetupTimer() {
  if (setupTimer) clearTimeout(setupTimer);
  setupTimer = undefined;
}

onMounted(load);
watch(domain, scheduleSetup);
watch(environmentReady, scheduleSetup);
onBeforeUnmount(() => {
  stopPolling();
  clearSetupTimer();
  domainCheckId += 1;
});
</script>

<template>
  <main class="setup-shell">
    <section class="setup-panel">
      <div class="setup-logo">
        <AppIcon name="icon-hashpay" />
      </div>
      <div class="section-title">
        <h1>{{ complete ? '一切完成！' : '欢迎使用 HashPay' }}</h1>
      </div>
      <div v-if="complete" class="grid">
        <div class="setup-done">
          <p>今后您可以使用管理员账户在 @{{ status?.botUsername }} 中进入后台。</p>
          <p>也可以直接在浏览器中访问。</p>
          <p>别忘了添加一个收款通道以开始使用。</p>
        </div>
        <n-button type="primary" @click="router.push('/admin/overview')">进入后台</n-button>
      </div>
      <div v-else class="grid">
        <div v-if="!loaded" class="setup-checks">
          <div v-for="item in 3" :key="item" class="setup-check setup-check--skeleton">
            <span class="setup-check__dot"></span>
            <div>
              <span class="skeleton-line skeleton-title"></span>
              <span class="skeleton-line skeleton-text"></span>
            </div>
          </div>
        </div>
        <div v-else-if="!environmentReady" class="setup-checks">
          <div v-for="check in checks" :key="check.label" class="setup-check" :class="{ 'is-ready': check.ready }">
            <span class="setup-check__dot"></span>
            <div>
              <strong>{{ check.label }}</strong>
              <p>{{ check.detail }}</p>
            </div>
          </div>
        </div>
        <n-button v-if="loaded && !environmentReady" :loading="loading === 'status'" type="primary" @click="load">重新检查</n-button>
        <template v-if="environmentReady">
          <div class="setup-steps">
            <div class="setup-step">
              <span class="setup-step__index">1</span>
              <div>
                <strong>即将与 @{{ status?.botUsername }} 绑定</strong>
              </div>
            </div>
            <div class="setup-step">
              <span class="setup-step__index">2</span>
              <div>
                <strong>配置站点地址</strong>
                <n-input v-model:value="domain" :disabled="loading === 'setup'" placeholder="https://hashpay.example.com" />
                <p v-if="domainError" class="muted is-error">{{ domainError }}</p>
                <p v-else-if="loading === 'domain'" class="muted">正在检查站点地址</p>
                <p v-else-if="loading === 'setup'" class="muted">正在配置站点地址</p>
              </div>
            </div>
            <div class="setup-step">
              <span class="setup-step__index">3</span>
              <div>
                <strong>配置管理员账户</strong>
                <p v-if="!setupStarted" class="muted">需先配置站点地址</p>
                <template v-else-if="!admin">
                  <a :href="botLink" target="_blank" rel="noreferrer">
                    <n-button type="primary">访问机器人</n-button>
                  </a>
                  <p class="muted">{{ polling ? `使用管理员账号给 @${status?.botUsername} 发送任意消息` : '等待管理员绑定' }}</p>
                </template>
                <p v-else class="muted">已绑定 {{ admin.username ? '@' + admin.username : admin.id }}</p>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>
  </main>
</template>
