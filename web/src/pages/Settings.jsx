import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  List,
  Section,
  Cell,
  Input,
  Select,
  Button,
  Spinner,
  IconButton,
} from '@telegram-apps/telegram-ui'
import { adminApi } from '../services/api'

function Settings() {
  const navigate = useNavigate()
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const { data } = await adminApi.getConfig()
      setConfig(data || {})
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminApi.updateConfig(config)
      alert('保存成功')
    } catch (error) {
      console.error('Failed to save config:', error)
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const updateConfig = (key, value) => {
    setConfig({ ...config, [key]: value })
  }

  return (
    <List>
      <Section
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconButton size="s" onClick={() => navigate('/dashboard')}>
              ←
            </IconButton>
            <span>系统设置</span>
          </div>
        }
      >
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <Spinner size="m" />
          </div>
        ) : (
          <>
            <Cell>
              <Select
                header="基准货币"
                value={config.currency || 'CNY'}
                onChange={(e) => updateConfig('currency', e.target.value)}
              >
                <option value="CNY">CNY - 人民币</option>
                <option value="USD">USD - 美元</option>
              </Select>
            </Cell>

            <Input
              header="订单超时（秒）"
              type="number"
              value={config.timeout || 1800}
              onChange={(e) => updateConfig('timeout', e.target.value)}
            />

            <Input
              header="汇率微调"
              type="number"
              step="0.01"
              value={config.rate_adjust || 0}
              onChange={(e) => updateConfig('rate_adjust', e.target.value)}
            />

            <Cell>
              <Button
                size="l"
                stretched
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Spinner size="s" /> : '保存设置'}
              </Button>
            </Cell>
          </>
        )}
      </Section>
    </List>
  )
}

export default Settings
