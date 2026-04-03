import axios from 'axios'

const api = axios.create({
  baseURL: '',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    const initData = window.Telegram?.WebApp?.initData
    if (initData) {
      config.headers['X-Tg-Init-Data'] = initData
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  response => {
    return response
  },
  error => {
    if (error.response?.status === 401) {
      // 未授权，可能需要重新登录
      window.Telegram?.WebApp?.showAlert('认证失败，请重新登录')
    }
    return Promise.reject(error)
  }
)

export default api

export const setupApi = {
  status: () => api.get('/api/setup/status'),
  submit: (payload) => api.post('/api/setup/config', payload),
}

export const adminApi = {
  dashboard: () => api.get('/api/admin/dashboard'),
  settings: () => api.get('/api/admin/settings'),
  saveSettings: (payload) => api.put('/api/admin/settings', payload),
  uploadBanner: (payload) => api.post('/api/admin/banner', payload, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  orders: (params = '') => api.get(`/api/admin/orders${params}`),
  order: (id) => api.get(`/api/admin/orders/${id}`),
  paymentCatalog: () => api.get('/api/admin/payments/catalog'),
  paymentMethods: () => api.get('/api/admin/payments'),
  savePaymentMethod: (id, payload) => id
    ? api.put(`/api/admin/payments/${id}`, payload)
    : api.post('/api/admin/payments', payload),
  deletePaymentMethod: (id) => api.delete(`/api/admin/payments/${id}`),
  merchants: () => api.get('/api/admin/merchants'),
  saveMerchant: (id, payload) => id
    ? api.put(`/api/admin/merchants/${id}`, payload)
    : api.post('/api/admin/merchants', payload),
  deleteMerchant: (id) => api.delete(`/api/admin/merchants/${id}`),
}
