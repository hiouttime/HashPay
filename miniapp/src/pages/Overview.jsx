import React, { useEffect, useMemo, useState } from 'react'
import { Section, Title, Text, Caption, List, Button, Placeholder, Spinner } from '@telegram-apps/telegram-ui'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts'
import api from '../utils/api'
import useTelegramBackButton from '../utils/useTelegramBackButton'
import './Admin.scss'

const rangeOptions = [
  { key: 'today', label: '今日' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: '90d', label: '近90天' },
]

function fmtAmount(v) {
  return Number(v || 0).toFixed(2)
}

function fmtPercent(current, previous) {
  if (!previous) {
    if (!current) return '0.00%'
    return '+100.00%'
  }
  const rate = ((current - previous) / previous) * 100
  const sign = rate > 0 ? '+' : ''
  return `${sign}${rate.toFixed(2)}%`
}

function fmtRange(data) {
  const start = data?.range?.start
  const end = data?.range?.end
  if (!start || !end) return '--'
  return `${new Date(start * 1000).toLocaleDateString()} - ${new Date(end * 1000).toLocaleDateString()}`
}

function Overview() {
  useTelegramBackButton()

  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('7d')
  const [data, setData] = useState(null)

  const loadData = async (nextRange) => {
    setLoading(true)
    try {
      const { data: res } = await api.get(`/api/admin/overview?range=${nextRange}`)
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData(range)
  }, [range])

  const trend = data?.trend || []

  const methodByAmount = useMemo(() => {
    return [...(data?.payment_methods || [])].sort((a, b) => (b.amount || 0) - (a.amount || 0))
  }, [data])

  const methodByCount = useMemo(() => {
    return [...(data?.payment_methods || [])].sort((a, b) => (b.count || 0) - (a.count || 0))
  }, [data])

  const methodAmountBars = useMemo(() => {
    return methodByAmount.slice(0, 8).map((item) => ({
      method: item.method,
      amount: Number(item.amount || 0),
    }))
  }, [methodByAmount])

  const methodCountBars = useMemo(() => {
    return methodByCount.slice(0, 8).map((item) => ({
      method: item.method,
      count: Number(item.count || 0),
    }))
  }, [methodByCount])

  const siteStats = data?.sites || []

  return (
    <div className="admin-page">
      <div className="admin-head">
        <Title level="2">运营概览</Title>
        <Text className="admin-subtitle">支付方式金额统计、频次统计、同期订单对比、同期收款金额对比、商户收款金额统计。</Text>
      </div>

      <List>
        <div className="admin-section">
          <Section header="时间段切换" footer={fmtRange(data)}>
            <div className="page-nav">
              {rangeOptions.map((item) => (
                <Button
                  key={item.key}
                  size="m"
                  mode={range === item.key ? 'filled' : 'outline'}
                  onClick={() => setRange(item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </Section>
        </div>

        <div className="admin-section">
          <Section header="订单趋势折线图">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : trend.length === 0 ? (
              <Placeholder description="当前时间段暂无订单趋势数据" />
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--tgui--outline)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--tgui--hint_color)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--tgui--hint_color)', fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="current_orders" name="当前周期" stroke="#5B8CFF" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="previous_orders" name="上一周期" stroke="#95A6C7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="收款金额趋势折线图">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : trend.length === 0 ? (
              <Placeholder description="当前时间段暂无收款趋势数据" />
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--tgui--outline)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--tgui--hint_color)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--tgui--hint_color)', fontSize: 12 }} />
                    <Tooltip formatter={(value) => fmtAmount(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="current_amount" name="当前周期" stroke="#16A34A" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="previous_amount" name="上一周期" stroke="#86CC9A" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="同期订单对比">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : (
              <div className="overview-grid">
                <div className="overview-card">
                  <Caption className="overview-label">当前周期订单</Caption>
                  <Text className="overview-value">{data?.current?.orders || 0}</Text>
                </div>
                <div className="overview-card">
                  <Caption className="overview-label">上一周期订单</Caption>
                  <Text className="overview-value">{data?.previous?.orders || 0}</Text>
                </div>
              </div>
            )}
            {!loading && (
              <Caption className="hint-line">
                同比变化：{fmtPercent(data?.current?.orders || 0, data?.previous?.orders || 0)}
              </Caption>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="同期收款金额对比">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : (
              <div className="overview-grid">
                <div className="overview-card">
                  <Caption className="overview-label">当前周期收款金额</Caption>
                  <Text className="overview-value">{fmtAmount(data?.current?.amount)}</Text>
                </div>
                <div className="overview-card">
                  <Caption className="overview-label">上一周期收款金额</Caption>
                  <Text className="overview-value">{fmtAmount(data?.previous?.amount)}</Text>
                </div>
              </div>
            )}
            {!loading && (
              <Caption className="hint-line">
                同比变化：{fmtPercent(data?.current?.amount || 0, data?.previous?.amount || 0)}
              </Caption>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="支付方式金额柱状图">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : methodAmountBars.length === 0 ? (
              <Placeholder description="当前时间段暂无收款数据" />
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={methodAmountBars} margin={{ top: 8, right: 8, left: 0, bottom: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--tgui--outline)" />
                    <XAxis
                      dataKey="method"
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      height={70}
                      tick={{ fill: 'var(--tgui--hint_color)', fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: 'var(--tgui--hint_color)', fontSize: 12 }} />
                    <Tooltip formatter={(value) => fmtAmount(value)} />
                    <Bar dataKey="amount" fill="#5B8CFF" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>
        </div>

        <div className="admin-section">
          <Section header="支付方式频次柱状图">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : methodCountBars.length === 0 ? (
              <Placeholder description="当前时间段暂无收款数据" />
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={methodCountBars} margin={{ top: 8, right: 8, left: 0, bottom: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--tgui--outline)" />
                    <XAxis
                      dataKey="method"
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      height={70}
                      tick={{ fill: 'var(--tgui--hint_color)', fontSize: 11 }}
                    />
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
          <Section header="商户收款金额统计">
            {loading ? (
              <div className="loading-wrap"><Spinner size="m" /></div>
            ) : siteStats.length === 0 ? (
              <Placeholder description="当前时间段暂无商户收款数据" />
            ) : (
              <div className="card-list">
                {siteStats.map((item) => (
                  <div className="line-card" key={item.site_id}>
                    <div className="line-head">
                      <Text className="line-title">{item.site_name || item.site_id}</Text>
                      <Text className="line-title">{fmtAmount(item.amount)}</Text>
                    </div>
                    <Caption className="line-desc">{item.site_id}</Caption>
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
