import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { AppGroup, AppPage } from '../components/AppPage'
import { showNotice } from './AdminCommon'
import './Admin.scss'

function PaymentForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const current = location.state?.item || null
  const [catalog, setCatalog] = useState([])
  const [schema, setSchema] = useState({})
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    driver: current?.driver || '',
    kind: current?.kind || '',
    name: current?.name || '',
    enabled: current?.enabled ?? true,
    fields: current?.fields || {},
  })

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await adminApi.paymentCatalog()
        setCatalog(Array.isArray(data.drivers) ? data.drivers : [])
        setSchema(data.schema || {})
        if (!current && data.drivers?.[0]) {
          setForm((prev) => ({ ...prev, driver: data.drivers[0].id, kind: data.drivers[0].kind }))
        }
      } catch {
        setCatalog([])
        setSchema({})
      }
    }
    void load()
  }, [current])

  const selected = useMemo(
    () => catalog.find((item) => item.id === form.driver),
    [catalog, form.driver]
  )

  const fields = schema[form.driver] || []

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.savePaymentMethod(id, {
        driver: form.driver,
        kind: selected?.kind || form.kind,
        name: form.name,
        enabled: form.enabled,
        fields: form.fields,
      })
      navigate('/payments')
    } catch {
      showNotice('保存支付方式失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppPage
      title={id ? '编辑支付方式' : '新增支付方式'}
      subtitle="按照后端驱动 schema 渲染，不在页面里硬编码 TRON、TON、交易所等独立表单。"
      actions={<Button size="s" loading={saving} onClick={save}>保存</Button>}
    >
      <AppGroup title="驱动选择">
        <div className="form-grid">
          <label className="form-field">
            <span>驱动</span>
            <select
              value={form.driver}
              onChange={(e) => {
                const next = catalog.find((item) => item.id === e.target.value)
                setForm((prev) => ({ ...prev, driver: e.target.value, kind: next?.kind || '', fields: {} }))
              }}
            >
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>显示名称</span>
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder={selected?.name || '显示名称'} />
          </label>
          <label className="form-field">
            <span>状态</span>
            <select value={String(form.enabled)} onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.value === 'true' }))}>
              <option value="true">enabled</option>
              <option value="false">disabled</option>
            </select>
          </label>
        </div>
      </AppGroup>

      <AppGroup title="驱动字段" subtitle={selected?.description}>
        <div className="form-grid">
          {fields.map((field) => (
            <label key={field.key} className={`form-field ${field.type === 'textarea' ? 'is-wide' : ''}`}>
              <span>{field.label}</span>
              {field.type === 'textarea' ? (
                <textarea
                  value={form.fields[field.key] || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, fields: { ...prev.fields, [field.key]: e.target.value } }))}
                  placeholder={field.placeholder || ''}
                />
              ) : field.options?.length ? (
                <select
                  value={form.fields[field.key] || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, fields: { ...prev.fields, [field.key]: e.target.value } }))}
                >
                  <option value="">请选择</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={form.fields[field.key] || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, fields: { ...prev.fields, [field.key]: e.target.value } }))}
                  placeholder={field.placeholder || ''}
                />
              )}
              {field.help ? <small>{field.help}</small> : null}
            </label>
          ))}
        </div>
      </AppGroup>
    </AppPage>
  )
}

export default PaymentForm
