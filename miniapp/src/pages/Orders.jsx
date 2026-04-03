import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Text, Caption, List, Button, Placeholder, Spinner } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { formatAmount, formatTime, shortText, statusText } from './AdminCommon'
import PageTitle from '../components/PageTitle'
import './Admin.scss'

function Orders() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])

  const load = async (nextStatus = status, silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    try {
      const query = `?status=${nextStatus}&limit=100`
      const { data } = await adminApi.orders(query)
      setItems(Array.isArray(data) ? data : [])
    } catch {
      if (!silent) {
        setItems([])
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void load(status)
  }, [status])

  return (
    <div className="admin-page">
      <PageTitle title="订单管理" subtitle="按状态筛选订单，优先处理待支付与异常订单。" />

      <List>
        <div className="admin-section">
          <Section header="筛选">
            <div className="filter-row">
              {['all', 'pending', 'paid', 'expired', 'invalid'].map((item) => (
                <button key={item} className={`filter-chip ${status === item ? 'is-active' : ''}`} onClick={() => setStatus(item)}>
                  {item}
                </button>
              ))}
              <Button size="s" mode="outline" onClick={() => load(status, true)}>
                刷新
              </Button>
            </div>
          </Section>
        </div>

        <div className="admin-section">
          <Section header="订单列表">
            {loading ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : items.length === 0 ? (
              <Placeholder description="当前筛选下没有订单。" />
            ) : (
              <div className="card-list">
                {items.map((order) => (
                  <button key={order.id} className="line-card clickable" onClick={() => navigate(`/orders/${order.id}`)}>
                    <div className="line-head">
                      <Text className="line-title">{shortText(order.id, 8, 6)}</Text>
                      <span className={`status-pill status-${order.status}`}>{statusText(order.status)}</span>
                    </div>
                    <Caption className="line-desc">
                      {order.merchant_id} · {order.merchant_order_no || '--'}
                    </Caption>
                    <Caption className="line-desc">
                      {formatAmount(order.fiat_amount)} {order.fiat_currency} · {formatTime(order.created_at)}
                    </Caption>
                  </button>
                ))}
              </div>
            )}
          </Section>
        </div>
      </List>
    </div>
  )
}

export default Orders
