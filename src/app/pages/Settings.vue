<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { api, type SettingsDto } from "@/app/api";

const message = useMessage();
const currencies = [
  { label: "CNY - 人民币", value: "CNY" },
  { label: "USD - 美元", value: "USD" },
  { label: "EUR - 欧元", value: "EUR" },
  { label: "GBP - 英镑", value: "GBP" },
  { label: "TWD - 新台币", value: "TWD" },
];

const bannerRules = {
  maxBytes: 10 * 1024 * 1024,
  maxDimensionSum: 10000,
  maxRatio: 20,
  minHeight: 300,
  minWidth: 600,
};

const settings = ref<SettingsDto>({} as SettingsDto);
const bannerUploading = ref(false);
const bannerRestoring = ref(false);
const bannerVersion = ref(Date.now());

const bannerSrc = computed(() => `/banner.webp?v=${bannerVersion.value}`);
const usdtRate = computed(() => settings.value.rate_preview?.items?.find((item) => item.currency === "USDT"));

async function load() {
  settings.value = await api.settings.get();
  bannerVersion.value = Date.now();
}

async function save() {
  const saved = await api.settings.save({
    currency: settings.value.currency,
    domain: settings.value.domain,
    fast_confirm: settings.value.fast_confirm,
    rate_adjust: settings.value.rate_adjust,
    timeout: settings.value.timeout,
  });
  settings.value = saved;
  await refreshPreview();
  message.success("设置已保存");
}

async function refreshPreview() {
  if (!settings.value.currency) return;
  settings.value.rate_preview = await api.settings.rates({
    currency: settings.value.currency,
    rate_adjust: settings.value.rate_adjust,
  });
}

function rateText(value?: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "--";
  if (amount >= 1000) return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 2 });
  return amount.toLocaleString("en-US", { maximumFractionDigits: 6, minimumFractionDigits: 4 });
}

async function uploadBanner(options: { file: { file?: File | null }; onError?: () => void; onFinish?: () => void }) {
  const file = options.file.file;
  if (!file) return;
  let image: Blob;
  try {
    image = await toWebp(file);
  } catch (error) {
    message.error(error instanceof Error ? error.message : "Banner 上传失败");
    options.onError?.();
    return;
  }

  bannerUploading.value = true;
  try {
    await api.banner.upload(await image.arrayBuffer());
    message.success("Banner 已保存");
    bannerVersion.value = Date.now();
    options.onFinish?.();
  } catch {
    options.onError?.();
  } finally {
    bannerUploading.value = false;
  }
}

async function restoreBanner() {
  bannerRestoring.value = true;
  try {
    await api.banner.restore();
    bannerVersion.value = Date.now();
    message.success("已恢复默认 Banner");
  } finally {
    bannerRestoring.value = false;
  }
}

async function toWebp(file: File) {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const ratio = Math.max(width / height, height / width);
  if (width < bannerRules.minWidth || height < bannerRules.minHeight) {
    bitmap.close();
    throw new Error(`Banner 最低尺寸为 ${bannerRules.minWidth} x ${bannerRules.minHeight}`);
  }
  if (width + height > bannerRules.maxDimensionSum || ratio > bannerRules.maxRatio) {
    bitmap.close();
    throw new Error("图片尺寸不符合 Telegram 发送要求");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理图片");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("图片转换失败");
  if (blob.size > bannerRules.maxBytes) throw new Error("Banner 文件大小不能超过 10 MB");
  return blob;
}

watch(
  () => [settings.value.currency, settings.value.rate_adjust] as const,
  (_value, _oldValue, cleanup) => {
    const timer = setTimeout(() => {
      void refreshPreview();
    }, 350);
    cleanup(() => clearTimeout(timer));
  },
);

onMounted(load);
</script>

<template>
  <div class="grid">
    <div class="section-title"><h2>设置</h2></div>
    <div class="panel grid">
      <div class="section-title"><h2>站点</h2></div>
      <div class="form-grid two">
        <label class="field-stack">
          <span>站点地址</span>
          <n-input v-model:value="settings.domain" placeholder="https://example.com" />
        </label>
      </div>
    </div>
    <div class="panel grid">
      <div class="section-title"><h2>货币</h2></div>
      <div class="form-grid two">
        <label class="field-stack">
          <span>基础货币</span>
          <n-select v-model:value="settings.currency" :options="currencies" />
          <small>系统基础货币，作为换算、统计及下单的默认货币</small>
        </label>
        <label class="field-stack">
          <span>汇率微调</span>
          <n-input-number v-model:value="settings.rate_adjust" :max="200" :min="-99" placeholder="如 1 或 -0.5" :step="0.1">
            <template #suffix>%</template>
          </n-input-number>
          <small>调整法币与目标币种的汇率。值越大，兑换比例越大。</small>
        </label>
      </div>
      <div class="rate-preview-box">
        <div>
          <span class="muted">汇率预览</span>
          <strong>{{ rateText(usdtRate?.effective_rate) }} {{ settings.currency || 'CNY' }} ≈ 1 USDT</strong>
        </div>
        <p v-if="Number(settings.rate_adjust)" class="muted">
          原始汇率 {{ rateText(usdtRate?.market_rate) }} {{ settings.currency || 'CNY' }} ≈ 1 USDT
        </p>
        <p v-if="settings.rate_preview?.message" class="muted">{{ settings.rate_preview.message }}</p>
      </div>
    </div>
    <div class="panel grid">
      <div class="section-title"><h2>交易检测</h2></div>
      <n-form class="settings-form" label-placement="top" :model="settings" :show-require-mark="false">
        <n-grid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="12">
          <n-form-item-gi label="订单超时" path="timeout" :show-feedback="false">
            <div class="setting-form-control">
              <n-input-number v-model:value="settings.timeout" :max="30" :min="1" placeholder="30">
                <template #suffix>分钟</template>
              </n-input-number>
              <small>有效范围 1 - 30 分钟。</small>
            </div>
          </n-form-item-gi>
          <n-form-item-gi label="快速确认" path="fast_confirm" :show-feedback="false">
            <div class="setting-form-control">
              <div class="setting-switch-control">
                <n-switch v-model:value="settings.fast_confirm" />
              </div>
              <small>不等待目标网络交易确认区块数达到安全值。可提升交易确认速度，风险性较低。</small>
            </div>
          </n-form-item-gi>
        </n-grid>
      </n-form>
      <n-button type="primary" @click="save">保存设置</n-button>
    </div>
    <div class="panel grid">
      <div class="section-title"><h2>Banner</h2></div>
      <n-upload accept="image/*" :custom-request="uploadBanner" :max="1" :show-file-list="false">
        <div class="banner-upload-frame">
          <img class="banner-preview" :src="bannerSrc" alt="HashPay banner" />
          <div class="banner-upload-overlay">
            <n-button :loading="bannerUploading" type="primary">{{ bannerUploading ? '正在上传' : '上传图片' }}</n-button>
            <span>点击或拖拽图片到这里</span>
          </div>
        </div>
      </n-upload>
      <p class="banner-guideline">推荐比例 2:1，建议 1080 x 540，最低 600 x 300。图片会用于 Telegram 收款消息。</p>
      <div class="form-actions">
        <n-button :loading="bannerRestoring" secondary @click="restoreBanner">恢复默认</n-button>
      </div>
    </div>
  </div>
</template>
