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
  (response) => {
    const envelope = response.data || {}
    response.info = envelope.info || ''
    response.data = envelope.data
    return response
  },
  (error) => {
    error.apiError = error.response?.data?.error || error.message
    console.error('API Error:', error.response?.data || error.apiError)
    return Promise.reject(error)
  }
)

const wrapData = (payload) => ({ data: payload })

export const orderApi = {
  getCheckout: (orderId) => api.get(`/api/checkout/${orderId}`),
  selectPayment: (orderId, methodId, currency) => api.post(`/api/checkout/${orderId}/route`, wrapData({ method_id: methodId, currency })),
  checkStatus: (orderId) => api.get(`/api/checkout/${orderId}/status`),
}
