<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive } from "vue";
import { useRouter } from "vue-router";
import OrderDetailModal from "@/app/components/OrderDetailModal.vue";
import OrderRow from "@/app/components/OrderRow.vue";
import OverviewTrend from "@/app/components/OverviewTrend.vue";
import { api, type DashboardDto, type SettingsDto } from "@/app/api";

const router = useRouter();

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
const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

const health = computed(() =>
  (view.stats?.paymentHealth ?? [])
    .filter((item) => item.status === "warn")
    .map((item) => ({
      details: item.details,
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
        <p class="muted">欢迎使用 HashPay</p>
      </div>
      <n-space align="end" vertical :size="4">
        <n-button :loading="view.loading" secondary type="primary" @click="load">刷新数据</n-button>
        <small class="muted">每 3 秒自动刷新</small>
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
          <h2>需要操作</h2>
        </div>
        <n-empty class="overview-empty" description="暂无需要处理的事项" />
      </section>

      <section class="panel overview-panel">
        <div class="section-title">
          <h2>系统健康</h2>
          <n-button text type="primary" @click="load">重新检查</n-button>
        </div>
        <n-empty v-if="!health.length" class="overview-empty" description="暂无通道异常" />
        <div v-else class="overview-health-list">
          <div v-for="item in health" :key="item.label" class="overview-health-item">
            <div>
              <strong>{{ item.label }}</strong>
              <small>{{ item.details }}</small>
            </div>
            <span class="order-status is-warning">注意</span>
          </div>
        </div>
      </section>
    </div>

    <div class="overview-single-column">
      <section class="panel overview-panel">
        <div class="section-title">
          <h2>最近订单</h2>
          <n-button text type="primary" @click="router.push('/admin/orders')">查看全部</n-button>
        </div>
        <n-empty v-if="!view.stats?.recentOrders?.length" description="暂无最近订单" />
        <div v-else class="orders-table overview-orders-table">
          <div class="orders-table-head order-row--plain">
            <span>订单</span>
            <span>状态</span>
            <span>金额</span>
            <span>收款方式</span>
            <span>创建时间</span>
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
    <OrderDetailModal
      v-model:show="orderVisible"
      :order-id="view.order"
      @changed="load"
      @deleted="load"
    />
  </div>
</template>
