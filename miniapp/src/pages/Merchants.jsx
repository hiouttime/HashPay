import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { AppGroup, AppPage } from '../components/AppPage'
import { formatTime, showNotice, shortText } from './AdminCommon'
import './Admin.scss'

function Merchants() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])

  const load = async () => {
    try {
      const { data } = await adminApi.merchants()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
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
    <AppPage
      title="商户管理"
      subtitle="维护 API 接入方、密钥与默认回调。"
      actions={<Button size="s" onClick={() => navigate('/merchants/new')}>新增商户</Button>}
    >
      <AppGroup title="商户列表" subtitle="这里展示当前网关开放给哪些商户接入。">
        <div className="stack-list">
          {items.map((item) => (
            <div key={item.id} className="work-row">
              <div className="work-row-head">
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.status === 'active' ? '已启用' : item.status}</p>
                </div>
                <div className="row-actions">
                  <button className="quiet-btn" onClick={() => navigate(`/merchants/${item.id}/edit`, { state: { item } })}>编辑</button>
                  <button className="quiet-btn danger" onClick={() => remove(item.id)}>删除</button>
                </div>
              </div>
              <dl className="detail-grid">
                <div><dt>商户 ID</dt><dd>{item.id}</dd></div>
                <div><dt>API Key</dt><dd>{shortText(item.api_key, 10, 8)}</dd></div>
                <div><dt>签名密钥</dt><dd>{shortText(item.secret_key, 10, 8)}</dd></div>
                <div><dt>默认回调</dt><dd>{item.callback_url || '--'}</dd></div>
                <div><dt>创建时间</dt><dd>{formatTime(item.created_at)}</dd></div>
              </dl>
            </div>
          ))}
          {items.length === 0 ? <div className="empty-state">还没有商户。先添加一个接入方，后续订单与回调才有归属。</div> : null}
        </div>
      </AppGroup>
    </AppPage>
  )
}

export default Merchants
