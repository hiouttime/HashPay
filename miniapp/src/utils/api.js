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
    const envelope = response.data || {}
    response.info = envelope.info || ''
    response.data = envelope.data
    return response
  },
  error => {
    error.apiError = error.response?.data?.error || error.message
    if (error.response?.status === 401) {
      // 未授权，可能需要重新登录
      window.Telegram?.WebApp?.showAlert(error.apiError || '认证失败，请重新登录')
    }
    return Promise.reject(error)
  }
)

const wrapData = (payload) => ({ data: payload })

export default api

export const adminApi = {
  submitInstall: (payload) => api.post('/api/admin/install', wrapData(payload)),
  dashboard: () => api.get('/api/admin/dashboard'),
  settings: () => api.get('/api/admin/settings'),
  saveSettings: (payload) => api.put('/api/admin/settings', wrapData(payload)),
  uploadBanner: (payload) => api.post('/api/admin/banner', payload, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  orders: (params = '') => api.get(`/api/admin/orders${params}`),
  order: (id) => api.get(`/api/admin/orders/${id}`),
  paymentCatalog: () => api.get('/api/admin/payments/catalog'),
  paymentMethods: () => api.get('/api/admin/payments'),
  savePaymentMethod: (id, payload) => id
    ? api.put(`/api/admin/payments/${id}`, wrapData(payload))
    : api.post('/api/admin/payments', wrapData(payload)),
  deletePaymentMethod: (id) => api.delete(`/api/admin/payments/${id}`),
  merchants: () => api.get('/api/admin/merchants'),
  saveMerchant: (id, payload) => id
    ? api.put(`/api/admin/merchants/${id}`, wrapData(payload))
    : api.post('/api/admin/merchants', wrapData(payload)),
  deleteMerchant: (id) => api.delete(`/api/admin/merchants/${id}`),
}
