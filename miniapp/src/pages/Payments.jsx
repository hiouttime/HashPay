import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Title, Text, Caption, List, Button, Placeholder, Spinner, Switch } from '@telegram-apps/telegram-ui'
import api from '../utils/api'
import { shortText, showNotice } from './AdminCommon'
import tronIcon from '../assets/chains/tron.svg'
import evmIcon from '../assets/chains/evm.svg'
import solanaIcon from '../assets/chains/solana.svg'
import tonIcon from '../assets/chains/ton.svg'
import './Admin.scss'

const platformNameMap = {
  tron: 'TRON (TRC20)',
  eth: 'Ethereum (ERC20)',
  bsc: 'BNB Smart Chain (BEP20)',
  polygon: 'Polygon',
  solana: 'Solana',
  ton: 'TON',
}

function normalizeCoins(coins) {
  if (!Array.isArray(coins)) return []
  return Array.from(new Set(coins.map((coin) => String(coin || '').trim().toUpperCase()).filter(Boolean)))
}

function iconTone(platform) {
  switch (platform) {
    case 'tron':
      return 'tron'
    case 'eth':
      return 'eth'
    case 'bsc':
      return 'bsc'
    case 'polygon':
      return 'polygon'
    case 'solana':
      return 'solana'
    case 'ton':
      return 'ton'
    default:
      return 'default'
  }
}

function PlatformIcon({ platform }) {
  let src = ''
  if (platform === 'tron') src = tronIcon
  if (platform === 'solana') src = solanaIcon
  if (platform === 'ton') src = tonIcon
  if (platform === 'eth' || platform === 'bsc' || platform === 'polygon') src = evmIcon
  if (!src) {
    return <span className="pay-icon-dot" />
  }
  return <img src={src} alt={platform || 'chain'} />
}

function Payments() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState([])

  const loadPayments = async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    try {
      const { data } = await api.get('/api/admin/payments')
      setPayments(Array.isArray(data) ? data : [])
    } catch {
      setPayments([])
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void loadPayments()
  }, [])

  const togglePayment = async (id, enabled) => {
    setPayments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled: !enabled } : item))
    )
    try {
      await api.patch(`/api/admin/payments/${id}/toggle`, { enabled: !enabled })
    } catch {
      setPayments((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled } : item))
      )
      showNotice('更新支付方式失败')
    }
  }

  const deletePayment = async (id) => {
    if (!window.confirm('确认删除该支付方式？')) return
    try {
      await api.delete(`/api/admin/payments/${id}`)
      await loadPayments()
    } catch {
      showNotice('删除支付方式失败')
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-head">
        <Title level="2">支付设置</Title>
        <Text className="admin-subtitle">统一结构：name、platform、coins、address。</Text>
        <div className="admin-toolbar">
          <Button size="s" onClick={() => navigate('/payments/new')}>
            添加支付方式
          </Button>
        </div>
      </div>

      <List>
        <div className="admin-section">
          <Section header="支付方式列表">
            {loading ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : payments.length === 0 ? (
              <Placeholder description="暂无支付方式" />
            ) : (
              <div className="card-list">
                {payments.map((item) => (
                  <div className="line-card pay-card" key={item.id}>
                    <div className="pay-head">
                      <div className="pay-left">
                        <span className={`pay-icon tone-${iconTone(item.platform)}`}>
                          <PlatformIcon platform={item.platform} />
                        </span>
                        <div>
                          <Text className="line-title">{item.name || platformNameMap[item.platform] || item.platform || '--'}</Text>
                          <Caption className="pay-meta">
                            #{item.id} · {platformNameMap[item.platform] || item.platform || '--'}
                          </Caption>
                        </div>
                      </div>
                      <Switch checked={!!item.enabled} onChange={() => togglePayment(item.id, item.enabled)} />
                    </div>

                    <div className="pay-coins">
                      {normalizeCoins(item.coins).map((coin) => (
                        <span className="coin-pill" key={`${item.id}-${coin}`}>
                          {coin}
                        </span>
                      ))}
                      {normalizeCoins(item.coins).length === 0 && <span className="coin-pill coin-empty">--</span>}
                    </div>

                    <div className="pay-address-wrap compact">
                      <Caption className="pay-address-label">地址</Caption>
                      <Text className="pay-address-value">{shortText(item.address, 14, 10)}</Text>
                    </div>

                    <div className="mini-action">
                      <Button
                        size="s"
                        mode="outline"
                        onClick={() => navigate(`/payments/${item.id}/edit`, { state: { item } })}
                      >
                        编辑
                      </Button>
                      <Button size="s" mode="outline" onClick={() => deletePayment(item.id)}>
                        删除
                      </Button>
                    </div>
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

export default Payments
