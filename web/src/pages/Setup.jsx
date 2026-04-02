import React, { useState } from 'react'
import {
  List,
  Section,
  Cell,
  Select,
  Input,
  Button,
  Placeholder,
  Spinner,
} from '@telegram-apps/telegram-ui'
import { initApi } from '../services/api'

function Setup() {
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState({
    database: {
      type: 'sqlite',
      mysql: {
        host: '',
        port: 3306,
        database: '',
        username: '',
        password: '',
      },
    },
    system: {
      currency: 'CNY',
      timeout: 1800,
      fast_confirm: true,
      rate_adjust: 0,
    },
  })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await initApi.submitConfig(config)
      setDone(true)
    } catch (error) {
      console.error('Setup failed:', error)
      alert('配置失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <Placeholder
        header="配置完成"
        description="配置已生效，稍候即可继续使用 Mini App"
      >
        <img
          src="https://telegram.org/img/t_logo.svg"
          alt="Done"
          style={{ width: 144, height: 144 }}
        />
      </Placeholder>
    )
  }

  return (
    <List>
      <Section header="初始配置" footer={`步骤 ${step} / 2`}>
        {step === 1 && (
          <>
            <Cell>
              <Select
                header="数据库类型"
                value={config.database.type}
                onChange={(e) => setConfig({
                  ...config,
                  database: { ...config.database, type: e.target.value },
                })}
              >
                <option value="sqlite">SQLite（推荐）</option>
                <option value="mysql">MySQL</option>
              </Select>
            </Cell>

            {config.database.type === 'mysql' && (
              <>
                <Input
                  header="主机地址"
                  placeholder="localhost"
                  value={config.database.mysql.host}
                  onChange={(e) => setConfig({
                    ...config,
                    database: {
                      ...config.database,
                      mysql: { ...config.database.mysql, host: e.target.value },
                    },
                  })}
                />
                <Input
                  header="端口"
                  type="number"
                  placeholder="3306"
                  value={config.database.mysql.port}
                  onChange={(e) => setConfig({
                    ...config,
                    database: {
                      ...config.database,
                      mysql: { ...config.database.mysql, port: parseInt(e.target.value) || 3306 },
                    },
                  })}
                />
                <Input
                  header="数据库名"
                  placeholder="hashpay"
                  value={config.database.mysql.database}
                  onChange={(e) => setConfig({
                    ...config,
                    database: {
                      ...config.database,
                      mysql: { ...config.database.mysql, database: e.target.value },
                    },
                  })}
                />
                <Input
                  header="用户名"
                  placeholder="root"
                  value={config.database.mysql.username}
                  onChange={(e) => setConfig({
                    ...config,
                    database: {
                      ...config.database,
                      mysql: { ...config.database.mysql, username: e.target.value },
                    },
                  })}
                />
                <Input
                  header="密码"
                  type="password"
                  placeholder="••••••••"
                  value={config.database.mysql.password}
                  onChange={(e) => setConfig({
                    ...config,
                    database: {
                      ...config.database,
                      mysql: { ...config.database.mysql, password: e.target.value },
                    },
                  })}
                />
              </>
            )}

            <Cell>
              <Button
                size="l"
                stretched
                onClick={() => setStep(2)}
              >
                下一步
              </Button>
            </Cell>
          </>
        )}

        {step === 2 && (
          <>
            <Cell>
              <Select
                header="基准货币"
                value={config.system.currency}
                onChange={(e) => setConfig({
                  ...config,
                  system: { ...config.system, currency: e.target.value },
                })}
              >
                <option value="CNY">CNY - 人民币</option>
                <option value="USD">USD - 美元</option>
              </Select>
            </Cell>

            <Input
              header="订单超时（秒）"
              type="number"
              value={config.system.timeout}
              onChange={(e) => setConfig({
                ...config,
                system: { ...config.system, timeout: parseInt(e.target.value) || 1800 },
              })}
            />

            <Cell>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button
                  size="l"
                  mode="outline"
                  onClick={() => setStep(1)}
                  style={{ flex: 1 }}
                >
                  上一步
                </Button>
                <Button
                  size="l"
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  {loading ? <Spinner size="s" /> : '完成配置'}
                </Button>
              </div>
            </Cell>
          </>
        )}
      </Section>
    </List>
  )
}

export default Setup
