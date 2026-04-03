import React, { useEffect, useMemo, useState } from 'react'
import { Section, Caption, List, Button, Placeholder, Spinner, Text } from '@telegram-apps/telegram-ui'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { adminApi } from '../utils/api'
import useTelegramBackButton from '../utils/useTelegramBackButton'
import { formatAmount, formatTime, shortText, statusText } from './AdminCommon'
import PageTitle from '../components/PageTitle'
import './Admin.scss'

function Overview() {
  useTelegramBackButton()
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState(null)
  const [orders, setOrders] = useState([])
  const [methods, setMethods] = useState([])
  const [merchants, setMerchants] = useState([])

  const load = async () => {
    setLoading(true)
    try {
      const [dashRes, orderRes, methodRes, merchantRes] = await Promise.all([
        adminApi.dashboard(),
        adminApi.orders('?status=all&limit=100'),
        adminApi.paymentMethods(),
        adminApi.merchants(),
      ])
      setDashboard(dashRes.data || null)
      setOrders(Array.isArray(orderRes.data) ? orderRes.data : [])
      setMethods(Array.isArray(methodRes.data) ? methodRes.data : [])
      setMerchants(Array.isArray(merchantRes.data) ? merchantRes.data : [])
    } catch {
      setDashboard(null)
      setOrders([])
      setMethods([])
      setMerchants([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const orderBars = useMemo(() => {
    const counts = { pending: 0, paid: 0, expired: 0, invalid: 0 }
    for (const item of orders) {
      const key = String(item.status || 'pending')
      if (counts[key] !== undefined) {
        counts[key] += 1
      }
    }
    return Object.entries(counts).map(([status, count]) => ({
      status: statusText(status),
      count,
    }))
  }, [orders])

  const methodBars = useMemo(() => {
    const list = methods.map((item) => ({
      name: shortText(item.name || item.driver, 8, 4),
      count: String(item.enabled) === 'true' || item.enabled ? 1 : 0,
    }))
    return list.slice(0, 8)
  }, [methods])

  const recentOrders = useMemo(() => orders.slice(0, 8), [orders])

  return (
    <div className="admin-page">
      <PageTitle
        title="运营概览"
        subtitle="恢复二级概览页，用更细一点的视角看订单、支付方式和商户接入。"
        actions={(
          <Button size="s" mode="outline" onClick={load}>
            刷新
          </Button>
        )}
      />

      <List>
        <div className="admin-section">
          <Section header="核心指标">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : (
              <div className="overview-grid">
                <div className="overview-card">
                  <Caption className="overview-label">今日订单</Caption>
                  <Text className="overview-value">{String(dashboard?.today_count ?? 0)}</Text>
                </div>
                <div className="overview-card">
                  <Caption className="overview-label">今日收款金额</Caption>
                  <Text className="overview-value">{formatAmount(dashboard?.today_amount)}</Text>
                </div>
                <div className="overview-card">
                  <Caption className="overview-label">商户数</Caption>
                  <Text className="overview-value">{String(merchants.length)}</Text>
                </div>
                <div className="overview-card">
                  <Caption className="overview-label">支付方式</Caption>
                  <Text className="overview-value">{String(methods.length)}</Text>
                </div>
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="订单状态分布">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : orderBars.every((item) => item.count === 0) ? (
              <Placeholder description="暂无订单统计数据" />
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={orderBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--tgui--outline)" />
                    <XAxis dataKey="status" tick={{ fill: 'var(--tgui--hint_color)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--tgui--hint_color)', fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#5B8CFF" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="支付方式启用情况">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : methodBars.length === 0 ? (
              <Placeholder description="暂无支付方式数据" />
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={methodBars} margin={{ top: 8, right: 8, left: 0, bottom: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--tgui--outline)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--tgui--hint_color)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--tgui--hint_color)', fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#16A34A" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="商户接入">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : merchants.length === 0 ? (
              <Placeholder description="暂无商户" />
            ) : (
              <div className="card-list">
                {merchants.map((item) => (
                  <div className="line-card" key={item.id}>
                    <div className="line-head">
                      <Text className="line-title">{item.name}</Text>
                      <span className={`status-pill status-${item.status === 'active' ? 'paid' : 'expired'}`}>
                        {item.status}
                      </span>
                    </div>
                    <Caption className="line-desc">{item.callback_url || '--'}</Caption>
                    <Caption className="line-desc">创建时间: {formatTime(item.created_at)}</Caption>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="最近订单">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : recentOrders.length === 0 ? (
              <Placeholder description="暂无订单" />
            ) : (
              <div className="card-list">
                {recentOrders.map((item) => (
                  <div className="line-card" key={item.id}>
                    <div className="line-head">
                      <Text className="line-title">{shortText(item.id, 8, 6)}</Text>
                      <span className={`status-pill status-${item.status}`}>{statusText(item.status)}</span>
                    </div>
                    <Caption className="line-desc">
                      {item.merchant_id} · {formatAmount(item.fiat_amount)} {item.fiat_currency}
                    </Caption>
                    <Caption className="line-desc">{formatTime(item.created_at)}</Caption>
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

export default Overview
