import React, { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { AppRoot } from '@telegram-apps/telegram-ui'
import InitSetup from './pages/InitSetup'
import Dashboard from './pages/Dashboard'
import api from './utils/api'

function App() {
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    const checkInitMode = async () => {
      try {
        const { data } = await api.get('/api/status')
        if (!active) return
        navigate(data.status === 'init' ? '/init' : '/dashboard', { replace: true })
      } catch (error) {
        if (active) {
          navigate('/dashboard', { replace: true })
        }
      }
    }

    void checkInitMode()
    return () => {
      active = false
    }
  }, [navigate])

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
