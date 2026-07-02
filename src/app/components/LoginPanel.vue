<script setup lang="ts">
import { useMessage } from "naive-ui";
import { useSessionLogin } from "@/app/utils/session-login";

defineProps<{
  botUsername?: string | null;
}>();

const emit = defineEmits<{
  authenticated: [];
}>();

const message = useMessage();
const { botStartUrl, command, commandWrap, copyCommand, status } = useSessionLogin({
  message,
  onAuthenticated: () => emit("authenticated"),
});
</script>

<template>
  <section class="panel grid login-panel">
    <div class="section-title"><h2>欢迎</h2></div>
    <div class="grid">
      <p class="muted">
        在
        <a v-if="botUsername" class="text-link" :href="botStartUrl(botUsername)" target="_blank" rel="noreferrer">@{{ botUsername }}</a>
        <span v-else>Telegram 机器人</span>
        中发送以下指令以完成登录。
      </p>
      <div ref="commandWrap">
        <n-input-group>
          <n-input v-model:value="command" readonly />
          <n-button :disabled="!command" type="primary" @click="copyCommand">复制</n-button>
        </n-input-group>
      </div>
      <p class="muted">{{ status }}</p>
      <div v-if="botUsername" class="login-divider"><span>或</span></div>
      <div v-if="botUsername" class="grid">
        <p class="muted">使用管理员 Telegram 账号</p>
        <a :href="botStartUrl(botUsername)" target="_blank" rel="noreferrer">
          <n-button block secondary type="primary">访问小程序</n-button>
        </a>
      </div>
    </div>
  </section>
</template>
