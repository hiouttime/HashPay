import axios from 'axios'
import { showToast } from 'vant'
import { tg } from './telegram'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use(config => {
  // 添加认证信息
  if (tg?.initData) {
    config.headers['Authorization'] = `Bearer ${tg.initData}`
  }
  
  return config
}, error => {
  return Promise.reject(error)
})

api.interceptors.response.use(response => {
  return response
}, error => {
  if (error.response) {
    const { status, data } = error.response
    
    if (status === 401) {
      showToast('认证失败')
    } else if (status === 403) {
      showToast('无权限')
    } else if (status === 404) {
      showToast('资源不存在')
    } else if (status >= 500) {
      showToast('服务器错误')
    } else {
      showToast(data?.error || '请求失败')
    }
  } else if (error.request) {
    showToast('网络错误')
  } else {
    showToast('请求失败')
  }
  
  return Promise.reject(error)
})

export { api }