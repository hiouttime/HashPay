import React, { useEffect, useMemo, useState } from 'react'
import { Section, Title, Text, List, Placeholder, Spinner, Select } from '@telegram-apps/telegram-ui'
import api from '../utils/api'
import useTelegramBackButton from '../utils/useTelegramBackButton'
import { formatAmount, formatTime, statusText } from './AdminCommon'
import './Admin.scss'

function Orders() {
  useTelegramBackButton()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('all')

  const loadOrders = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/orders?limit=100')
      setOrders(Array.isArray(data) ? data : [])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders()
  }, [])

  const list = useMemo(() => {
    if (filter === 'all') return orders
    return orders.filter((item) => item.status === filter)
  }, [orders, filter])

  return (
    <div className="admin-page">
      <div className="admin-head">
        <Title level="2">订单管理</Title>
        <Text className="admin-subtitle">查看最近订单与状态。</Text>
      </div>

      <List>
        <div className="admin-section">
          <Section header="筛选条件">
            <div className="field-wrap">
              <Select header="订单状态" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">全部</option>
                <option value="pending">待支付</option>
                <option value="paid">已支付</option>
                <option value="expired">已过期</option>
                <option value="failed">失败</option>
              </Select>
            </div>
          </Section>
        </div>

        <div className="admin-section">
          <Section header="订单列表">
            {loading ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : list.length === 0 ? (
              <Placeholder description="暂无订单" />
            ) : (
              <div className="card-list">
                {list.map((order) => (
                  <div className="line-card" key={order.id}>
                    <div className="line-head">
                      <Text className="line-title">{order.id}</Text>
                      <span className={`status-pill status-${order.status}`}>{statusText(order.status)}</span>
                    </div>
                    <Text className="line-desc">
                      {formatAmount(order.amount)} {order.currency || '--'}
                    </Text>
                    <Text className="line-desc">站点: {order.site_id || '--'}</Text>
                    <Text className="line-desc">支付链: {order.pay_chain || '--'}</Text>
                    <Text className="line-desc">创建时间: {formatTime(order.created_at)}</Text>
                  </div>
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
