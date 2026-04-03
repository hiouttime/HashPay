import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Text, Caption, List, Button, Placeholder, Spinner } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { shortText, showNotice } from './AdminCommon'
import PageTitle from '../components/PageTitle'
import tronIcon from '../assets/chains/tron.svg'
import evmIcon from '../assets/chains/evm.svg'
import solanaIcon from '../assets/chains/solana.svg'
import tonIcon from '../assets/chains/ton.svg'
import './Admin.scss'

const driverNameMap = {
  'chain/tron': 'TRON (TRC20)',
  'chain/evm': 'EVM',
  'chain/solana': 'Solana',
  'chain/ton': 'TON',
  'exchange/binance': 'Binance 内转',
}

function normalizeCoins(fields) {
  const value = String(fields?.currencies || '').trim()
  if (!value) return []
  return Array.from(new Set(value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean)))
}

function iconTone(driver, network) {
  const key = network || driver
  if (String(key).includes('tron')) return 'tron'
  if (String(key).includes('solana')) return 'solana'
  if (String(key).includes('ton')) return 'ton'
  if (String(key).includes('bsc')) return 'bsc'
  if (String(key).includes('polygon')) return 'polygon'
  return 'eth'
}

function PlatformIcon({ driver, network }) {
  const tone = iconTone(driver, network)
  let src = ''
  if (tone === 'tron') src = tronIcon
  if (tone === 'solana') src = solanaIcon
  if (tone === 'ton') src = tonIcon
  if (tone === 'eth' || tone === 'bsc' || tone === 'polygon') src = evmIcon
  if (!src) {
    return <span className="pay-icon-dot" />
  }
  return <img src={src} alt={driver || 'chain'} />
}

function Payments() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])

  const loadPayments = async () => {
    setLoading(true)
    try {
      const { data } = await adminApi.paymentMethods()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPayments()
  }, [])

  const remove = async (id) => {
    if (!window.confirm('确认删除该支付方式？')) return
    try {
      await adminApi.deletePaymentMethod(id)
      await loadPayments()
    } catch {
      showNotice('删除支付方式失败')
    }
  }

  return (
    <div className="admin-page">
      <PageTitle
        title="支付设置"
        subtitle="保持轻量，按驱动统一管理收款方式。"
        actions={(
          <Button size="s" onClick={() => navigate('/payments/new')}>
            添加支付方式
          </Button>
        )}
      />

      <List>
        <div className="admin-section">
          <Section header="支付方式列表">
            {loading ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : items.length === 0 ? (
              <Placeholder description="暂无支付方式" />
            ) : (
              <div className="card-list">
                {items.map((item) => {
                  const coins = normalizeCoins(item.fields)
                  const network = item.fields?.network || item.kind
                  const address = item.fields?.address || item.fields?.account_name || '--'
                  return (
                    <div className="line-card pay-card" key={item.id}>
                      <div className="pay-head">
                        <div className="pay-left">
                          <span className={`pay-icon tone-${iconTone(item.driver, network)}`}>
                            <PlatformIcon driver={item.driver} network={network} />
                          </span>
                          <div>
                            <Text className="line-title">{item.name || driverNameMap[item.driver] || item.driver || '--'}</Text>
                            <Caption className="pay-meta">
                              #{item.id} · {driverNameMap[item.driver] || item.driver || '--'}
                            </Caption>
                          </div>
                        </div>
                        <span className={`status-pill status-${item.enabled ? 'paid' : 'expired'}`}>
                          {item.enabled ? '启用' : '停用'}
                        </span>
                      </div>

                      <div className="pay-coins">
                        {coins.map((coin) => (
                          <span className="coin-pill" key={`${item.id}-${coin}`}>
                            {coin}
                          </span>
                        ))}
                        {coins.length === 0 && <span className="coin-pill coin-empty">--</span>}
                      </div>

                      <div className="pay-address-wrap compact">
                        <Caption className="pay-address-label">{item.kind === 'exchange' ? '账户' : '地址'}</Caption>
                        <Text className="pay-address-value">{shortText(address, 14, 10)}</Text>
                      </div>

                      <div className="mini-action">
                        <Button size="s" mode="outline" onClick={() => navigate(`/payments/${item.id}/edit`, { state: { item } })}>
                          编辑
                        </Button>
                        <Button size="s" mode="outline" onClick={() => remove(item.id)}>
                          删除
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>
        </div>
      </List>
    </div>
  )
}

export default Payments
