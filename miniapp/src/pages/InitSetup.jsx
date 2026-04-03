import React, { useState } from 'react'
import { Button } from '@telegram-apps/telegram-ui'
import { AppPage } from '../components/AppPage'
import { setupApi } from '../utils/api'
import './Admin.scss'

function InitSetup() {
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    public_url: '',
    bot_token: '',
    sqlite_path: './data/hashpay.db',
    currency: 'CNY',
    timeout: '1800',
    rate_adjust: '0',
    fast_confirm: 'true',
  })

  const submit = async () => {
    setSaving(true)
    try {
      const { data } = await setupApi.submit({
        public_url: form.public_url,
        bot_token: form.bot_token,
        database: {
          type: 'sqlite',
          sqlite: { path: form.sqlite_path },
        },
        system: {
          currency: form.currency,
          timeout: form.timeout,
          rate_adjust: form.rate_adjust,
          fast_confirm: form.fast_confirm,
        },
      })
      setResult(data)
    } catch (error) {
      setResult({ message: error.response?.data?.message || '初始化失败，请检查公网地址、Bot Token 和数据库路径。' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppPage title="初始化 HashPay" subtitle="先完成公网入口、Bot 与基础计价配置，再去 Telegram 里绑定管理员。" hideNav>
      <section className="setup-stage">
        <div className="setup-copy">
          <p className="setup-kicker">First Boot</p>
          <h1>把网关先跑起来，再开始配支付。</h1>
          <p>这里不做复杂向导，只保留真正会阻塞系统启动的必要信息。</p>
        </div>
        <div className="setup-panel">
          <label className="form-field is-wide">
            <span>公网地址</span>
            <input value={form.public_url} onChange={(e) => setForm((prev) => ({ ...prev, public_url: e.target.value }))} placeholder="https://pay.example.com" />
          </label>
          <label className="form-field is-wide">
            <span>Bot Token</span>
            <input value={form.bot_token} onChange={(e) => setForm((prev) => ({ ...prev, bot_token: e.target.value }))} placeholder="123456:ABCDEF" />
          </label>
          <div className="form-grid">
            <label className="form-field">
              <span>SQLite 路径</span>
              <input value={form.sqlite_path} onChange={(e) => setForm((prev) => ({ ...prev, sqlite_path: e.target.value }))} />
            </label>
            <label className="form-field">
              <span>基础货币</span>
              <input value={form.currency} onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))} />
            </label>
            <label className="form-field">
              <span>超时（秒）</span>
              <input type="number" value={form.timeout} onChange={(e) => setForm((prev) => ({ ...prev, timeout: e.target.value }))} />
            </label>
            <label className="form-field">
              <span>汇率微调</span>
              <input value={form.rate_adjust} onChange={(e) => setForm((prev) => ({ ...prev, rate_adjust: e.target.value }))} />
            </label>
          </div>
          <Button stretched loading={saving} onClick={submit}>写入配置并启动</Button>
          {result ? (
            <div className="setup-result">
              <strong>{result.ready ? '运行时已就绪' : '等待管理员验证'}</strong>
              <p>{result.message || '配置已提交。'}</p>
              {result.setup_pin ? <code>验证码：{result.setup_pin}</code> : null}
            </div>
          ) : null}
        </div>
      </section>
    </AppPage>
  )
}

export default InitSetup
