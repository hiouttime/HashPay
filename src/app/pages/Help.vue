<script setup lang="ts">
import { computed } from "vue";
import { useMessage } from "naive-ui";
import { useRoute } from "vue-router";
import BinanceHelp from "@/app/components/BinanceHelp.vue";
import { useI18n } from "@/app/i18n";
import { copyText } from "@/app/utils/clipboard";

const props = defineProps<{
  username: string;
}>();

const message = useMessage();
const { t } = useI18n();
const route = useRoute();
const helpBase = "/admin/help";
const topics = [
  { id: "telegram", summary: "help.telegram.summary", title: "help.telegram.title" },
  { id: "binance", summary: "help.binance.summary", title: "help.binance.title" },
] as const;
const topic = computed(() => String(route.params.topic || ""));
const activeTopic = computed(() => topic.value || topics[0].id);
const bot = computed(() => `@${props.username}`);
</script>

<template>
  <div class="help-layout" :class="{ 'is-reading': topic }">
    <aside class="help-nav">
      <h2>{{ t('help.title') }}</h2>
      <router-link
        v-for="item in topics"
        :key="item.id"
        :class="{ 'is-active': activeTopic === item.id }"
        :to="`${helpBase}/${item.id}`"
      >
        <strong>{{ t(item.title) }}</strong>
        <span>{{ t(item.summary) }}</span>
      </router-link>
    </aside>

    <div class="help-main">
      <router-link v-if="topic" class="help-back" :to="helpBase">{{ t('help.back') }}</router-link>

    <article v-if="activeTopic === 'telegram'" class="help-article grid">
      <header>
        <h2>{{ t('help.telegram.title') }}</h2>
        <p>{{ t('help.telegram.summary') }}</p>
      </header>

      <section class="help-section grid">
        <h3>{{ t('help.telegram.inline_title') }}</h3>
        <p>{{ t('help.telegram.inline_intro', { bot }) }}</p>
        <div class="bot-chat">
          <a class="bot-chat-name" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>
          <button class="bot-bubble" type="button" @click="copyText('/setinline', { message })"><code>/setinline</code></button>
          <p>{{ t('help.telegram.choose_bot', { bot }) }}</p>
          <div class="bot-bubble bot-reply">{{ t('help.telegram.inline_reply', { bot }) }}</div>
          <p>{{ t('help.telegram.placeholder_intro') }}</p>
          <button class="bot-bubble" type="button" @click="copyText('1', { message })">1</button>
          <div class="bot-bubble bot-reply">{{ t('help.telegram.inline_success') }}</div>
        </div>
      </section>

      <section class="help-section grid">
        <h3>{{ t('help.telegram.feedback_title') }}</h3>
        <p>{{ t('help.telegram.feedback_intro', { bot }) }}</p>
        <div class="bot-chat">
          <a class="bot-chat-name" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>
          <button class="bot-bubble" type="button" @click="copyText('/setinlinefeedback', { message })"><code>/setinlinefeedback</code></button>
          <p>{{ t('help.telegram.choose_bot', { bot }) }}</p>
          <div class="bot-bubble bot-reply">{{ t('help.telegram.feedback_reply', { bot }) }}</div>
          <p>{{ t('help.telegram.feedback_enable') }}</p>
          <button class="bot-bubble" type="button" @click="copyText('Enable', { message })">Enable</button>
          <div class="bot-bubble bot-reply">{{ t('help.telegram.feedback_success') }}</div>
        </div>
      </section>

      <section class="help-section grid">
        <h3>{{ t('help.telegram.use_title') }}</h3>
        <p>{{ t('help.telegram.use_intro') }}</p>
        <n-input :value="`${bot} 10`" readonly />
      </section>
    </article>

    <article v-else-if="activeTopic === 'binance'" class="help-article grid">
      <header>
        <h2>{{ t('help.binance.title') }}</h2>
      </header>
      <BinanceHelp />
    </article>
    </div>
  </div>
</template>
