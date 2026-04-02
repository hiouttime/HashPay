import axios from 'axios'

const api = axios.create({
  baseURL: '',
  timeout: 10000,
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
