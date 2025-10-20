import React, { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { AppRoot } from '@telegram-apps/telegram-ui'
import InitSetup from './pages/InitSetup'
import Dashboard from './pages/Dashboard'
import api from './utils/api'

function App() {
  const navigate = useNavigate()

  useEffect(() => {
    checkInitMode()
  }, [])

  const checkInitMode = async () => {
    try {
      const response = await api.get('/api/init/health')
      if (response.data.status === 'ready') {
        // 初始化模式
        navigate('/init')
      } else {
        // 正常模式
        navigate('/dashboard')
      }
    } catch (error) {
      // 不在初始化模式，显示管理界面
      navigate('/dashboard')
    }
  }

  return (
    <AppRoot>
      <Routes>
        <Route path="/init" element={<InitSetup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<div>Loading...</div>} />
      </Routes>
    </AppRoot>
  )
}

export default App