<script setup lang="ts">
import { useI18n } from "@/app/i18n";

const { locale, localeOptions, setLocale } = useI18n();
</script>

<template>
  <n-select
    class="locale-switch"
    size="small"
    :options="localeOptions"
    :value="locale"
    @update:value="setLocale"
  />
</template>

<style scoped>
.locale-switch {
  min-width: 8rem;
}
</style>
