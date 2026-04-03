import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppRoot } from '@telegram-apps/telegram-ui'
import Dashboard from './pages/Dashboard'
import Overview from './pages/Overview'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Payments from './pages/Payments'
import PaymentForm from './pages/PaymentForm'
import Settings from './pages/Settings'
import InitSetup from './pages/InitSetup'
import SetupDone from './pages/SetupDone'
import Merchants from './pages/Merchants'
import MerchantForm from './pages/MerchantForm'

function App() {
  return (
    <AppRoot>
      <Routes>
        <Route path="/setup" element={<InitSetup />} />
        <Route path="/setup/done" element={<SetupDone />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/payments/new" element={<PaymentForm />} />
        <Route path="/payments/:id/edit" element={<PaymentForm />} />
        <Route path="/merchants" element={<Merchants />} />
        <Route path="/merchants/new" element={<MerchantForm />} />
        <Route path="/merchants/:id/edit" element={<MerchantForm />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppRoot>
  )
}

export default App
