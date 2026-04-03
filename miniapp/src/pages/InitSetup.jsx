import React, { useState } from 'react'
import { Button } from '@telegram-apps/telegram-ui'
import { AppPage } from '../components/AppPage'
import { adminApi } from '../utils/api'
import './Admin.scss'

function InitSetup() {
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    db_type: 'sqlite',
    sqlite_path: './data/hashpay.db',
    mysql_host: 'localhost',
    mysql_port: '3306',
    mysql_database: 'hashpay',
    mysql_username: 'root',
    mysql_password: '',
  })

  const submit = async () => {
    setSaving(true)
    try {
      const { data } = await adminApi.submitInstall({
        database: {
          type: form.db_type,
          sqlite: { path: form.sqlite_path },
          mysql: {
            host: form.mysql_host,
            port: Number(form.mysql_port) || 3306,
            database: form.mysql_database,
            username: form.mysql_username,
            password: form.mysql_password,
          },
        },
      })
      setResult(data)
    } catch (error) {
      setResult({ message: error.response?.data?.message || '数据库初始化失败，请检查连接信息。' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppPage title="初始化 HashPay" subtitle="这里只做数据库初始化，完成后系统进入正常运行。" hideNav>
      <section className="setup-stage">
        <div className="setup-copy">
          <p className="setup-kicker">First Boot</p>
          <h1>先把数据库接好，再进入后台。</h1>
          <p>公网地址和 Bot Token 已经在命令行初始化阶段处理过，这里只负责数据库配置。</p>
        </div>
        <div className="setup-panel">
          <div className="form-grid">
            <label className="form-field">
              <span>数据库类型</span>
              <select value={form.db_type} onChange={(e) => setForm((prev) => ({ ...prev, db_type: e.target.value }))}>
                <option value="sqlite">SQLite</option>
                <option value="mysql">MySQL</option>
              </select>
            </label>
            {form.db_type === 'sqlite' ? (
              <label className="form-field">
                <span>SQLite 路径</span>
                <input value={form.sqlite_path} onChange={(e) => setForm((prev) => ({ ...prev, sqlite_path: e.target.value }))} />
              </label>
            ) : (
              <>
                <label className="form-field">
                  <span>MySQL 主机</span>
                  <input value={form.mysql_host} onChange={(e) => setForm((prev) => ({ ...prev, mysql_host: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>MySQL 端口</span>
                  <input type="number" value={form.mysql_port} onChange={(e) => setForm((prev) => ({ ...prev, mysql_port: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>数据库名</span>
                  <input value={form.mysql_database} onChange={(e) => setForm((prev) => ({ ...prev, mysql_database: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>用户名</span>
                  <input value={form.mysql_username} onChange={(e) => setForm((prev) => ({ ...prev, mysql_username: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>密码</span>
                  <input type="password" value={form.mysql_password} onChange={(e) => setForm((prev) => ({ ...prev, mysql_password: e.target.value }))} />
                </label>
              </>
            )}
          </div>
          <Button stretched loading={saving} onClick={submit}>连接数据库并启动</Button>
          {result ? (
            <div className="setup-result">
              <strong>{result.ready ? '数据库已就绪' : '初始化未完成'}</strong>
              <p>{result.message || '配置已提交。'}</p>
            </div>
          ) : null}
        </div>
      </section>
    </AppPage>
  )
}

export default InitSetup
