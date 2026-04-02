import React, { useEffect, useState } from 'react'
import { Section, Title, Text, List, Button, Placeholder, Spinner, Input } from '@telegram-apps/telegram-ui'
import api from '../utils/api'
import useTelegramBackButton from '../utils/useTelegramBackButton'
import { showNotice } from './AdminCommon'
import './Admin.scss'

const initialForm = {
  id: '',
  name: '',
  callback: '',
  apiKey: '',
}

function Sites() {
  useTelegramBackButton()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sites, setSites] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(initialForm)

  const loadSites = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/sites')
      setSites(Array.isArray(data) ? data : [])
    } catch {
      setSites([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSites()
  }, [])

  const startAdd = () => {
    setForm(initialForm)
    setEditing(true)
  }

  const startEdit = (site) => {
    setForm({
      id: site.id,
      name: site.name || '',
      callback: site.callback || '',
      apiKey: '',
    })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setForm(initialForm)
  }

  const saveSite = async () => {
    if (!form.name.trim() || !form.callback.trim()) {
      showNotice('请填写商户名称和回调地址')
      return
    }

    setSaving(true)
    try {
      if (form.id) {
        await api.put(`/api/admin/sites/${form.id}`, {
          name: form.name.trim(),
          callback: form.callback.trim(),
          api_key: form.apiKey.trim(),
        })
        showNotice('商户已更新')
      } else {
        const { data } = await api.post('/api/admin/sites', {
          name: form.name.trim(),
          callback: form.callback.trim(),
          api_key: form.apiKey.trim(),
        })
        showNotice(`商户已创建，安全密钥：${data.api_key}`)
      }

      cancelEdit()
      await loadSites()
    } catch {
      showNotice('保存商户失败')
    } finally {
      setSaving(false)
    }
  }

  const deleteSite = async (id) => {
    if (!window.confirm('确认删除该商户？')) return
    try {
      await api.delete(`/api/admin/sites/${id}`)
      await loadSites()
    } catch {
      showNotice('删除商户失败')
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-head">
        <Title level="2">商户管理</Title>
        <Text className="admin-subtitle">支持添加、编辑、删除商户。</Text>
        <div className="admin-toolbar">
          <Button size="s" onClick={startAdd}>
            添加商户
          </Button>
        </div>
      </div>

      <List>
        {editing && (
          <div className="admin-section">
            <Section header={form.id ? '编辑商户' : '添加商户'}>
              <div className="form-wrap">
                <div className="field-wrap">
                  <Input
                    header="商户名称"
                    placeholder="输入商户名称"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="field-wrap">
                  <Input
                    header="回调地址"
                    placeholder="https://merchant.example.com/callback"
                    value={form.callback}
                    onChange={(e) => setForm((prev) => ({ ...prev, callback: e.target.value }))}
                  />
                </div>

                <div className="field-wrap">
                  <Input
                    header={form.id ? '安全密钥（留空不修改）' : '安全密钥（可选）'}
                    placeholder={form.id ? '输入新密钥才会更新' : '留空自动生成'}
                    value={form.apiKey}
                    onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  />
                </div>

                <div className="section-action">
                  <Button size="m" stretched onClick={saveSite} disabled={saving}>
                    {saving ? '保存中...' : '保存'}
                  </Button>
                </div>
                <div className="section-action">
                  <Button size="m" mode="outline" stretched onClick={cancelEdit}>
                    取消
                  </Button>
                </div>
              </div>
            </Section>
          </div>
        )}

        <div className="admin-section">
          <Section header="商户列表">
            {loading ? (
              <div className="loading-wrap">
                <Spinner size="m" />
              </div>
            ) : sites.length === 0 ? (
              <Placeholder description="暂无商户" />
            ) : (
              <div className="card-list">
                {sites.map((site) => (
                  <div className="line-card" key={site.id}>
                    <div className="line-head">
                      <Text className="line-title">{site.name}</Text>
                      <div className="line-head-start">
                        <Button size="s" mode="outline" onClick={() => startEdit(site)}>
                          编辑
                        </Button>
                        <Button size="s" mode="outline" onClick={() => deleteSite(site.id)}>
                          删除
                        </Button>
                      </div>
                    </div>
                    <Text className="line-desc">#{site.id}</Text>
                    <Text className="line-desc">API Key: {site.api_key || '--'}</Text>
                    <Text className="line-desc">回调: {site.callback || '--'}</Text>
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

export default Sites
