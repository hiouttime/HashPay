<script setup lang="ts">
type SegmentedValue = string | number | boolean;

defineOptions({
  name: "NSegmented",
});

defineProps<{
  options: ReadonlyArray<{
    label: string;
    tag?: string;
    value: SegmentedValue;
  }>;
  size?: "small" | "medium" | "large";
  value: SegmentedValue;
}>();

defineEmits<{
  "update:value": [value: SegmentedValue];
}>();
</script>

<template>
  <n-radio-group
    class="n-segmented"
    :value="value"
    :size="size ?? 'medium'"
    @update:value="$emit('update:value', $event)"
  >
    <n-radio-button
      v-for="item in options"
      :key="String(item.value)"
      :value="item.value"
    >
      <span class="n-segmented-option">
        <span class="n-segmented-text">{{ item.label }}</span>
        <span v-if="item.tag" class="n-segmented-tag">{{ item.tag }}</span>
      </span>
    </n-radio-button>
  </n-radio-group>
</template>

<style scoped>
.n-segmented {
  --segmented-radius: 0.5rem;
  --segmented-divider-color: #e5e7eb;
  --segmented-divider-color-active: var(--n-button-border-color-active);
  --n-button-border-radius: var(--segmented-radius);

  display: flex;
  min-width: 0;
  width: 100%;
}

.n-segmented.n-radio-group--button-group {
  height: auto !important;
  line-height: normal !important;
}

.n-segmented :deep(.n-radio-button) {
  align-items: center;
  display: flex !important;
  flex: 1 1 0;
  height: auto !important;
  justify-content: center;
  line-height: 1.2 !important;
  min-height: var(--n-height);
  min-width: 0;
  overflow: hidden;
  padding-block: 0.22rem !important;
  text-align: center;
}

.n-segmented :deep(.n-radio__label) {
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
  text-align: center;
}

.n-segmented-option {
  display: inline-grid;
  gap: 0.12rem;
  justify-items: center;
  max-width: 100%;
  min-width: 0;
}

.n-segmented-text {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.n-segmented-tag {
  background: #f0fdf4;
  border-radius: 999px;
  color: #15803d;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.12rem 0.4rem;
}

.n-segmented :deep(.n-radio-group__splitor) {
  align-self: stretch;
  background: var(--segmented-divider-color);
  height: auto !important;
  margin: 0;
}

.n-segmented :deep(.n-radio-button--checked + .n-radio-group__splitor),
.n-segmented :deep(.n-radio-group__splitor:has(+ .n-radio-button--checked)) {
  background: var(--segmented-divider-color-active);
}

.n-segmented :deep(.n-radio-button:first-child),
.n-segmented :deep(.n-radio-button:first-child .n-radio-button__state-border) {
  border-bottom-left-radius: var(--segmented-radius) !important;
  border-top-left-radius: var(--segmented-radius) !important;
}

.n-segmented :deep(.n-radio-button:last-child),
.n-segmented :deep(.n-radio-button:last-child .n-radio-button__state-border) {
  border-bottom-right-radius: var(--segmented-radius) !important;
  border-top-right-radius: var(--segmented-radius) !important;
}
</style>
