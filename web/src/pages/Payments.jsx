import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  List,
  Section,
  Cell,
  Button,
  Input,
  Select,
  Spinner,
  Placeholder,
  IconButton,
  Switch,
} from '@telegram-apps/telegram-ui'
import { adminApi } from '../services/api'

function Payments() {
  const navigate = useNavigate()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    type: 'blockchain',
    chain: 'TRON',
    currency: 'USDT',
    address: '',
    api_key: '',
    enabled: true,
  })

  useEffect(() => {
    loadPayments()
  }, [])

  const loadPayments = async () => {
    try {
      const { data } = await adminApi.getPayments()
      setPayments(data || [])
    } catch (error) {
      console.error('Failed to load payments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    try {
      await adminApi.addPayment(form)
      setShowAdd(false)
      setForm({
        type: 'blockchain',
        chain: 'TRON',
        currency: 'USDT',
        address: '',
        api_key: '',
        enabled: true,
      })
      loadPayments()
    } catch (error) {
      console.error('Failed to add payment:', error)
      alert('添加失败')
    }
  }

  const handleToggle = async (id, enabled) => {
    try {
      await adminApi.togglePayment(id, !enabled)
      loadPayments()
    } catch (error) {
      console.error('Failed to toggle payment:', error)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('确定要删除此支付方式？')) return
    try {
      await adminApi.deletePayment(id)
      loadPayments()
    } catch (error) {
      console.error('Failed to delete payment:', error)
    }
  }

  return (
    <List>
      <Section
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconButton size="s" onClick={() => navigate('/dashboard')}>
              ←
            </IconButton>
            <span>支付方式</span>
          </div>
        }
      >
        {!showAdd && (
          <Cell>
            <Button size="l" stretched onClick={() => setShowAdd(true)}>
              添加支付方式
            </Button>
          </Cell>
        )}

        {showAdd && (
          <>
            <Cell>
              <Select
                header="类型"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="blockchain">区块链</option>
                <option value="exchange">交易所</option>
                <option value="wallet">钱包</option>
              </Select>
            </Cell>

            {form.type === 'blockchain' && (
              <>
                <Cell>
                  <Select
                    header="链"
                    value={form.chain}
                    onChange={(e) => setForm({ ...form, chain: e.target.value })}
                  >
                    <option value="TRON">TRON</option>
                    <option value="BSC">BSC</option>
                    <option value="ETH">ETH</option>
                  </Select>
                </Cell>

                <Input
                  header="币种"
                  placeholder="USDT"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />

                <Input
                  header="收款地址"
                  placeholder="输入收款地址"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />

                <Input
                  header="API Key（可选）"
                  placeholder="用于加速交易查询"
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                />
              </>
            )}

            <Cell>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button
                  size="l"
                  mode="outline"
                  onClick={() => setShowAdd(false)}
                  style={{ flex: 1 }}
                >
                  取消
                </Button>
                <Button
                  size="l"
                  onClick={handleAdd}
                  style={{ flex: 1 }}
                >
                  添加
                </Button>
              </div>
            </Cell>
          </>
        )}
      </Section>

      <Section header="已添加">
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <Spinner size="m" />
          </div>
        ) : payments.length === 0 ? (
          <Placeholder description="暂无支付方式" />
        ) : (
          payments.map((p) => (
            <Cell
              key={p.id}
              subtitle={`${p.address?.slice(0, 8)}...${p.address?.slice(-8)}`}
              after={
                <Switch
                  checked={p.enabled}
                  onChange={() => handleToggle(p.id, p.enabled)}
                />
              }
            >
              {p.chain} ({p.currency})
            </Cell>
          ))
        )}
      </Section>
    </List>
  )
}

export default Payments
