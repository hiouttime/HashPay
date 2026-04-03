import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { AppGroup, AppPage } from '../components/AppPage'
import { showNotice } from './AdminCommon'
import './Admin.scss'

function Payments() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])

  const load = async () => {
    try {
      const { data } = await adminApi.paymentMethods()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (id) => {
    if (!window.confirm('确认删除这个支付方式？')) return
    try {
      await adminApi.deletePaymentMethod(id)
      await load()
    } catch {
      showNotice('删除支付方式失败')
    }
  }

  return (
    <AppPage
      title="支付方式"
      subtitle="支付配置不再按页面手写，而是按驱动 schema 管理实例。"
      actions={<Button size="s" onClick={() => navigate('/payments/new')}>新增方式</Button>}
    >
      <AppGroup title="支付实例">
        <div className="stack-list">
          {items.map((item) => (
            <div key={item.id} className="work-row">
              <div className="work-row-head">
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.driver} · {item.kind}</p>
                </div>
                <span className={`health-pill tone-${item.enabled ? 'ok' : 'off'}`}>{item.enabled ? 'enabled' : 'disabled'}</span>
              </div>
              <div className="detail-grid">
                {Object.entries(item.fields || {}).slice(0, 4).map(([key, value]) => (
                  <div key={key}><dt>{key}</dt><dd>{value || '--'}</dd></div>
                ))}
              </div>
              <div className="row-actions">
                <button className="quiet-btn" onClick={() => navigate(`/payments/${item.id}/edit`, { state: { item } })}>编辑</button>
                <button className="quiet-btn danger" onClick={() => remove(item.id)}>删除</button>
              </div>
            </div>
          ))}
          {items.length === 0 ? <div className="empty-state">还没有支付方式。先添加一个收款驱动。</div> : null}
        </div>
      </AppGroup>
    </AppPage>
  )
}

export default Payments
