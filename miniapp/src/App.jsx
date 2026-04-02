import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AppRoot } from '@telegram-apps/telegram-ui'
import Loading from './pages/Loading'
import api from './utils/api'

const InitSetup = lazy(() => import('./pages/InitSetup'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Overview = lazy(() => import('./pages/Overview'))
const Orders = lazy(() => import('./pages/Orders'))
const Payments = lazy(() => import('./pages/Payments'))
const PaymentForm = lazy(() => import('./pages/PaymentForm'))
const Settings = lazy(() => import('./pages/Settings'))
const Sites = lazy(() => import('./pages/Sites'))

function App() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let active = true
    const checkInitMode = async () => {
      try {
        const { data } = await api.get('/api/status')
        if (!active) return
        if (data.status === 'init') {
          navigate('/init', { replace: true })
          return
        }
        if (location.pathname === '/' || location.pathname === '/init') {
          navigate('/dashboard', { replace: true })
        }
      } catch (error) {
        if (active) {
          if (location.pathname === '/' || location.pathname === '/init') {
            navigate('/dashboard', { replace: true })
          }
        }
      }
    }

    void checkInitMode()
    return () => {
      active = false
    }
  }, [location.pathname, navigate])

  return (
    <AppRoot>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/init" element={<InitSetup />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/new" element={<PaymentForm />} />
          <Route path="/payments/:id/edit" element={<PaymentForm />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/" element={<Loading />} />
        </Routes>
      </Suspense>
    </AppRoot>
  )
}

export default App
