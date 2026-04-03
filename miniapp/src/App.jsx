import React, { useEffect, useState } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AppRoot } from '@telegram-apps/telegram-ui'
import Loading from './pages/Loading'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Payments from './pages/Payments'
import PaymentForm from './pages/PaymentForm'
import Settings from './pages/Settings'
import InitSetup from './pages/InitSetup'
import Merchants from './pages/Merchants'
import MerchantForm from './pages/MerchantForm'
import { setupApi } from './utils/api'

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const checkInitMode = async () => {
      try {
        const { data } = await setupApi.status()
        if (!active) return
        if (data.status === 'init') {
          if (location.pathname !== '/setup') {
            navigate('/setup', { replace: true })
          }
          return
        }
        if (location.pathname === '/' || location.pathname === '/setup') {
          navigate('/dashboard', { replace: true })
        }
      } catch (error) {
        if (active && (location.pathname === '/' || location.pathname === '/setup')) {
          navigate('/dashboard', { replace: true })
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void checkInitMode()
    return () => {
      active = false
    }
  }, [location.pathname, navigate])

  return (
    <AppRoot>
      {loading ? (
        <Loading />
      ) : (
        <Routes>
          <Route path="/setup" element={<InitSetup />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/new" element={<PaymentForm />} />
          <Route path="/payments/:id/edit" element={<PaymentForm />} />
          <Route path="/merchants" element={<Merchants />} />
          <Route path="/merchants/new" element={<MerchantForm />} />
          <Route path="/merchants/:id/edit" element={<MerchantForm />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/" element={<Loading />} />
        </Routes>
      )}
    </AppRoot>
  )
}

export default App
