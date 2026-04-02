import React, { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { AppRoot, Spinner } from '@telegram-apps/telegram-ui'
import '@telegram-apps/telegram-ui/dist/styles.css'

import Dashboard from './pages/Dashboard'
import Setup from './pages/Setup'
import Orders from './pages/Orders'
import Payments from './pages/Payments'
import Settings from './pages/Settings'
import PayPage from './pages/PayPage'
import { api } from './services/api'

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 支付页面不需要检查初始化状态
    if (location.pathname.startsWith('/pay/')) {
      setLoading(false)
      return
    }

    const checkStatus = async () => {
      try {
        const { data } = await api.get('/api/status')
        if (data.status === 'init') {
          navigate('/setup', { replace: true })
        } else if (location.pathname === '/') {
          navigate('/dashboard', { replace: true })
        }
      } catch (error) {
        console.error('Status check failed:', error)
      } finally {
        setLoading(false)
      }
    }

    checkStatus()
  }, [navigate, location.pathname])

  if (loading) {
    return (
      <AppRoot>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <Spinner size="m" />
        </div>
      </AppRoot>
    )
  }

  return (
    <AppRoot>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/pay/:orderId" element={<PayPage />} />
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </AppRoot>
  )
}

export default App
