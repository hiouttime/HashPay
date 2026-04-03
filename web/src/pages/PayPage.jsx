import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { orderApi } from '../services/api'

function amount(value, digits = 6) {
  const number = Number(value || 0)
  return number.toFixed(digits).replace(/\.?0+$/, '')
}

function timeText(ts) {
  if (!ts) return '--'
  if (typeof ts === 'string' && Number.isNaN(Number(ts))) {
    return new Date(ts).toLocaleString()
  }
  const value = Number(ts) > 1000000000000 ? Number(ts) : Number(ts) * 1000
  return new Date(value).toLocaleString()
}

function remain(expireAt) {
  if (typeof expireAt === 'string' && Number.isNaN(Number(expireAt))) {
    return Math.max(0, Math.floor(new Date(expireAt).getTime() / 1000) - Math.floor(Date.now() / 1000))
  }
  const value = Number(expireAt) > 1000000000000 ? Math.floor(Number(expireAt) / 1000) : Number(expireAt)
  return Math.max(0, value - Math.floor(Date.now() / 1000))
}

function mmss(total) {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function PayPage() {
  const { orderId } = useParams()
  const [checkout, setCheckout] = useState(null)
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('pending')
  const [tick, setTick] = useState(0)
  const [redirectTick, setRedirectTick] = useState(4)

  const load = async () => {
    try {
      const { data } = await orderApi.getCheckout(orderId)
      setCheckout(data)
      setSelected(data.selected || null)
      setStatus(data.order?.status || 'pending')
      setTick(remain(data.order?.expire_at))
    } catch {
      setCheckout(null)
    }
  }

  useEffect(() => {
    void load()
  }, [orderId])

  useEffect(() => {
    if (!checkout?.order?.expire_at || status !== 'pending') return undefined
    const timer = window.setInterval(() => {
      const next = remain(checkout.order.expire_at)
      setTick(next)
      if (next <= 0) setStatus('expired')
    }, 1000)
    return () => window.clearInterval(timer)
  }, [checkout?.order?.expire_at, status])

  useEffect(() => {
    if (status !== 'pending') return undefined
    const timer = window.setInterval(async () => {
      try {
        const { data } = await orderApi.checkStatus(orderId)
        setStatus(data.status || 'pending')
        if (data.status === 'paid' && checkout) {
          setCheckout((prev) => ({ ...prev, order: { ...prev.order, ...data } }))
        }
      } catch {}
    }, 5000)
    return () => window.clearInterval(timer)
  }, [orderId, status, checkout])

  useEffect(() => {
    if (status !== 'paid' || !checkout?.order?.redirect_url) return undefined
    setRedirectTick(4)
    const timer = window.setInterval(() => {
      setRedirectTick((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer)
          window.location.href = checkout.order.redirect_url
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [status, checkout?.order?.redirect_url])

  const currencies = useMemo(() => Object.keys(checkout?.routes || {}), [checkout])
  const [currentCurrency, setCurrentCurrency] = useState('')

  useEffect(() => {
    if (currencies.length && !currentCurrency) {
      setCurrentCurrency(currencies[0])
    }
  }, [currencies, currentCurrency])

  const routeOptions = checkout?.routes?.[currentCurrency] || []

  const selectRoute = async (item) => {
    try {
      const { data } = await orderApi.selectPayment(orderId, item.method_id, currentCurrency)
      setSelected(data)
    } catch {
      window.alert('选择支付方式失败')
    }
  }

  const copy = async (value, label) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(String(value))
      window.alert(`${label}已复制`)
    } catch {
      window.alert(`复制${label}失败`)
    }
  }

  if (!checkout) {
    return (
      <div className="checkout-shell">
        <div className="checkout-panel empty">
          <strong>订单不可用</strong>
          <p>当前订单不存在，或商户尚未完成网关初始化。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="checkout-shell">
      <div className="checkout-hero">
        <div className="hero-copy">
          <p className="hero-kicker">HashPay Checkout</p>
          <h1>{amount(checkout.order?.fiat_amount, 2)} {checkout.order?.fiat_currency}</h1>
          <p>{checkout.merchant?.name || checkout.order?.merchant_id} 向你发起一笔托管收款。</p>
        </div>
        <div className="hero-meta">
          <div><span>订单号</span><strong>{checkout.order?.id}</strong></div>
          <div><span>商户单号</span><strong>{checkout.order?.merchant_order_no || '--'}</strong></div>
          <div><span>创建时间</span><strong>{timeText(checkout.order?.created_at)}</strong></div>
          <div><span>过期时间</span><strong>{timeText(checkout.order?.expire_at)}</strong></div>
        </div>
      </div>

      {status === 'paid' ? (
        <section className="checkout-state is-success">
          <strong>付款已确认</strong>
          <p>链上或系统通知已经完成确认，当前订单不需要重复支付。</p>
          {checkout.order?.redirect_url ? <p>{redirectTick} 秒后自动返回商户。</p> : <p>商户没有配置返回地址。</p>}
        </section>
      ) : status === 'expired' ? (
        <section className="checkout-state is-expired">
          <strong>订单已过期</strong>
          <p>请勿继续付款，如需继续请让商户重新创建订单。</p>
        </section>
      ) : (
        <>
          <section className="checkout-bar">
            <div>
              <span>剩余支付时间</span>
              <strong>{mmss(tick)}</strong>
            </div>
            <p>请严格按页面金额支付，避免金额对不上导致无法自动确认。</p>
          </section>

          <div className="checkout-grid">
            <section className="checkout-section">
              <div className="section-head">
                <span>Step 1</span>
                <strong>选择币种</strong>
              </div>
              <div className="chip-row">
                {currencies.map((item) => (
                  <button key={item} className={`chip ${item === currentCurrency ? 'is-active' : ''}`} onClick={() => setCurrentCurrency(item)}>
                    {item}
                  </button>
                ))}
              </div>

              <div className="section-head">
                <span>Step 2</span>
                <strong>选择支付方案</strong>
              </div>
              <div className="route-list">
                {routeOptions.map((item) => (
                  <button
                    key={`${item.method_id}-${item.network}`}
                    className={`route-item ${selected?.method_id === item.method_id ? 'is-active' : ''}`}
                    onClick={() => selectRoute(item)}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.network} · {item.kind === 'exchange' ? '内部转账' : '链上转账'}</p>
                    </div>
                    <div className="route-amount">{amount(item.amount)} {item.currency}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="checkout-section emphasis">
              <div className="section-head">
                <span>Step 3</span>
                <strong>完成付款</strong>
              </div>
              {selected ? (
                <>
                  <div className="pay-head">
                    <div><span>网络</span><strong>{selected.network}</strong></div>
                    <div><span>应付金额</span><strong>{amount(selected.amount)} {selected.currency}</strong></div>
                  </div>

                  {selected.qr_value ? (
                    <div className="qr-stage">
                      <QRCodeCanvas value={selected.qr_value} size={184} />
                    </div>
                  ) : null}

                  {selected.address ? (
                    <div className="pay-field">
                      <span>收款地址</span>
                      <code>{selected.address}</code>
                      <button className="ghost-btn" onClick={() => copy(selected.address, '地址')}>复制地址</button>
                    </div>
                  ) : null}

                  {selected.account_name ? (
                    <div className="pay-field">
                      <span>收款账户</span>
                      <code>{selected.account_name}</code>
                      <button className="ghost-btn" onClick={() => copy(selected.account_name, '收款账户')}>复制账户</button>
                    </div>
                  ) : null}

                  {selected.memo ? (
                    <div className="pay-field">
                      <span>转账备注</span>
                      <code>{selected.memo}</code>
                      <button className="ghost-btn" onClick={() => copy(selected.memo, '备注')}>复制备注</button>
                    </div>
                  ) : null}

                  <div className="pay-field">
                    <span>付款说明</span>
                    <p>{selected.instructions || '按页面展示的网络、币种和金额完成付款。'}</p>
                    <button className="ghost-btn" onClick={() => copy(amount(selected.amount), '金额')}>复制金额</button>
                  </div>
                </>
              ) : (
                <div className="empty-stage">
                  <strong>先在左侧选一个支付方式</strong>
                  <p>默认展示的是当前订单可用的币种和网络。选择后右侧会固定显示地址或交易所账户信息。</p>
                </div>
              )}
            </section>
          </div>

          <section className="checkout-help">
            <strong>需要帮助？</strong>
            <p>{checkout.help?.tips}</p>
            <button className="ghost-btn" onClick={() => copy(checkout.help?.order_id, '订单号')}>复制订单号</button>
          </section>
        </>
      )}
    </div>
  )
}

export default PayPage
