import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Title, Text, Caption, List, Button, Placeholder, Spinner } from '@telegram-apps/telegram-ui'
import api from '../utils/api'
import { formatAmount, formatTime, shortText, statusText } from './AdminCommon'
import LottieOrTgs from '../components/LottieOrTgs'
import emptyOrdersTgs from '../assets/empty-orders.tgs'
import './Admin.scss'

function Dashboard() {
  const navigate = useNavigate()

  const [statsReady, setStatsReady] = useState(false)
  const [todayCount, setTodayCount] = useState('--')
  const [todayAmount, setTodayAmount] = useState('--')
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [orders, setOrders] = useState([])

  const loadStats = async () => {
    try {
      const { data } = await api.get('/api/admin/stats')
      setTodayCount(String(data.today?.count ?? 0))
      setTodayAmount(formatAmount(data.today?.amount))
      setStatsReady(true)
    } catch {
      setTodayCount('--')
      setTodayAmount('--')
      setStatsReady(false)
    }
  }

  const loadOrders = async (silent = false) => {
    if (!silent) {
      setOrdersLoading(true)
    }
    try {
      const { data } = await api.get('/api/admin/orders?limit=5')
      setOrders(Array.isArray(data) ? data : [])
    } catch {
      if (!silent) {
        setOrders([])
      }
    } finally {
      if (!silent) {
        setOrdersLoading(false)
      }
    }
  }

  const refresh = async (silent = false) => {
    await Promise.all([loadStats(), loadOrders(silent)])
  }

  useEffect(() => {
    void refresh()

    const timer = setInterval(() => {
      void refresh(true)
    }, 5000)

    return () => {
      clearInterval(timer)
    }
  }, [])

  const openHelp = () => {
    const helpText = '如需帮助，请查看 README 文档，或联系技术支持。'
    if (window.Telegram?.WebApp?.showAlert) {
      window.Telegram.WebApp.showAlert(helpText)
      return
    }
    window.alert(helpText)
  }

  return (
    <div className="admin-page">
      <div className="admin-head">
        <Title level="2">HashPay 管理后台</Title>
        <Text className="admin-subtitle">运营概览、系统管理、近期订单。</Text>
        <div className="admin-toolbar">
          <Button size="s" mode="outline" onClick={() => refresh(true)}>
            更新数据
          </Button>
        </div>
      </div>

      <List>
        <div className="admin-section">
          <Section header="运营概览">
            <div className="overview-grid">
              <div className="overview-card">
                <Caption className="overview-label">今日订单</Caption>
                <Text className="overview-value">{todayCount}</Text>
              </div>
              <div className="overview-card">
                <Caption className="overview-label">今日收款金额</Caption>
                <Text className="overview-value">{todayAmount}</Text>
              </div>
            </div>
            {!statsReady && (
              <Caption className="hint-line">当前会话未通过 Telegram 管理鉴权，统计数据暂不可见。</Caption>
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
              <Button size="m" mode="outline" onClick={() => navigate('/payments')}>
                支付设置
              </Button>
              <Button size="m" mode="outline" onClick={() => navigate('/settings')}>
                系统配置
              </Button>
              <Button size="m" mode="outline" onClick={() => navigate('/sites')}>
                商户管理
              </Button>
              <Button size="m" mode="outline" onClick={openHelp}>
                获取帮助
              </Button>
            </div>
          </Section>
        </div>

        <div className="admin-section">
          <Section header="近期订单">
            {ordersLoading ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : orders.length === 0 ? (
              <Placeholder
                header="暂无订单"
                description="当前还没有最近订单记录。"
              >
                <LottieOrTgs
                  className="empty-illustration"
                  src={emptyOrdersTgs}
                />
              </Placeholder>
            ) : (
              <div className="card-list">
                {orders.map((order) => (
                  <div className="line-card" key={order.id}>
                    <div className="line-head">
                      <Text className="line-title">{shortText(order.id, 8, 6)}</Text>
                      <span className={`status-pill status-${order.status}`}>{statusText(order.status)}</span>
                    </div>
                    <Caption className="line-desc">
                      {formatAmount(order.amount)} {order.currency || '--'} · {formatTime(order.created_at)}
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

      <div className="admin-footer">
        <Caption>© 2026 HashPay. All rights reserved.</Caption>
      </div>
    </div>
  )
}

export default Dashboard
