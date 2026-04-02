import React, { useMemo, useState } from 'react'
import {
  List,
  Section,
  Cell,
  Button,
  Input,
  Select,
  Checkbox,
  Radio,
  Title,
  Text,
  Caption,
  Placeholder,
} from '@telegram-apps/telegram-ui'
import api from '../utils/api'
import tronIcon from '../assets/chains/tron.svg'
import evmIcon from '../assets/chains/evm.svg'
import solanaIcon from '../assets/chains/solana.svg'
import tonIcon from '../assets/chains/ton.svg'
import './InitSetup.scss'

const chainMeta = {
  tron: {
    title: 'TRON (TRC20)',
    subtitle: '常用USDT网络',
    tokens: ['USDT', 'TRX'],
  },
  evm: {
    title: 'EVM 收款地址',
    subtitle: 'ETH、BSC、Polygon 等EVM虚拟机网络',
    tokens: ['USDT', 'USDC', 'ETH', 'BNB', 'MATIC'],
  },
  solana: {
    title: 'Solana',
    subtitle: '高吞吐、低费用的网络',
    tokens: ['USDT', 'USDC', 'SOL'],
  },
  ton: {
    title: 'TON',
    subtitle: 'Telegram 生态网络',
    tokens: ['USDT', 'TON'],
  },
}

const evmNetworks = [
  { key: 'eth', label: 'Ethereum (ERC20)' },
  { key: 'bsc', label: 'BNB Smart Chain (BEP20)' },
  { key: 'polygon', label: 'Polygon' },
]

const currencyList = ['CNY', 'USD', 'EUR', 'GBP', 'TWD']

function generateMerchantKey() {
  const bytes = new Uint8Array(16)
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  const suffix = Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('')
  return `hp_${suffix}`
}

function createMerchantItem() {
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: '',
    callback: '',
    apiKey: generateMerchantKey(),
  }
}

function ChainIcon({ type }) {
  const iconMap = {
    tron: tronIcon,
    evm: evmIcon,
    solana: solanaIcon,
    ton: tonIcon,
  }

  return (
    <span className={`chain-icon ${type}`} aria-hidden="true">
      <img src={iconMap[type]} alt="" />
    </span>
  )
}

