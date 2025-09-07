import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initTelegram } from './utils/telegram'
import './styles/main.scss'

// 初始化 Telegram Mini App
initTelegram()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

app.mount('#app')