import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Caption, Input, List, Radio, Section, Text } from '@telegram-apps/telegram-ui'
import { AppPage } from '../components/AppPage'
import { adminApi } from '../utils/api'
import './Admin.scss'

const isIOS = ['ios', 'macos'].includes(window.Telegram?.WebApp?.platform || '')

function FormField({ label, children }) {
  if (!isIOS) {
    return <div className="field-wrap">{children}</div>
  }
  return (
    <div className="field-wrap field-wrap-inline">
      <Caption className="form-caption">{label}</Caption>
      <div className="field-inline-control">{children}</div>
    </div>
  )
}

function InitSetup() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    db_type: 'sqlite',
    mysql_host: 'localhost',
    mysql_port: '3306',
    mysql_database: 'hashpay',
    mysql_username: 'root',
    mysql_password: '',
  })

  const usingMySQL = form.db_type === 'mysql'
  const resultReady = Boolean(result?.ready)
  const updateForm = (key) => (e) => {
    const value = e?.target?.value ?? ''
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const submit = async () => {
    setSaving(true)
    try {
      const response = await adminApi.submitInstall({
        database: {
          type: form.db_type,
          sqlite: {},
          mysql: {
            host: form.mysql_host,
            port: Number(form.mysql_port) || 3306,
            database: form.mysql_database,
            username: form.mysql_username,
            password: form.mysql_password,
          },
        },
      })
      setResult({ ...(response.data || {}), message: response.info || '' })
      navigate('/setup/done', { replace: true })
    } catch (error) {
      setResult({ ready: false, message: error.apiError || '数据库初始化失败，请检查连接信息。' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppPage
      title="配置 HashPay"
      subtitle="选择数据库类型"
      className="setup-page"
      footer={(
        <Button stretched loading={saving} onClick={submit}>
          {saving ? '正在初始化...' : '下一步'}
        </Button>
      )}
    >
      <List>
        <div className="admin-section">
          <Section header="数据库类型">
            <div className="setup-radio-list">
              <label className="setup-radio-row">
                <div className="setup-radio-main">
                  <Radio
                    name="db_type"
                    value="sqlite"
                    checked={!usingMySQL}
                    onChange={() => {
                      setResult(null)
                      setForm((prev) => ({ ...prev, db_type: 'sqlite' }))
                    }}
                  />
                  <div className="setup-radio-copy">
                    <Text>SQLite</Text>
                    <Caption>无需配置，适合一般场景。</Caption>
                  </div>
                </div>
              </label>
              <label className="setup-radio-row">
                <div className="setup-radio-main">
                  <Radio
                    name="db_type"
                    value="mysql"
                    checked={usingMySQL}
                    onChange={() => {
                      setResult(null)
                      setForm((prev) => ({ ...prev, db_type: 'mysql' }))
                    }}
                  />
                  <div className="setup-radio-copy">
                    <Text>MySQL</Text>
                    <Caption>需配置服务器，适合高并发场景。</Caption>
                  </div>
                </div>
              </label>
            </div>
          </Section>
        </div>

        {usingMySQL ? (
          <div className="admin-section">
            <Section header="MySQL 连接信息">
              <div className="form-wrap">
                <FormField label="主机">
                  <Input
                    header={isIOS ? undefined : '主机'}
                    value={form.mysql_host}
                    onChange={updateForm('mysql_host')}
                    placeholder="localhost"
                  />
                </FormField>
                <FormField label="端口">
                  <Input
                    header={isIOS ? undefined : '端口'}
                    type="number"
                    value={form.mysql_port}
                    onChange={updateForm('mysql_port')}
                    placeholder="3306"
                  />
                </FormField>
                <FormField label="数据库名">
                  <Input
                    header={isIOS ? undefined : '数据库名'}
                    value={form.mysql_database}
                    onChange={updateForm('mysql_database')}
                    placeholder="hashpay"
                  />
                </FormField>
                <FormField label="用户名">
                  <Input
                    header={isIOS ? undefined : '用户名'}
                    value={form.mysql_username}
                    onChange={updateForm('mysql_username')}
                    placeholder="root"
                  />
                </FormField>
                <FormField label="密码">
                  <Input
                    header={isIOS ? undefined : '密码'}
                    type="password"
                    value={form.mysql_password}
                    onChange={updateForm('mysql_password')}
                    placeholder="输入数据库密码"
                  />
                </FormField>
              </div>
            </Section>
          </div>
        ) : null}

        {result ? (
          <div className="admin-section">
            <Section header="安装结果">
              <div className={`setup-result ${resultReady ? 'is-ready' : 'is-error'}`}>
                <strong>{resultReady ? '数据库已就绪' : '安装失败'}</strong>
                <p>{result.message || '配置已提交。'}</p>
              </div>
            </Section>
          </div>
        ) : null}

      </List>
    </AppPage>
  )
}

export default InitSetup
