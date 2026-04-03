import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { AppGroup, AppPage } from '../components/AppPage'
import { formatAmount, formatTime, shortText, statusText } from './AdminCommon'
import './Admin.scss'

function Orders() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [items, setItems] = useState([])

  const load = async (nextStatus = status) => {
    try {
      const query = `?status=${nextStatus}&limit=100`
      const { data } = await adminApi.orders(query)
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    void load(status)
  }, [status])

  return (
    <AppPage title="订单工作台" subtitle="按状态筛选订单，优先看待支付与异常单。">
      <AppGroup title="筛选">
        <div className="filter-row">
          {['all', 'pending', 'paid', 'expired', 'invalid'].map((item) => (
            <button key={item} className={`filter-chip ${status === item ? 'is-active' : ''}`} onClick={() => setStatus(item)}>
              {item}
            </button>
          ))}
          <Button size="s" mode="outline" onClick={() => load(status)}>刷新</Button>
        </div>
      </AppGroup>
      <AppGroup title="订单列表">
        <div className="stack-list">
          {items.map((order) => (
            <button key={order.id} className="work-row clickable" onClick={() => navigate(`/orders/${order.id}`)}>
              <div className="work-row-head">
                <div>
                  <strong>{shortText(order.id, 8, 6)}</strong>
                  <p>{order.merchant_id} · {order.merchant_order_no}</p>
                </div>
                <span className={`status-chip status-${order.status}`}>{statusText(order.status)}</span>
              </div>
              <div className="row-meta">
                <span>{formatAmount(order.fiat_amount)} {order.fiat_currency}</span>
                <span>{formatTime(order.created_at)}</span>
              </div>
            </button>
          ))}
          {items.length === 0 ? <div className="empty-state">当前筛选下没有订单。</div> : null}
        </div>
      </AppGroup>
    </AppPage>
  )
}

export default Orders
