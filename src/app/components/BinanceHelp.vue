<script setup lang="ts">
import { useI18n } from "@/app/i18n";

const { t } = useI18n();
const settingRows = [
  ["sliders", "支付顺序"],
  ["card", "代扣"],
  ["clock", "我的支付限额"],
  ["sliders", "更改支付 PIN 码"],
  ["bolt", "免密支付"],
  ["bell", "支付通知首选项"],
  ["spark", "AI 支付限额"],
  ["help", "帮助中心"],
] as const;
</script>

<template>
  <svg class="bn-defs" aria-hidden="true">
    <symbol id="bn-back" viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" /></symbol>
    <symbol id="bn-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></symbol>
    <symbol id="bn-scan" viewBox="0 0 24 24"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /></symbol>
    <symbol id="bn-chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></symbol>
    <symbol id="bn-headphones" viewBox="0 0 24 24"><path d="M5 13a7 7 0 0 1 14 0" /><path d="M5 13v4a2 2 0 0 0 2 2h1v-6H7a2 2 0 0 0-2 2zM19 13v4a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z" /></symbol>
    <symbol id="bn-chat" viewBox="0 0 24 24"><path d="M6 6h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-3H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" /></symbol>
    <symbol id="bn-sliders" viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" /><circle cx="9" cy="7" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="11" cy="17" r="1.6" /></symbol>
    <symbol id="bn-card" viewBox="0 0 24 24"><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M3.5 10h17M8 15h3" /></symbol>
    <symbol id="bn-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></symbol>
    <symbol id="bn-bolt" viewBox="0 0 24 24"><path d="M13 3 6 13h5l-1 8 8-12h-5z" /></symbol>
    <symbol id="bn-bell" viewBox="0 0 24 24"><path d="M6 16h12l-1.2-2.2V10a4.8 4.8 0 0 0-9.6 0v3.8z" /><path d="M10 17a2 2 0 0 0 4 0" /></symbol>
    <symbol id="bn-spark" viewBox="0 0 24 24"><path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9z" /><path d="m17.5 15 .7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></symbol>
    <symbol id="bn-help" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6V14" /><path d="M12 17h.01" /></symbol>
    <symbol id="bn-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></symbol>
    <symbol id="bn-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="m8 12.2 2.6 2.6L16.2 9.2" /></symbol>
    <symbol id="bn-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></symbol>
  </svg>

  <div class="bn-lead">
    <p class="bn-intro">{{ t("help.binance.summary") }}</p>
    <p class="bn-intro">{{ t("help.binance.intro2") }}</p>
    <p class="bn-intro">{{ t("help.binance.intro3") }}</p>
  </div>

  <section class="help-section bn-step">
    <h3>{{ t("help.binance.step1") }}</h3>
    <div class="bn-phone">
      <div class="bn-home">
        <span class="bn-home-side">
          <span class="bn-avatar" aria-hidden="true"><i></i></span>
          <svg class="bn-ico"><use href="#bn-headphones" /></svg>
        </span>
        <div class="bn-seg">
          <span class="is-on">交易平台</span>
          <span>钱包</span>
        </div>
        <span class="bn-home-side is-end">
          <svg class="bn-glyph is-target" viewBox="0 0 54 48" aria-label="支付">
            <path fill="currentColor" d="M28 29.7 27.3 27.3 27 24 25 20 22.3 17.7 19.3 18 16.3 21 14 25 11.7 28.7 9.7 30 9 28.7 10 25 12 21 14.7 17.3 18 14.7 22 12.3 25.7 9.7 29.3 6.7 33 4.3 37 3.3 41 3.7 45 5.3 48.3 8.3 50.3 12 51 16 50.3 20 49.3 24 47.7 28 45.7 32 42.7 36 39.3 40 35.7 43.3 32 45.3 28 46 24 46 20 46 16 46 14 45 14.7 44 18 43 22 43 26 43 30 42.7 33.7 41 37 38 40 34 42.7 30 43 27 41 26.7 37 28.3 33 30.3 29.3 30.7Z" />
          </svg>
          <svg class="bn-ico"><use href="#bn-chat" /></svg>
        </span>
      </div>
      <div class="bn-search">
        <svg class="bn-ico"><use href="#bn-search" /></svg>
        <span>搜索内容</span>
        <svg class="bn-ico"><use href="#bn-scan" /></svg>
      </div>
    </div>
    <p class="bn-note" v-html="t('help.binance.step1_note')"></p>
  </section>

  <section class="help-section bn-step">
    <h3>{{ t("help.binance.step2") }}</h3>
    <p class="bn-note">{{ t("help.binance.step2_settings") }}</p>
    <div class="bn-phone">
      <div class="bn-nav">
        <svg class="bn-ico"><use href="#bn-back" /></svg>
        <strong>支付</strong>
        <span class="bn-nav-tools">
          <svg class="bn-ico"><use href="#bn-scan" /></svg>
          <svg class="bn-set is-target" viewBox="0 0 24 24" aria-label="设置">
            <path d="M12 2.3 20.7 7.3v9.4L12 21.7 3.3 16.7V7.3z" />
            <path class="bn-set-core" d="M12 8.2 15.4 12 12 15.8 8.6 12z" />
          </svg>
        </span>
      </div>
      <div class="bn-search">
        <span class="bn-fire" aria-hidden="true">🔥</span>
        <span>搜索</span>
        <svg class="bn-ico"><use href="#bn-search" /></svg>
      </div>
    </div>
    <p class="bn-note">{{ t("help.binance.step2_limit") }}</p>
    <div class="bn-phone">
      <h4 class="bn-screen-title">支付设置</h4>
      <div v-for="[icon, label] in settingRows" :key="label" class="bn-row" :class="{ 'is-target': icon === 'spark' }">
        <svg class="bn-ico"><use :href="`#bn-${icon}`" /></svg>
        <span>{{ label }}</span>
        <svg class="bn-ico bn-chevron"><use href="#bn-chevron" /></svg>
      </div>
    </div>
  </section>

  <section class="help-section bn-step">
    <h3>{{ t("help.binance.step3") }}</h3>
    <div class="bn-phone bn-dim">
      <div class="bn-dialog">
        <h4>需要生成 API 密钥</h4>
        <p>请生成 API 密钥以完成 AI Agent 支付限额设置，点击 <em>此处</em> 查看详情。</p>
        <div class="bn-ok is-target">好的</div>
      </div>
    </div>
    <div class="bn-phone">
      <div class="bn-done">
        <svg class="bn-check" viewBox="0 0 24 24" aria-hidden="true"><use href="#bn-check" /></svg>
        <h4>密钥已生成</h4>
      </div>
      <div class="bn-warn">
        <svg class="bn-ico"><use href="#bn-info" /></svg>
        <p>请立即复制您的 API 密钥和私钥。出于安全考虑，这些信息将不会再次显示！</p>
      </div>
      <p class="bn-label">API 密钥</p>
      <div class="bn-key is-target"><span>a1b2c3d4e5f6g7h8i9j0k1l2m3n4...</span><svg class="bn-ico"><use href="#bn-copy" /></svg></div>
      <p class="bn-label">私钥 <i>私密</i></p>
      <div class="bn-key is-target"><span>z9y8x7w6v5u4t3s2r1q0p9o8n7m6...</span><svg class="bn-ico"><use href="#bn-copy" /></svg></div>
      <div class="bn-copied">密钥已安全复制</div>
    </div>
    <p class="bn-note">{{ t("help.binance.step3_fill") }}</p>
  </section>

  <section class="help-section bn-step">
    <h3>{{ t("help.binance.step4") }}</h3>
    <div class="bn-phone">
      <div class="bn-limit-head">
        <h4>我的限额</h4>
        <span>更新</span>
      </div>
      <div class="bn-card">
        <div class="bn-line"><span>单笔交易限额</span><b class="is-target">0 USDT</b></div>
        <div class="bn-line"><span>每日限额</span><b class="is-target">0 USDT</b></div>
        <div class="bn-bar"></div>
        <div class="bn-foot"><span>已使用：0 USDT</span><span>剩余：0 USDT</span></div>
      </div>
    </div>
    <p class="bn-note">{{ t("help.binance.step4_note") }}</p>
  </section>
</template>
