<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "@/app/components/AppIcon.vue";
import LocaleSwitch from "@/app/components/LocaleSwitch.vue";
import { api, type AppState, type TelegramUser } from "@/app/api";
import { useI18n } from "@/app/i18n";

type Loading = "" | "domain" | "status" | "setup";

const router = useRouter();
const { t } = useI18n();
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
const botLink = computed(() => status.value?.username ? `https://t.me/${status.value.username}?start=start` : "");
const checks = computed(() => [
  {
    detail: botDetail(),
    label: "Telegram Bot Token",
    ready: Boolean(status.value?.botReady),
  },
  {
    detail: status.value?.db_ready ? t("setup.database_ready") : t("setup.database_unavailable"),
    label: t("setup.database"),
    ready: Boolean(status.value?.db_ready),
  },
  {
    detail: status.value?.queueReady ? t("setup.queue_ready") : t("setup.queue_unavailable"),
    label: t("setup.queue"),
    ready: Boolean(status.value?.queueReady),
  },
]);

function botDetail() {
  if (status.value?.botReady) return t("setup.bot_ready", { bot: status.value.username || "" });
  if (status.value?.botStatus === "invalid") return t("setup.bot_invalid");
  return t("setup.bot_missing");
}

async function load() {
  loading.value = "status";
  try {
    const next = await api.silent.state.get();
    status.value = next;
    domain.value = next.suggestedDomain || location.origin;
  } catch (error) {
    status.value = {
      db_error: error instanceof Error ? error.message : t("setup.check_failed"),
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
  domainError.value = validDomain(domain.value) ? "" : t("setup.domain_invalid");
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
    domainError.value = t("setup.domain_invalid");
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
    const host = url.hostname.toLowerCase();
    const domain = /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z][a-z0-9-]{1,62}$/;
    return url.protocol === "https:"
      && url.pathname === "/"
      && host !== "localhost"
      && !host.endsWith(".local")
      && !/^(\d{1,3}\.){3}\d{1,3}$/.test(host)
      && domain.test(host);
  } catch {
    return false;
  }
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
    const result = await api.silent.setup.session();
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
      <div class="setup-locale">
        <LocaleSwitch />
      </div>
      <div class="section-title">
        <h1>{{ complete ? t('setup.done') : t('setup.welcome') }}</h1>
      </div>
      <div v-if="complete" class="grid">
        <div class="setup-done">
          <p>{{ t('setup.done_bot', { bot: status?.username || '' }) }}</p>
          <p>{{ t('setup.done_browser') }}</p>
          <p>{{ t('setup.done_channel') }}</p>
        </div>
        <n-button type="primary" @click="router.push('/admin/overview')">{{ t('setup.enter_admin') }}</n-button>
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
        <n-button v-if="loaded && !environmentReady" :loading="loading === 'status'" type="primary" @click="load">{{ t('setup.recheck') }}</n-button>
        <template v-if="environmentReady">
          <div class="setup-steps">
            <div class="setup-step">
              <span class="setup-step__index">1</span>
              <div>
                <strong>{{ t('setup.bind_bot', { bot: status?.username || '' }) }}</strong>
              </div>
            </div>
            <div class="setup-step">
              <span class="setup-step__index">2</span>
              <div>
                <strong>{{ t('setup.domain') }}</strong>
                <n-input v-model:value="domain" :disabled="loading === 'setup'" placeholder="https://hashpay.example.com" />
                <p v-if="domainError" class="muted is-error">{{ domainError }}</p>
                <p v-else-if="loading === 'domain'" class="muted">{{ t('setup.domain_checking') }}</p>
                <p v-else-if="loading === 'setup'" class="muted">{{ t('setup.domain_configuring') }}</p>
              </div>
            </div>
            <div class="setup-step">
              <span class="setup-step__index">3</span>
              <div>
                <strong>{{ t('setup.admin') }}</strong>
                <p v-if="!setupStarted" class="muted">{{ t('setup.admin_need_domain') }}</p>
                <template v-else-if="!admin">
                  <a :href="botLink" target="_blank" rel="noreferrer">
                    <n-button type="primary">{{ t('setup.open_bot') }}</n-button>
                  </a>
                  <p class="muted">{{ polling ? t('setup.admin_send', { bot: status?.username || '' }) : t('setup.admin_waiting') }}</p>
                </template>
                <p v-else class="muted">{{ t('setup.admin_bound_user', { user: admin.username ? '@' + admin.username : admin.id }) }}</p>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>
  </main>
</template>
