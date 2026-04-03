import axios from 'axios'

export const api = axios.create({
  baseURL: '',
  timeout: 30000,
})

// 请求拦截器 - 添加 Telegram 认证信息
api.interceptors.request.use((config) => {
  if (window.Telegram?.WebApp?.initData) {
    config.headers['X-Tg-Init-Data'] = window.Telegram.WebApp.initData
  }
  return config
})

// 响应拦截器
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export const orderApi = {
  getCheckout: (orderId) => api.get(`/api/checkout/${orderId}`),
  selectPayment: (orderId, methodId, currency) => api.post(`/api/checkout/${orderId}/route`, { method_id: methodId, currency }),
  checkStatus: (orderId) => api.get(`/api/checkout/${orderId}/status`),
}
