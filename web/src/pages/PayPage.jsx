import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  List,
  Section,
  Cell,
  Button,
  Spinner,
  Placeholder,
  Title,
  Subheadline,
  Badge,
} from '@telegram-apps/telegram-ui'
import { QRCodeCanvas } from 'qrcode.react'
import { orderApi } from '../services/api'

function PayPage() {
  const { orderId } = useParams()
  const [methods, setMethods] = useState([])
  const [selected, setSelected] = useState(null)
  const [payInfo, setPayInfo] = useState(null)
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPaymentMethods()
  }, [orderId])

  useEffect(() => {
    if (status !== 'pending' || !payInfo) return

    const interval = setInterval(async () => {
      try {
        const { data } = await orderApi.checkStatus(orderId)
        if (data.status !== 'pending') {
          setStatus(data.status)
        }
      } catch (error) {
        console.error('Status check failed:', error)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [orderId, status, payInfo])

  const loadPaymentMethods = async () => {
    try {
      const { data } = await orderApi.getPaymentMethods(orderId)
      setMethods(data || [])
    } catch (error) {
      console.error('Failed to load payment methods:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = async (method) => {
    setSelected(method.id)
    try {
      const { data } = await orderApi.selectPayment(orderId, method.id)
      setPayInfo(data)
    } catch (error) {
      console.error('Failed to select payment:', error)
      alert('选择支付方式失败')
    }
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(payInfo.address)
    alert('地址已复制')
  }

  if (status === 'paid') {
    return (
      <Placeholder
        header="支付成功"
        description="感谢您的付款"
      >
        <div style={{ fontSize: '64px' }}>✅</div>
      </Placeholder>
    )
  }

  if (status === 'expired') {
    return (
      <Placeholder
        header="订单已过期"
        description="请重新创建订单"
      >
        <div style={{ fontSize: '64px' }}>⏰</div>
      </Placeholder>
    )
  }

  return (
    <List>
      <Section header="支付订单" footer={`订单号: ${orderId}`}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <Spinner size="m" />
          </div>
        ) : !payInfo ? (
          <>
            <Cell>
              <Subheadline weight="2">选择支付方式</Subheadline>
            </Cell>
            {methods.map((method) => (
              <Cell
                key={method.id}
                onClick={() => handleSelect(method)}
                after={
                  <Subheadline level="2" weight="3">
                    {method.amount.toFixed(6)} {method.currency}
                  </Subheadline>
                }
                style={{
                  background: selected === method.id ? 'var(--tgui--secondary_bg_color)' : undefined,
                }}
              >
                {method.name}
              </Cell>
            ))}
          </>
        ) : (
          <>
            <Cell>
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <Title level="1" weight="1">
                  {payInfo.amount.toFixed(6)}
                </Title>
                <Subheadline weight="3" style={{ opacity: 0.6 }}>
                  {payInfo.currency}
                </Subheadline>
              </div>
            </Cell>

            <Cell>
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <QRCodeCanvas
                  value={payInfo.address}
                  size={180}
                  bgColor="transparent"
                  fgColor="currentColor"
                />
              </div>
            </Cell>

            <Cell onClick={copyAddress} description="点击复制地址">
              <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                {payInfo.address}
              </code>
            </Cell>

            <Cell>
              <div style={{ textAlign: 'center' }}>
                <Badge type="dot">等待支付中...</Badge>
              </div>
            </Cell>
          </>
        )}
      </Section>
    </List>
  )
}

export default PayPage
