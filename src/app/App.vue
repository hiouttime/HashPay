<script setup lang="ts">
import { NConfigProvider, NMessageProvider } from "naive-ui";
</script>

<template>
  <n-config-provider>
    <n-message-provider>
      <router-view />
    </n-message-provider>
  </n-config-provider>
</template>
