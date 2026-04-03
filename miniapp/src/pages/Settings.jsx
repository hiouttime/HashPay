import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@telegram-apps/telegram-ui'
import { adminApi } from '../utils/api'
import { AppGroup, AppPage } from '../components/AppPage'
import { showNotice } from './AdminCommon'
import './Admin.scss'

function Settings() {
  const [form, setForm] = useState({
    currency: 'CNY',
    timeout: '1800',
    rate_adjust: '0',
    fast_confirm: 'true',
  })
  const [bannerURL, setBannerURL] = useState('/media/banner')
  const fileRef = useRef(null)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await adminApi.settings()
        setForm({
          currency: data.currency || 'CNY',
          timeout: data.timeout || '1800',
          rate_adjust: data.rate_adjust || '0',
          fast_confirm: data.fast_confirm || 'true',
        })
        setBannerURL(data.banner_url || '/media/banner')
      } catch {
        setBannerURL('/media/banner')
      }
    }
    void load()
  }, [])

  const save = async () => {
    try {
      await adminApi.saveSettings(form)
      showNotice('设置已保存')
    } catch {
      showNotice('保存设置失败')
    }
  }

  const upload = async (file) => {
    const payload = new FormData()
    payload.append('file', file)
    try {
      const { data } = await adminApi.uploadBanner(payload)
      setBannerURL(`${data.banner_url}?t=${Date.now()}`)
      showNotice('横幅已更新')
    } catch {
      showNotice('横幅上传失败')
    }
  }

  return (
    <AppPage title="系统设置" subtitle="这里只保留真正影响计价、超时和展示的关键设置。">
      <AppGroup title="计价与过期">
        <div className="form-grid">
          <label className="form-field">
            <span>基础货币</span>
            <input value={form.currency} onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))} />
          </label>
          <label className="form-field">
            <span>订单超时（秒）</span>
            <input type="number" value={form.timeout} onChange={(e) => setForm((prev) => ({ ...prev, timeout: e.target.value }))} />
          </label>
          <label className="form-field">
            <span>汇率微调</span>
            <input value={form.rate_adjust} onChange={(e) => setForm((prev) => ({ ...prev, rate_adjust: e.target.value }))} />
          </label>
          <label className="form-field">
            <span>快速确认</span>
            <select value={form.fast_confirm} onChange={(e) => setForm((prev) => ({ ...prev, fast_confirm: e.target.value }))}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
        </div>
        <div className="row-actions">
          <Button size="s" onClick={save}>保存配置</Button>
        </div>
      </AppGroup>

      <AppGroup title="Inline Banner" subtitle="只有 inline 订单占位需要横幅，普通管理消息不使用图片。">
        <div className="banner-stage">
          <img src={bannerURL} alt="Banner preview" />
          <div className="row-actions">
            <Button size="s" mode="outline" onClick={() => fileRef.current?.click()}>更换横幅</Button>
          </div>
          <input ref={fileRef} hidden type="file" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
          }} />
        </div>
      </AppGroup>
    </AppPage>
  )
}

export default Settings
