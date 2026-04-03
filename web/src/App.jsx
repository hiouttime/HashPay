import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import PayPage from './pages/PayPage'
function App() {
  return (
    <Routes>
      <Route path="/pay/:orderId" element={<PayPage />} />
      <Route path="*" element={<Navigate to="/pay/unknown" replace />} />
    </Routes>
  )
}

export default App