function InitSetup() {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  const [config, setConfig] = useState({
    database: {
      type: 'sqlite',
      mysql: {
        host: '',
        port: 3306,
        database: 'hashpay',
        username: '',
        password: '',
      },
    },
    system: {
      currency: 'CNY',
      timeout: 1800,
      fastConfirm: true,
      rateAdjust: null,
    },
  })

  const [chainState, setChainState] = useState({
    tron: { enabled: false, address: '', tokens: [] },
    evm: {
      enabled: false,
      address: '',
      tokens: [],
      networks: { eth: true, bsc: false, polygon: false },
    },
    solana: { enabled: false, address: '', tokens: [] },
    ton: { enabled: false, address: '', tokens: [] },
  })

  const [exchangeState, setExchangeState] = useState({
    enabled: false,
    apiKey: '',
    apiSecret: '',
    passphrase: '',
  })

  const [walletState, setWalletState] = useState({
    enabled: false,
    huioneApiKey: '',
    okpayApiKey: '',
  })

  const [merchants, setMerchants] = useState([])

  const chainEnabled = useMemo(
    () => Object.values(chainState).some((item) => item.enabled),
    [chainState]
  )
  const hasPaymentMethod = chainEnabled || exchangeState.enabled || walletState.enabled

  const toggleChainEnabled = (key, checked) => {
    setChainState((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: checked },
    }))
  }

  const updateChainAddress = (key, value) => {
    setChainState((prev) => ({
      ...prev,
      [key]: { ...prev[key], address: value },
    }))
  }

  const toggleChainToken = (key, token) => {
    setChainState((prev) => {
      const hasToken = prev[key].tokens.includes(token)
      const tokens = hasToken
        ? prev[key].tokens.filter((item) => item !== token)
        : [...prev[key].tokens, token]
      return {
        ...prev,
        [key]: { ...prev[key], tokens },
      }
    })
  }

  const toggleEvmNetwork = (network, checked) => {
    setChainState((prev) => ({
      ...prev,
      evm: {
        ...prev.evm,
        networks: {
          ...prev.evm.networks,
          [network]: checked,
        },
      },
    }))
  }

  const addMerchant = () => {
    setMerchants((prev) => [...prev, createMerchantItem()])
  }

  const updateMerchant = (id, key, value) => {
    setMerchants((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    )
  }

  const removeMerchant = (id) => {
    setMerchants((prev) => prev.filter((item) => item.id !== id))
  }

  const submitConfig = async () => {
    if (config.database.type === 'mysql') {
      if (!config.database.mysql.password) {
        window.Telegram?.WebApp?.showAlert?.('请填写数据库密码')
        return
      }
    }
    for (const merchant of merchants) {
      if (!merchant.name.trim() || !merchant.callback.trim() || !merchant.apiKey.trim()) {
        window.Telegram?.WebApp?.showAlert?.('请完整填写商户名称、回调地址和安全密钥')
        return
      }
    }

    setLoading(true)
    try {
      const databaseConfig =
        config.database.type === 'mysql'
          ? {
              ...config.database,
              mysql: {
                ...config.database.mysql,
                port: config.database.mysql.port || 3306,
              },
            }
          : config.database

      const payload = {
        database: databaseConfig,
        system: {
          currency: config.system.currency,
          timeout: Number(config.system.timeout) || 1800,
          fast_confirm: !!config.system.fastConfirm,
          rate_adjust: Number(config.system.rateAdjust) || 0,
        },
        merchants: merchants.map((item) => ({
          name: item.name.trim(),
          callback: item.callback.trim(),
          api_key: item.apiKey.trim(),
        })),
        payments: [],
      }

      if (chainState.tron.enabled) {
        payload.payments.push({
          type: 'blockchain',
          chain: 'tron',
          address: chainState.tron.address,
          tokens: chainState.tron.tokens,
        })
      }

      if (chainState.evm.enabled) {
        evmNetworks.forEach((item) => {
          if (!chainState.evm.networks[item.key]) return
          payload.payments.push({
            type: 'blockchain',
            chain: item.key,
            address: chainState.evm.address,
            tokens: chainState.evm.tokens,
          })
        })
      }

      if (chainState.solana.enabled) {
        payload.payments.push({
          type: 'blockchain',
          chain: 'solana',
          address: chainState.solana.address,
          tokens: chainState.solana.tokens,
        })
      }

      if (chainState.ton.enabled) {
        payload.payments.push({
          type: 'blockchain',
          chain: 'ton',
          address: chainState.ton.address,
          tokens: chainState.ton.tokens,
        })
      }

      if (exchangeState.enabled && exchangeState.apiKey) {
        payload.payments.push({
          type: 'exchange',
          platform: 'okx',
          config: {
            apiKey: exchangeState.apiKey,
            apiSecret: exchangeState.apiSecret,
            passphrase: exchangeState.passphrase,
          },
        })
      }

      if (walletState.enabled) {
        if (walletState.huioneApiKey) {
          payload.payments.push({
            type: 'wallet',
            platform: 'huione',
            config: { apiKey: walletState.huioneApiKey },
          })
        }
        if (walletState.okpayApiKey) {
          payload.payments.push({
            type: 'wallet',
            platform: 'okpay',
            config: { apiKey: walletState.okpayApiKey },
          })
        }
      }

      await api.post('/api/config', payload)
      setStep(3)
    } catch (error) {
      console.error('配置提交失败:', error)
      window.Telegram?.WebApp?.showAlert?.('配置提交失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const nextStep = async () => {
    if (step === 2) {
      await submitConfig()
      return
    }
    setStep((prev) => prev + 1)
  }

  const prevStep = () => {
    setStep((prev) => Math.max(0, prev - 1))
  }

  const renderDatabaseStep = () => (
    <>
      <Section header="数据库类型">
        <Cell
          Component="label"
          subtitle="无需额外服务，适合小规模使用"
          before={
            <Radio
              name="db-type"
              checked={config.database.type === 'sqlite'}
              onChange={() =>
                setConfig((prev) => ({
                  ...prev,
                  database: { ...prev.database, type: 'sqlite' },
                }))
              }
            />
          }
        >
          SQLite
        </Cell>
        <Cell
          Component="label"
          subtitle="适合大规模生产环境"
          before={
            <Radio
              name="db-type"
              checked={config.database.type === 'mysql'}
              onChange={() =>
                setConfig((prev) => ({
                  ...prev,
                  database: { ...prev.database, type: 'mysql' },
                }))
              }
            />
          }
        >
          MySQL
        </Cell>
      </Section>

      {config.database.type === 'mysql' && (
        <Section header="MySQL 连接信息">
          <Input
            header="数据库地址"
            placeholder="服务器地址"
            value={config.database.mysql.host}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                database: {
                  ...prev.database,
                  mysql: { ...prev.database.mysql, host: e.target.value },
                },
              }))
            }
          />
          <Input
            header="端口"
            type="number"
            placeholder="端口"
            value={config.database.mysql.port === 0 ? '' : config.database.mysql.port}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                database: {
                  ...prev.database,
                  mysql: {
                    ...prev.database.mysql,
                    port: e.target.value === '' ? 0 : Number(e.target.value) || 3306,
                  },
                },
              }))
            }
          />
          <Input
            header="数据库名"
            placeholder="数据库名称"
            value={config.database.mysql.database}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                database: {
                  ...prev.database,
                  mysql: { ...prev.database.mysql, database: e.target.value },
                },
              }))
            }
          />
          <Input
            header="用户名"
            placeholder="用户名"
            value={config.database.mysql.username}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                database: {
                  ...prev.database,
                  mysql: { ...prev.database.mysql, username: e.target.value },
                },
              }))
            }
          />
          <Input
            header="密码"
            type="password"
            placeholder="密码"
            value={config.database.mysql.password}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                database: {
                  ...prev.database,
                  mysql: { ...prev.database.mysql, password: e.target.value },
                },
              }))
            }
          />
        </Section>
      )}
    </>
  )

  const renderChainBlock = (key) => {
    const meta = chainMeta[key]
    const state = chainState[key]
    const addressHeader = key === 'evm' ? 'EVM虚拟机共用地址' : `${meta.title} 收款地址`

    return (
      <Section key={key} header={meta.title}>
        <Input
          header={addressHeader}
          placeholder={addressHeader}
          value={state.address}
          onChange={(e) => updateChainAddress(key, e.target.value)}
        />

        {key === 'evm' && (
          <>
            <Caption className="chain-caption">EVM 支持网络</Caption>
            {evmNetworks.map((item) => (
              <Cell
                key={item.key}
                Component="label"
                before={
                  <Checkbox
                    checked={chainState.evm.networks[item.key]}
                    onChange={(e) => toggleEvmNetwork(item.key, e.target.checked)}
                  />
                }
              >
                {item.label}
              </Cell>
            ))}
            <Caption className="desc-note desc-note-compact">
              EVM虚拟机网络众多，建议您不要使用交易所地址，以免资产无法找回。
            </Caption>
          </>
        )}

        <Caption className="chain-caption">接受代币</Caption>
        {meta.tokens.map((token) => (
          <Cell
            key={token}
            Component="label"
            before={
              <Checkbox
                checked={state.tokens.includes(token)}
                onChange={() => toggleChainToken(key, token)}
              />
            }
          >
            {token}
          </Cell>
        ))}
      </Section>
    )
  }

  const renderPaymentStep = () => (
    <>
      <Section header="区块链收款">
        {Object.keys(chainMeta).map((key) => (
          <Cell
            key={key}
            Component="label"
            before={
              <Checkbox
                checked={chainState[key].enabled}
                onChange={(e) => toggleChainEnabled(key, e.target.checked)}
              />
            }
            subtitle={chainMeta[key].subtitle}
            after={<ChainIcon type={key} />}
          >
            {chainMeta[key].title}
          </Cell>
        ))}
      </Section>

      {Object.keys(chainMeta)
        .filter((key) => chainState[key].enabled)
        .map((key) => renderChainBlock(key))}

      <Section header="扩展支付（可选）">
        <Cell
          Component="label"
          subtitle="目前支持 OKX"
          before={
            <Checkbox
              checked={exchangeState.enabled}
              onChange={(e) => setExchangeState((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
          }
        >
          交易所
        </Cell>
        {exchangeState.enabled && (
          <>
            <Input
              header="OKX API Key"
              placeholder="输入 OKX API Key"
              value={exchangeState.apiKey}
              onChange={(e) => setExchangeState((prev) => ({ ...prev, apiKey: e.target.value }))}
            />
            <Input
              header="OKX API Secret"
              type="password"
              placeholder="输入 OKX API Secret"
              value={exchangeState.apiSecret}
              onChange={(e) => setExchangeState((prev) => ({ ...prev, apiSecret: e.target.value }))}
            />
            <Input
              header="OKX Passphrase"
              type="password"
              placeholder="输入 OKX Passphrase"
              value={exchangeState.passphrase}
              onChange={(e) => setExchangeState((prev) => ({ ...prev, passphrase: e.target.value }))}
            />
          </>
        )}

        <Cell
          Component="label"
          subtitle="目前支持 Huione / OKPay"
          before={
            <Checkbox
              checked={walletState.enabled}
              onChange={(e) => setWalletState((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
          }
        >
          第三方钱包
        </Cell>
        {walletState.enabled && (
          <>
            <Input
              header="Huione API Key"
              placeholder="输入 Huione API Key"
              value={walletState.huioneApiKey}
              onChange={(e) =>
                setWalletState((prev) => ({
                  ...prev,
                  huioneApiKey: e.target.value,
                }))
              }
            />
            <Input
              header="OKPay API Key"
              placeholder="输入 OKPay API Key"
              value={walletState.okpayApiKey}
              onChange={(e) =>
                setWalletState((prev) => ({
                  ...prev,
                  okpayApiKey: e.target.value,
                }))
              }
            />
          </>
        )}
      </Section>
    </>
  )

  const renderSystemStep = () => (
    <>
      <div className="setting-section">
        <Section header="货币">
          <Select
            header="货币选择"
            value={config.system.currency}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                system: { ...prev.system, currency: e.target.value },
              }))
            }
          >
            {currencyList.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
          <Caption className="desc-note desc-note-section">
            在发起订单时的默认货币，以及用于统计数据的货币。
          </Caption>
          <Input
            header="计价汇率微调"
            type="number"
            placeholder="微调计价汇率（可不填）"
            value={config.system.rateAdjust === null ? '' : String(config.system.rateAdjust)}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                system: {
                  ...prev.system,
                  rateAdjust: e.target.value === '' ? null : Number(e.target.value) || 0,
                },
              }))
            }
          />
          <Caption className="desc-note desc-note-section">
            不同的代币币种都将以实时USDT价格与基础货币的C2C价格计算，你可以微调汇率。例如，基础货币选择CNY，假设实时汇率为 7.1:1 USDT，微调设置为 7 时，汇率固定为
            7:1 USDT；设置为 +0.5 时，汇率为 7.6:1 USDT，设置为 -1 时，汇率为 6.1:1 USDT
          </Caption>
        </Section>
      </div>

      <div className="setting-section">
        <Section header="系统参数">
          <Input
            header="订单超时（秒）"
            type="number"
            placeholder="订单超时时间（秒）"
            value={config.system.timeout === null ? '' : String(config.system.timeout)}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                system: {
                  ...prev.system,
                  timeout: e.target.value === '' ? null : Number(e.target.value) || 1800,
                },
              }))
            }
          />
        </Section>
      </div>

      <div className="setting-section">
        <Section header="交易检测">
          <Cell
            Component="label"
            before={
              <Checkbox
                checked={config.system.fastConfirm}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    system: { ...prev.system, fastConfirm: e.target.checked },
                  }))
                }
              />
            }
          >
            快速确认
          </Cell>
          <Caption className="desc-note desc-note-section desc-note-top">
            不等待目标链交易确认区块数达到安全值，提升交易确认速度。
          </Caption>
        </Section>
      </div>

      <div className="setting-section">
        <Section header="添加商户">
        <div className="merchant-actions">
          <Button size="s" mode="outline" onClick={addMerchant}>
            新增商户
          </Button>
        </div>

        {merchants.length === 0 && <Caption className="desc-note desc-note-empty">可添加多个商户。</Caption>}

        {merchants.map((item, index) => (
          <div key={item.id} className="merchant-item">
            <Cell
              after={
                <Button size="s" mode="outline" onClick={() => removeMerchant(item.id)}>
                  删除
                </Button>
              }
            >
              商户 {index + 1}
            </Cell>
            <Input
              header="商户名称"
              placeholder="输入商户名称"
              value={item.name}
              onChange={(e) => updateMerchant(item.id, 'name', e.target.value)}
            />
            <Input
              header="回调地址"
              placeholder="https://example.com/callback"
              value={item.callback}
              onChange={(e) => updateMerchant(item.id, 'callback', e.target.value)}
            />
            <Input
              header="安全密钥"
              placeholder="安全密钥"
              value={item.apiKey}
              onChange={(e) => updateMerchant(item.id, 'apiKey', e.target.value)}
            />
            <div className="merchant-actions">
              <Button
                size="s"
                mode="outline"
                onClick={() => updateMerchant(item.id, 'apiKey', generateMerchantKey())}
              >
                重新生成密钥
              </Button>
            </div>
          </div>
        ))}
        </Section>
      </div>
    </>
  )

  const renderDoneStep = () => (
    <>
      <Section>
        <Placeholder
          header="初始化配置完成"
          description="配置已提交，系统正在加载。"
        >
          <img
            src="https://telegram.org/img/t_logo.svg"
            alt="done"
            style={{ width: 96, height: 96 }}
          />
        </Placeholder>
      </Section>
    </>
  )

  const stepView = [renderDatabaseStep, renderPaymentStep, renderSystemStep, renderDoneStep][step]
  const stepTitle = ['数据库', '支付配置', '系统设置', '完成']

  return (
    <div className="init-setup">
      <div className="init-head">
        <Title level="2">初始化配置</Title>
        <Text className="init-head-text">提供一些系统运行的必要信息</Text>
      </div>

      <div className="step-bar">
        {stepTitle.map((item, index) => (
          <button
            key={item}
            type="button"
            className={`step-pill ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
            onClick={() => {
              if (index <= step || step === 3) setStep(index)
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <List>{stepView()}</List>

      {step < 3 && (
        <div className="step-actions">
          {step > 0 && (
            <Button size="l" mode="outline" onClick={prevStep}>
              上一步
            </Button>
          )}
          <Button size="l" loading={loading} onClick={nextStep}>
            {step === 2 ? '提交配置' : step === 1 && !hasPaymentMethod ? '跳过支付配置' : '下一步'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default InitSetup
