import React, { useEffect, useState } from 'react'
import { Button } from '@telegram-apps/telegram-ui'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../utils/api'
import { AppGroup, AppMetric, AppPage } from '../components/AppPage'
import { formatAmount, formatTime, shortText, statusText } from './AdminCommon'
import './Admin.scss'

function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)

  const load = async () => {
    try {
      const { data } = await adminApi.dashboard()
      setData(data)
    } catch {
      setData(null)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <AppPage
      title="运营面板"
      subtitle="管理员最该关注的是今天收了多少、还有哪些单没完、哪个配置可能挡路。"
      actions={<Button size="s" mode="outline" onClick={load}>刷新</Button>}
    >
      <AppGroup title="今日重点">
        <div className="metric-grid">
          <AppMetric label="今日入账" value={formatAmount(data?.today_amount)} tone="green" />
          <AppMetric label="今日笔数" value={String(data?.today_count ?? 0)} />
          <AppMetric label="待处理订单" value={String(data?.pending_count ?? 0)} tone="amber" />
          <AppMetric label="通知失败" value={String(data?.failed_notify_count ?? 0)} tone="red" />
        </div>
      </AppGroup>

      <AppGroup title="支付健康" subtitle="这里不做图表炫技，只展示会影响管理员下一步决策的状态。">
        <div className="stack-list">
          {(data?.health || []).map((item) => (
            <div key={item.title} className="health-row">
              <div>
                <strong>{item.title}</strong>
                <p>{item.details}</p>
              </div>
              <span className={`health-pill tone-${item.status}`}>{item.status}</span>
            </div>
          ))}
          {!data?.health?.length ? <div className="empty-state">还没有配置任何支付方式。</div> : null}
        </div>
      </AppGroup>

      <AppGroup
        title="最近订单"
        footer={<button className="quiet-btn" onClick={() => navigate('/orders')}>查看全部</button>}
      >
        <div className="stack-list">
          {(data?.recent_orders || []).map((order) => (
            <button key={order.id} className="work-row clickable" onClick={() => navigate(`/orders/${order.id}`)}>
              <div className="work-row-head">
                <div>
                  <strong>{shortText(order.id, 8, 6)}</strong>
                  <p>{formatAmount(order.fiat_amount)} {order.fiat_currency}</p>
                </div>
                <span className={`status-chip status-${order.status}`}>{statusText(order.status)}</span>
              </div>
              <div className="row-meta">
                <span>{order.merchant_id}</span>
                <span>{formatTime(order.created_at)}</span>
              </div>
            </button>
          ))}
          {!data?.recent_orders?.length ? <div className="empty-state">暂无订单。</div> : null}
        </div>
      </AppGroup>
    </AppPage>
  )
}

export default Dashboard
