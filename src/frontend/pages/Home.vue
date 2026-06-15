<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/frontend/services/api";

const router = useRouter();

onMounted(async () => {
  const state = await api<{ installed: boolean }>("/api/state").catch(() => ({ installed: false }));
  await router.replace(state.installed ? "/admin" : "/setup");
});
</script>

<template>
  <div class="page">HashPay 正在加载</div>
</template>
