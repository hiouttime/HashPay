<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive } from "vue";
import { useRouter } from "vue-router";
import OrderModal from "@/app/components/OrderModal.vue";
import OrderRow from "@/app/components/OrderRow.vue";
import OverviewTrend from "@/app/components/OverviewTrend.vue";
import { api, type DashboardDto, type SettingsDto } from "@/app/api";
import { useI18n } from "@/app/i18n";

const router = useRouter();
const { t } = useI18n();

const view = reactive<{
  loading: boolean;
  order: string | null;
  settings: SettingsDto | null;
  stats: DashboardDto | null;
}>({
  loading: false,
  order: null,
  settings: null,
  stats: null,
});
let autoLoad: ReturnType<typeof setInterval> | undefined;

const hour = new Date().getHours();
const greeting = computed(() => hour < 12 ? t("overview.greeting.morning") : hour < 18 ? t("overview.greeting.afternoon") : t("overview.greeting.evening"));

const health = computed(() =>
  (view.stats?.paymentHealth ?? [])
    .filter((item) => item.status === "warn")
    .map((item) => ({
      details: t(item.details),
      label: `#${item.id} ${item.name}`,
    })),
);

const orderVisible = computed({
  get: () => Boolean(view.order),
  set: (show) => {
    if (!show) view.order = null;
  },
});

async function load() {
  if (view.loading) return;
  view.loading = true;
  try {
    const [nextStats, nextConfig] = await Promise.all([
      api.dashboard.get(),
      view.settings ? Promise.resolve(view.settings) : api.settings.get(),
    ]);
    view.stats = nextStats;
    view.settings = nextConfig;
  } finally {
    view.loading = false;
  }
}

onMounted(() => {
  void load();
  autoLoad = setInterval(() => void load(), 3000);
});

onBeforeUnmount(() => {
  if (autoLoad) clearInterval(autoLoad);
});
</script>

<template>
  <div class="overview-page grid">
    <div class="section-title overview-title">
      <div>
        <h2>{{ greeting }}</h2>
        <p class="muted">{{ t('overview.welcome') }}</p>
      </div>
      <n-space align="end" vertical :size="4">
        <n-button :loading="view.loading" secondary type="primary" @click="load">{{ t('overview.refresh') }}</n-button>
        <small class="muted">{{ t('overview.auto_refresh') }}</small>
      </n-space>
    </div>

    <section class="overview-summary">
      <OverviewTrend
        :currency="view.settings?.currency"
        :pending="view.stats?.orderCounts.pending ?? 0"
        :trends="view.stats?.trends"
      />
    </section>

    <div class="overview-columns">
      <section class="panel overview-panel">
        <div class="section-title">
          <h2>{{ t('overview.action_required') }}</h2>
        </div>
        <n-empty class="overview-empty" :description="t('overview.no_actions')" />
      </section>

      <section class="panel overview-panel">
        <div class="section-title">
          <h2>{{ t('overview.system_health') }}</h2>
          <n-button text type="primary" @click="load">{{ t('setup.recheck') }}</n-button>
        </div>
        <n-empty v-if="!health.length" class="overview-empty" :description="t('overview.no_health')" />
        <div v-else class="overview-health-list">
          <div v-for="item in health" :key="item.label" class="overview-health-item">
            <div>
              <strong>{{ item.label }}</strong>
              <small>{{ item.details }}</small>
            </div>
            <span class="order-status is-warning">{{ t('overview.warning') }}</span>
          </div>
        </div>
      </section>
    </div>

    <div class="overview-single-column">
      <section class="panel overview-panel">
        <div class="section-title">
          <h2>{{ t('overview.recent_orders') }}</h2>
          <n-button text type="primary" @click="router.push('/admin/orders')">{{ t('overview.view_all') }}</n-button>
        </div>
        <n-empty v-if="!view.stats?.recentOrders?.length" :description="t('overview.no_recent_orders')" />
        <div v-else class="orders-table overview-orders-table">
          <div class="orders-table-head order-row--plain">
            <span>{{ t('orders.column.order') }}</span>
            <span>{{ t('orders.column.status') }}</span>
            <span>{{ t('orders.column.amount') }}</span>
            <span>{{ t('orders.column.payment') }}</span>
            <span>{{ t('orders.column.created_at') }}</span>
          </div>
          <OrderRow
            v-for="order in view.stats.recentOrders"
            :key="order.id"
            compact
            :order="order"
            @open="view.order = $event"
          />
        </div>
      </section>
    </div>
    <OrderModal
      v-model:show="orderVisible"
      :order-id="view.order"
      @changed="load"
      @deleted="load"
    />
  </div>
</template>
