<template>
  <div class="dashboard">
    <van-nav-bar title="仪表盘" />
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ stats.todayAmount }}</div>
        <div class="stat-label">今日金额 (CNY)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.todayOrders }}</div>
        <div class="stat-label">今日订单</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.successRate }}%</div>
        <div class="stat-label">成功率</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.pendingOrders }}</div>
        <div class="stat-label">待支付</div>
      </div>
    </div>
    
    <van-cell-group title="快捷操作" inset>
      <van-cell title="快速收款" is-link @click="quickPay" />
      <van-cell title="添加支付方式" is-link to="/payments" />
      <van-cell title="查看所有订单" is-link to="/orders" />
    </van-cell-group>
    
    <van-cell-group title="最近订单" inset>
      <van-cell 
        v-for="order in recentOrders" 
        :key="order.id"
        :title="`订单 ${order.id.slice(0, 10)}...`"
        :label="`${order.amount} ${order.currency} - ${formatTime(order.created_at)}`"
        :value="getStatusText(order.status)"
        @click="goToOrder(order.id)"
      />
      <van-empty v-if="recentOrders.length === 0" description="暂无订单" />
    </van-cell-group>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showDialog } from 'vant'
import { api } from '../utils/api'
import dayjs from 'dayjs'

const router = useRouter()

const stats = ref({
  todayAmount: '0.00',
  todayOrders: 0,
  successRate: 0,
  pendingOrders: 0
})

const recentOrders = ref([])

onMounted(() => {
  loadStats()
  loadRecentOrders()
})

async function loadStats() {
  try {
    const res = await api.get('/internal/stats')
    stats.value = res.data
  } catch (err) {
    console.error(err)
  }
}

async function loadRecentOrders() {
  try {
    const res = await api.get('/internal/orders?limit=5')
    recentOrders.value = res.data || []
  } catch (err) {
    console.error(err)
  }
}

async function quickPay() {
  const result = await showDialog.confirm({
    title: '快速收款',
    message: '请输入收款金额',
    showCancelButton: true,
    inputPattern: /^\d+(\.\d{1,2})?$/,
    showInput: true,
    inputPlaceholder: '输入金额 (CNY)'
  })
  
  if (result === 'confirm') {
    try {
      const amount = parseFloat(showDialog.inputValue)
      const res = await api.post('/internal/orders', {
        amount,
        currency: 'CNY'
      })
      
      showToast({
        type: 'success',
        message: '订单创建成功'
      })
      
      router.push(`/orders/${res.data.id}`)
    } catch (err) {
      showToast({
        type: 'fail',
        message: '创建失败'
      })
    }
  }
}

function goToOrder(id) {
  router.push(`/orders/${id}`)
}

function getStatusText(status) {
  const statusMap = {
    0: '待支付',
    1: '已支付',
    2: '已过期',
    3: '失败'
  }
  return statusMap[status] || '未知'
}

function formatTime(timestamp) {
  return dayjs.unix(timestamp).format('MM-DD HH:mm')
}
</script>

<style lang="scss" scoped>
.dashboard {
  padding-bottom: 60px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 12px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  
  .stat-value {
    font-size: 24px;
    font-weight: bold;
    color: #333;
    margin-bottom: 4px;
  }
  
  .stat-label {
    font-size: 12px;
    color: #999;
  }
}
</style>