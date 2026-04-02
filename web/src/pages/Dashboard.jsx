import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  List,
  Section,
  Cell,
  Title,
  Headline,
  Subheadline,
  Spinner,
  Badge,
} from '@telegram-apps/telegram-ui'
import { adminApi } from '../services/api'

function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const { data } = await adminApi.getStats()
        setStats(data)
      } catch (error) {
        console.error('Failed to load stats:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  return (
    <List>
      <Section header="HashPay" footer="支付管理后台">
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <Spinner size="m" />
          </div>
        ) : stats ? (
          <>
            <Cell
              before={<Headline weight="1">📊</Headline>}
              subtitle="今日收款"
              after={<Badge type="number">{stats.today?.count || 0}</Badge>}
            >
              <Title level="3" weight="1">
                ¥{(stats.today?.amount || 0).toFixed(2)}
              </Title>
            </Cell>
            <Cell
              before={<Headline weight="1">💰</Headline>}
              subtitle="累计收款"
              after={<Badge type="number">{stats.total?.count || 0}</Badge>}
            >
              <Title level="3" weight="1">
                ¥{(stats.total?.amount || 0).toFixed(2)}
              </Title>
            </Cell>
          </>
        ) : null}
      </Section>

      <Section header="管理">
        <Cell
          before="📋"
          onClick={() => navigate('/orders')}
          description="查看所有订单"
        >
          订单管理
        </Cell>
        <Cell
          before="💳"
          onClick={() => navigate('/payments')}
          description="管理收款方式"
        >
          支付方式
        </Cell>
        <Cell
          before="⚙️"
          onClick={() => navigate('/settings')}
          description="系统参数配置"
        >
          系统设置
        </Cell>
      </Section>
    </List>
  )
}

export default Dashboard
