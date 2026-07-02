<script setup lang="ts">
import { useMessage } from "naive-ui";
import { useRouter } from "vue-router";
import { api } from "@/app/api";

const { loading } = defineProps<{
  loading: boolean;
}>();

const emit = defineEmits<{
  "update:loading": [value: boolean];
}>();

const message = useMessage();
const router = useRouter();

async function createTest() {
  emit("update:loading", true);
  try {
    const result = await api.orders.test();
    message.success("测试订单已创建");
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
    生成测试订单
  </n-button>
</template>
