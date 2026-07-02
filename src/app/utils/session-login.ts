import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "@/app/api";
import { copyText, type CopyMessage } from "@/app/utils/clipboard";

export function botStartUrl(botUsername?: string | null) {
  return botUsername ? `https://t.me/${botUsername}?start=hashpay` : "";
}

export function isTelegramMiniApp() {
  return Boolean(telegramInitData());
}

function telegramInitData() {
  return window.Telegram?.WebApp?.initData || "";
}

export async function readSession() {
  return api.session.current({ silent: true }).catch(() => null);
}

export async function loginWithTelegram() {
  const initData = telegramInitData();
  if (!initData) return null;
  return api.session.telegram(initData, { silent: true }).catch(() => null);
}

export async function logoutSession() {
  await api.session.logout({ silent: true }).catch(() => null);
}

export function useSessionLogin(options: {
  onAuthenticated: () => void;
  message?: CopyMessage;
}) {
  const code = ref("");
  const challenge = ref("");
  const command = ref("");
  const expiresAt = ref(0);
  const status = ref("");
  const commandWrap = ref<HTMLElement | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function createLoginCode() {
    const data = new Uint32Array(1);
    crypto.getRandomValues(data);
    return String(Math.floor((data[0] / 0x100000000) * 1000000)).padStart(6, "0");
  }

  async function startCodeLogin() {
    stopPolling();
    try {
      code.value = createLoginCode();
      const result = await api.session.createCode(code.value, { silent: true });
      challenge.value = result.challenge;
      command.value = result.command;
      expiresAt.value = result.expiresAt;
      status.value = "等待确认，页面会自动跳转。";
      await checkCodeLogin();
      pollTimer = setInterval(() => void checkCodeLogin(), 2000);
    } catch (error) {
      status.value = error instanceof Error ? error.message : "登录码创建失败";
    }
  }

  async function checkCodeLogin() {
    if (!code.value || !challenge.value) return;
    if (expiresAt.value && Math.floor(Date.now() / 1000) > expiresAt.value) {
      await startCodeLogin();
      return;
    }
    try {
      const result = await api.session.checkCode(code.value, challenge.value, { silent: true });
      if (!result.authenticated) return;
      stopPolling();
      status.value = "登录成功";
      options.onAuthenticated();
    } catch (error) {
      stopPolling();
      status.value = error instanceof Error ? error.message : "登录检查失败";
    }
  }

  async function selectCommand() {
    await nextTick();
    const input = commandWrap.value?.querySelector("input");
    input?.focus();
    input?.select();
  }

  async function copyCommand() {
    if (!command.value) return;
    if (!await copyText(command.value, { message: options.message })) await selectCommand();
  }

  onMounted(() => {
    void startCodeLogin();
  });

  onBeforeUnmount(stopPolling);

  return {
    botStartUrl,
    command,
    commandWrap,
    copyCommand,
    status,
  };
}
