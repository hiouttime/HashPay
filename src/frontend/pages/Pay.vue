<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useMessage } from "naive-ui";
import { api } from "@/frontend/services/api";

const route = useRoute();
const message = useMessage();
const data = ref<any>(null);
const selected = ref<any>(null);
const checking = ref(false);

const orderId = computed(() => String(route.params.id));

async function load() {
  data.value = await api(`/api/checkout/${orderId.value}`);
  selected.value = data.value.options?.[0] ?? null;
}

async function selectPayment() {
  if (!selected.value) return;
  await api(`/api/checkout/${orderId.value}/payment`, {
    body: JSON.stringify({ currency: selected.value.currency, payway: selected.value.payway }),
    method: "POST",
  });
  await load();
}

async function checkTron() {
  checking.value = true;
  try {
    const payment = data.value.order.payment;
    if (!payment?.address) throw new Error("请先选择 TRON 支付方式");
    const min = data.value.order.created_at * 1000;
    const url = `https://api.trongrid.io/v1/accounts/${payment.address}/transactions/trc20?limit=50&only_confirmed=true&min_timestamp=${min}`;
    const res = await fetch(url);
    const payload = (await res.json()) as { data?: any[] };
    const candidates = (payload.data ?? []).map((item: any) => ({
      amount: Number(item.value) / 10 ** Number(item.token_info?.decimals ?? 6),
      currency: item.token_info?.symbol,
      from: item.from,
      hash: item.transaction_id,
      raw: item,
      timestamp: Math.floor(item.block_timestamp / 1000),
      to: item.to,
    }));
    await api(`/api/checkout/${orderId.value}/tx-candidates`, {
      body: JSON.stringify({ candidates }),
      method: "POST",
    });
    message.success("已确认付款");
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : "无法自动确认");
  } finally {
    checking.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="shell">
    <div class="topbar">
      <div class="brand">HashPay Checkout</div>
      <span class="muted">{{ data?.merchant?.name || '' }}</span>
    </div>
    <main v-if="data" class="page pay-layout">
      <section class="panel grid">
        <div class="section-title">
          <h1>{{ data.order.amount }} {{ data.order.currency }}</h1>
          <n-tag :type="data.order.status === 'paid' ? 'success' : 'default'">{{ data.order.status }}</n-tag>
        </div>
        <n-select
          v-model:value="selected"
          :options="data.options.map((o:any) => ({ label: `${o.name} / ${o.network} / ${o.currency}`, value: o }))"
          value-field="value"
        />
        <n-button type="primary" @click="selectPayment">选择支付方式</n-button>
        <n-button :loading="checking" @click="checkTron">我已完成付款，自动检查</n-button>
      </section>
      <aside class="panel grid">
        <h2>付款信息</h2>
        <div v-if="data.order.payment?.driver">
          <p>网络：{{ data.order.payment.network }}</p>
          <p>币种：{{ data.order.payment.currency }}</p>
          <p>金额：{{ data.order.payment.amount }}</p>
          <p v-if="data.order.payment.address">地址：{{ data.order.payment.address }}</p>
          <p v-if="data.order.payment.account">账户：{{ data.order.payment.account }}</p>
          <p v-if="data.order.payment.memo">备注：{{ data.order.payment.memo }}</p>
          <p class="muted">{{ data.order.payment.instructions }}</p>
          <p v-if="data.order.payment.tx">交易：{{ data.order.payment.tx.hash }}</p>
        </div>
        <p v-else class="muted">请选择支付方式。</p>
      </aside>
    </main>
  </div>
</template>
