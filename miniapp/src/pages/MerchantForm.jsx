import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { AppGroup, AppPage } from '../components/AppPage'
import { showNotice } from './AdminCommon'
import useTelegramBackButton from '../utils/useTelegramBackButton'
import './Admin.scss'

function MerchantForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const current = useMemo(() => location.state?.item || null, [location.state])
  useTelegramBackButton()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: current?.name || '',
    callback_url: current?.callback_url || '',
    status: current?.status || 'active',
    api_key: current?.api_key || '',
    secret_key: current?.secret_key || '',
  })

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.saveMerchant(id, form)
      navigate('/merchants')
    } catch {
      showNotice('保存商户失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppPage
      title={id ? '编辑商户' : '新增商户'}
      subtitle="保留简洁字段，让管理员快速完成接入配置。"
      actions={<Button size="s" loading={saving} onClick={save}>保存</Button>}
      hideNav
    >
      <AppGroup title="基础信息">
        <div className="form-grid">
          <label className="form-field">
            <span>商户名称</span>
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="例如：Main Store" />
          </label>
          <label className="form-field">
            <span>默认回调</span>
            <input value={form.callback_url} onChange={(e) => setForm((prev) => ({ ...prev, callback_url: e.target.value }))} placeholder="https://merchant.example.com/callback" />
          </label>
          <label className="form-field">
            <span>状态</span>
            <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="active">active</option>
              <option value="paused">paused</option>
            </select>
          </label>
          <label className="form-field">
            <span>API Key</span>
            <input value={form.api_key} onChange={(e) => setForm((prev) => ({ ...prev, api_key: e.target.value }))} placeholder="留空则自动生成" />
          </label>
          <label className="form-field">
            <span>签名密钥</span>
            <input value={form.secret_key} onChange={(e) => setForm((prev) => ({ ...prev, secret_key: e.target.value }))} placeholder="留空则自动生成" />
          </label>
        </div>
      </AppGroup>
    </AppPage>
  )
}

export default MerchantForm
