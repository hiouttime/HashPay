import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Text, Caption, List, Button, Placeholder, Spinner } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { formatAmount, formatTime, shortText, statusText } from './AdminCommon'
import PageTitle from '../components/PageTitle'
import './Admin.scss'

function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const load = async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    try {
      const { data } = await adminApi.dashboard()
      setData(data)
    } catch {
      if (!silent) {
        setData(null)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 8000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="admin-page">
      <PageTitle
        title="HashPay 管理后台"
        subtitle="运营概览、系统管理、近期订单。"
        actions={(
          <Button size="s" mode="outline" onClick={() => load(true)}>
            更新数据
          </Button>
        )}
      />

      <List>
        <div className="admin-section">
          <Section header="运营概览">
            {loading && !data ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : (
              <div className="overview-grid">
                <div className="overview-card">
                  <Caption className="overview-label">今日订单</Caption>
                  <Text className="overview-value">{String(data?.today_count ?? 0)}</Text>
                </div>
                <div className="overview-card">
                  <Caption className="overview-label">今日收款金额</Caption>
                  <Text className="overview-value">{formatAmount(data?.today_amount)}</Text>
                </div>
                <div className="overview-card">
                  <Caption className="overview-label">待处理订单</Caption>
                  <Text className="overview-value">{String(data?.pending_count ?? 0)}</Text>
                </div>
                <div className="overview-card">
                  <Caption className="overview-label">通知失败</Caption>
                  <Text className="overview-value">{String(data?.failed_notify_count ?? 0)}</Text>
                </div>
              </div>
            )}
            <div className="section-action">
              <Button size="m" mode="outline" stretched onClick={() => navigate('/overview')}>
                查看更多
              </Button>
            </div>
          </Section>
        </div>

        <div className="admin-section">
          <Section header="系统管理">
            <div className="page-nav">
              <Button size="m" mode="outline" onClick={() => navigate('/orders')}>
                订单管理
              </Button>
              <Button size="m" mode="outline" onClick={() => navigate('/payments')}>
                支付设置
              </Button>
              <Button size="m" mode="outline" onClick={() => navigate('/merchants')}>
                商户管理
              </Button>
              <Button size="m" mode="outline" onClick={() => navigate('/settings')}>
                系统配置
              </Button>
            </div>
          </Section>
        </div>

        <div className="admin-section">
          <Section header="支付健康">
            {!data?.health?.length ? (
              <Placeholder description="还没有配置任何支付方式" />
            ) : (
              <div className="card-list">
                {data.health.map((item) => (
                  <div className="line-card" key={item.title}>
                    <div className="line-head">
                      <Text className="line-title">{item.title}</Text>
                      <span className={`status-pill status-${item.status === 'warn' ? 'pending' : item.status === 'off' ? 'expired' : 'paid'}`}>
                        {item.status}
                      </span>
                    </div>
                    <Caption className="line-desc">{item.details}</Caption>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="近期订单">
            {loading && !data ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : !(data?.recent_orders?.length) ? (
              <Placeholder description="当前还没有最近订单记录。" />
            ) : (
              <div className="card-list">
                {data.recent_orders.map((order) => (
                  <div className="line-card" key={order.id}>
                    <div className="line-head">
                      <Text className="line-title">{shortText(order.id, 8, 6)}</Text>
                      <span className={`status-pill status-${order.status}`}>{statusText(order.status)}</span>
                    </div>
                    <Caption className="line-desc">
                      {order.merchant_id} · {formatAmount(order.fiat_amount)} {order.fiat_currency} · {formatTime(order.created_at)}
                    </Caption>
                  </div>
                ))}
              </div>
            )}
            <div className="section-action">
              <Button size="m" stretched onClick={() => navigate('/orders')}>
                订单管理
              </Button>
            </div>
          </Section>
        </div>
      </List>
    </div>
  )
}

export default Dashboard
