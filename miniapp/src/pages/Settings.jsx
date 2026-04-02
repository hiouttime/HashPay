import React, { useEffect, useState } from 'react'
import { Section, Title, Text, Caption, List, Button, Spinner, Select, Input, Switch } from '@telegram-apps/telegram-ui'
import api from '../utils/api'
import useTelegramBackButton from '../utils/useTelegramBackButton'
import { showNotice } from './AdminCommon'
import './Admin.scss'

const currencyOptions = ['CNY', 'USD', 'EUR', 'GBP', 'TWD']

function Settings() {
  useTelegramBackButton()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    currency: 'CNY',
    timeout: '1800',
    rateAdjust: '',
    fastConfirm: true,
  })

  const loadConfig = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/config')
      setForm({
        currency: data.currency || 'CNY',
        timeout: data.timeout || '1800',
        rateAdjust: data.rate_adjust || '',
        fastConfirm: data.fast_confirm !== 'false',
      })
    } catch {
      setForm({
        currency: 'CNY',
        timeout: '1800',
        rateAdjust: '',
        fastConfirm: true,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConfig()
  }, [])

  const saveConfig = async () => {
    setSaving(true)
    try {
      await api.put('/api/admin/config', {
        currency: form.currency,
        timeout: form.timeout.trim() || '1800',
        rate_adjust: form.rateAdjust.trim() || '0',
        fast_confirm: form.fastConfirm ? 'true' : 'false',
      })
      showNotice('系统配置已保存')
    } catch {
      showNotice('保存系统配置失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-head">
        <Title level="2">系统配置</Title>
        <Text className="admin-subtitle">修改系统参数后立即生效。</Text>
      </div>

      <List>
        <div className="admin-section">
          <Section header="货币">
            {loading ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : (
              <div className="form-wrap">
                <div className="field-wrap">
                  <Select
                    header="基础货币"
                    value={form.currency}
                    onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                  >
                    {currencyOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                </div>
                <Caption className="hint-line">
                  在发起订单时的默认货币，以及用于统计数据的货币。
                </Caption>

                <div className="field-wrap">
                  <Input
                    header="计价汇率微调"
                    placeholder="微调计价汇率（可不填）"
                    value={form.rateAdjust}
                    onChange={(e) => setForm((prev) => ({ ...prev, rateAdjust: e.target.value }))}
                  />
                </div>
                <Caption className="hint-line">
                  实时价格与 C2C 汇率计算后可再微调，例如 +0.5 或 -1。
                </Caption>
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="交易检测">
            {loading ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : (
              <div className="form-wrap">
                <div className="field-wrap">
                  <Input
                    header="订单超时（秒）"
                    type="number"
                    value={form.timeout}
                    onChange={(e) => setForm((prev) => ({ ...prev, timeout: e.target.value }))}
                  />
                </div>
                <div className="switch-line">
                  <Text>快速确认</Text>
                  <Switch
                    checked={form.fastConfirm}
                    onChange={(e) => setForm((prev) => ({ ...prev, fastConfirm: e.target.checked }))}
                  />
                </div>
                <Caption className="hint-line">
                  不等待目标链交易确认区块数达到安全值，提升交易确认速度。
                </Caption>
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section>
            <div className="section-action">
              <Button size="m" stretched onClick={saveConfig} disabled={saving || loading}>
                {saving ? '保存中...' : '保存系统配置'}
              </Button>
            </div>
          </Section>
        </div>
      </List>
    </div>
  )
}

export default Settings
