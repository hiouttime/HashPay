<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const scrollTop = ref(0);
const viewportHeight = ref(0);
const scrollHeight = ref(0);
const dragging = ref(false);
const scrollbarVisible = ref(false);
const trackTop = ref(10);
const trackHeight = ref(0);
const scrollTarget = shallowRef<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | undefined;
let hideScrollbarTimer: ReturnType<typeof setTimeout> | undefined;

const canScroll = computed(() => scrollHeight.value > viewportHeight.value + 1);
const thumbHeight = computed(() => {
  if (!canScroll.value) return 0;
  const ratio = viewportHeight.value / scrollHeight.value;
  return Math.max(42, Math.round(trackHeight.value * ratio));
});
const thumbTop = computed(() => {
  if (!canScroll.value) return 0;
  const maxScroll = scrollHeight.value - viewportHeight.value;
  const maxTop = trackHeight.value - thumbHeight.value;
  return Math.round((scrollTop.value / maxScroll) * maxTop);
});

function updateScrollState() {
  const target = resolveScrollTarget();
  scrollTarget.value = target;
  if (isDocumentScroll(target)) {
    scrollTop.value = window.scrollY || target.scrollTop || 0;
    viewportHeight.value = window.innerHeight;
    scrollHeight.value = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    trackTop.value = 10;
    trackHeight.value = Math.max(0, window.innerHeight - 20);
    return;
  }
  const rect = target.getBoundingClientRect();
  scrollTop.value = target.scrollTop;
  viewportHeight.value = target.clientHeight;
  scrollHeight.value = target.scrollHeight;
  trackTop.value = Math.max(10, Math.round(rect.top + 10));
  trackHeight.value = Math.max(0, Math.round(Math.min(rect.height - 20, window.innerHeight - trackTop.value - 10)));
}

function showScrollbar() {
  scrollbarVisible.value = true;
  if (hideScrollbarTimer) clearTimeout(hideScrollbarTimer);
  if (dragging.value) return;
  hideScrollbarTimer = setTimeout(() => {
    if (!dragging.value) scrollbarVisible.value = false;
  }, 900);
}

function keepScrollbarVisible() {
  scrollbarVisible.value = true;
  if (hideScrollbarTimer) clearTimeout(hideScrollbarTimer);
}

function scheduleScrollbarHide() {
  if (hideScrollbarTimer) clearTimeout(hideScrollbarTimer);
  hideScrollbarTimer = setTimeout(() => {
    if (!dragging.value) scrollbarVisible.value = false;
  }, 700);
}

function handleScroll() {
  updateScrollState();
  showScrollbar();
}

function handleThumbPointerDown(event: PointerEvent) {
  const target = scrollTarget.value;
  if (!target || !canScroll.value) return;
  event.preventDefault();
  dragging.value = true;
  keepScrollbarVisible();
  const startY = event.clientY;
  const startScroll = scrollTop.value;
  const maxScroll = scrollHeight.value - viewportHeight.value;
  const maxTop = trackHeight.value - thumbHeight.value;
  if (maxTop <= 0) return;

  const move = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientY - startY;
    const top = startScroll + (delta / maxTop) * maxScroll;
    if (isDocumentScroll(target)) window.scrollTo({ top });
    else target.scrollTop = top;
  };
  const up = () => {
    dragging.value = false;
    scheduleScrollbarHide();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

function resolveScrollTarget() {
  const root = document.scrollingElement as HTMLElement | null;
  const candidates = [
    root,
    ...Array.from(document.querySelectorAll<HTMLElement>(".n-layout-scroll-container")),
  ].filter((item): item is HTMLElement => {
    if (!item || item.scrollHeight <= item.clientHeight + 1) return false;
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  });
  return candidates.sort((left, right) => visibleArea(right) - visibleArea(left))[0] ?? document.documentElement;
}

function visibleArea(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  return height * width;
}

function isDocumentScroll(element: HTMLElement) {
  return element === document.documentElement || element === document.body || element === document.scrollingElement;
}

onMounted(() => {
  updateScrollState();
  window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
  window.addEventListener("resize", updateScrollState);
  resizeObserver = new ResizeObserver(updateScrollState);
  resizeObserver.observe(document.body);
  resizeObserver.observe(document.documentElement);
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", handleScroll, { capture: true });
  window.removeEventListener("resize", updateScrollState);
  resizeObserver?.disconnect();
  if (hideScrollbarTimer) clearTimeout(hideScrollbarTimer);
});

watch(() => route.fullPath, () => {
  void nextTick(updateScrollState);
});
</script>

<template>
  <n-config-provider>
    <n-message-provider>
      <router-view />
      <div
        v-if="canScroll"
        class="app-scrollbar"
        :class="{ 'is-dragging': dragging, 'is-visible': scrollbarVisible }"
        :style="{ top: `${trackTop}px`, height: `${trackHeight}px` }"
        aria-hidden="true"
        @pointerenter="keepScrollbarVisible"
        @pointerleave="scheduleScrollbarHide"
      >
        <button
          class="app-scrollbar-thumb"
          type="button"
          :style="{ height: `${thumbHeight}px`, transform: `translateY(${thumbTop}px)` }"
          tabindex="-1"
          @pointerdown="handleThumbPointerDown"
        />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>
