<script lang="ts">
import sprite from "../../../public/icons.svg?raw";

if (!document.getElementById("icon-sprite")) {
  const host = document.createElement("div");
  host.id = "icon-sprite";
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  host.innerHTML = sprite;
  host.querySelector("svg")!.removeAttribute("style");
  document.body.appendChild(host);
}
</script>

<script setup lang="ts">
withDefaults(defineProps<{
  label?: string;
  name: string;
}>(), {
  label: "",
});
</script>

<template>
  <svg :aria-hidden="label ? undefined : 'true'" :aria-label="label || undefined" role="img">
    <use :href="`#${name}`" />
  </svg>
</template>
