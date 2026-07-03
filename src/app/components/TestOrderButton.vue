<script setup lang="ts">
import { useMessage } from "naive-ui";
import { useRouter } from "vue-router";
import { api } from "@/app/api";
import { useI18n } from "@/app/i18n";

const { loading } = defineProps<{
  loading: boolean;
}>();

const emit = defineEmits<{
  "update:loading": [value: boolean];
}>();

const message = useMessage();
const router = useRouter();
const { t } = useI18n();

async function createTest() {
  emit("update:loading", true);
  try {
    const result = await api.orders.test();
    message.success(t("orders.test_created"));
    await router.push(`/pay/${encodeURIComponent(result.order.id)}`);
  } catch {
    // API layer displays the error.
  } finally {
    emit("update:loading", false);
  }
}
</script>

<template>
  <n-button :loading="loading" type="primary" @click="createTest">
    {{ t('orders.test') }}
  </n-button>
</template>
