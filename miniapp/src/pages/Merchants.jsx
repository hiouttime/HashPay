import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section, Text, Caption, List, Button, Placeholder, Spinner } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { formatTime, showNotice, shortText } from './AdminCommon'
import PageTitle from '../components/PageTitle'
import './Admin.scss'

function Merchants() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await adminApi.merchants()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (id) => {
    if (!window.confirm('确认删除这个商户？')) return
    try {
      await adminApi.deleteMerchant(id)
      await load()
    } catch {
      showNotice('删除商户失败')
    }
  }

  return (
    <div className="admin-page">
      <PageTitle
        title="商户管理"
        subtitle="维护 API 接入方、密钥与默认回调。"
        actions={(
          <Button size="s" onClick={() => navigate('/merchants/new')}>
            添加商户
          </Button>
        )}
      />

      <List>
        <div className="admin-section">
          <Section header="商户列表">
            {loading ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : items.length === 0 ? (
              <Placeholder description="暂无商户" />
            ) : (
              <div className="card-list">
                {items.map((item) => (
                  <div className="line-card" key={item.id}>
                    <div className="line-head">
                      <Text className="line-title">{item.name}</Text>
                      <div className="line-head-start">
                        <Button size="s" mode="outline" onClick={() => navigate(`/merchants/${item.id}/edit`, { state: { item } })}>
                          编辑
                        </Button>
                        <Button size="s" mode="outline" onClick={() => remove(item.id)}>
                          删除
                        </Button>
                      </div>
                    </div>
                    <Caption className="line-desc">#{item.id}</Caption>
                    <Caption className="line-desc">API Key: {shortText(item.api_key, 10, 8)}</Caption>
                    <Caption className="line-desc">签名密钥: {shortText(item.secret_key, 10, 8)}</Caption>
                    <Caption className="line-desc">回调: {item.callback_url || '--'}</Caption>
                    <Caption className="line-desc">创建时间: {formatTime(item.created_at)}</Caption>
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

export default Merchants
