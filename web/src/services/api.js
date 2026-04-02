import axios from 'axios'

const api = axios.create({
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

// API 方法封装
export const orderApi = {
  getPaymentMethods: (orderId) => api.get(`/api/order/${orderId}/payment-methods`),
  selectPayment: (orderId, methodId) => api.post(`/api/order/${orderId}/select-payment`, { method_id: methodId }),
  checkStatus: (orderId) => api.get(`/api/order/${orderId}/status`),
}

export const adminApi = {
  getStats: () => api.get('/api/admin/stats'),
  getConfig: () => api.get('/api/admin/config'),
  updateConfig: (config) => api.put('/api/admin/config', config),
  getPayments: () => api.get('/api/admin/payments'),
  addPayment: (payment) => api.post('/api/admin/payments', payment),
  updatePayment: (id, payment) => api.put(`/api/admin/payments/${id}`, payment),
  deletePayment: (id) => api.delete(`/api/admin/payments/${id}`),
  togglePayment: (id, enabled) => api.patch(`/api/admin/payments/${id}/toggle`, { enabled }),
}

export const initApi = {
  getStatus: () => api.get('/api/status'),
  submitConfig: (config) => api.post('/api/config', config),
}

export { api }
