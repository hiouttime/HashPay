<template>
  <div id="app">
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </router-view>
    
    <van-tabbar v-if="showTabbar" v-model="activeTab" route>
      <van-tabbar-item name="dashboard" icon="chart-trending-o" to="/">
        仪表盘
      </van-tabbar-item>
      <van-tabbar-item name="orders" icon="orders-o" to="/orders">
        订单
      </van-tabbar-item>
      <van-tabbar-item name="payments" icon="credit-pay" to="/payments">
        支付
      </van-tabbar-item>
      <van-tabbar-item name="settings" icon="setting-o" to="/settings">
        设置
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeTab = ref('dashboard')

const showTabbar = computed(() => {
  const hiddenRoutes = ['/setup', '/login']
  return !hiddenRoutes.includes(route.path)
})
</script>

<style lang="scss">
#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  min-height: 100vh;
  background: #f7f8fa;
}

.van-tabbar {
  background: white;
  border-top: 1px solid #ebedf0;
}
</style>