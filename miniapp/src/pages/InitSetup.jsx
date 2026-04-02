import React, { useState } from 'react'
import {
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
  List,
  Placeholder,
  Spinner
} from '@telegram-apps/telegram-ui'
import api from '../utils/api'
import './InitSetup.scss'

const InitSetup = () => {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  
  // 配置数据
  const [config, setConfig] = useState({
    database: {
      type: 'sqlite',
      mysql: {
        host: 'localhost',
        port: 3306,
        database: 'hashpay',
        username: 'root',
        password: ''
      }
    },
    system: {
      currency: 'CNY',
      timeout: 1800,
      fastConfirm: true,
      rateAdjust: 0
    }
  })

  // 支付配置
  const [paymentPlatforms, setPaymentPlatforms] = useState({
    blockchain: false,
    exchange: false,
    wallet: false
  })

  const [selectedChains, setSelectedChains] = useState([])
  const [selectedTokens, setSelectedTokens] = useState([])
  const [chainAddresses, setChainAddresses] = useState({})
  const [useUnifiedEVMAddress, setUseUnifiedEVMAddress] = useState(false)

  // 交易所配置
  const [exchangeConfig, setExchangeConfig] = useState({
    okx: {
      apiKey: '',
      apiSecret: '',
      passphrase: ''
    }
  })

  // 钱包配置
  const [walletConfig, setWalletConfig] = useState({
    huione: { enabled: false, apiKey: '' },
    okpay: { enabled: false, apiKey: '' }
  })

  // 商户配置
  const [addMerchant, setAddMerchant] = useState(false)
  const [merchantConfig, setMerchantConfig] = useState({
    name: '',
    callback: '',
    apiKey: ''
  })

  const handleNext = async () => {
    if (currentStep === 2) {
      // 提交配置
      await submitConfig()
    } else {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrev = () => {
    setCurrentStep(currentStep - 1)
  }

  const submitConfig = async () => {
    setLoading(true)
    try {
      const fullConfig = {
        database: config.database,
        system: config.system,
        payments: []
      }

      // 添加区块链配置
      if (paymentPlatforms.blockchain) {
        selectedChains.forEach(chain => {
          fullConfig.payments.push({
            type: 'blockchain',
            chain: chain,
            address: chainAddresses[chain] || '',
            tokens: selectedTokens
          })
        })
      }

      // 添加交易所配置
      if (paymentPlatforms.exchange && exchangeConfig.okx.apiKey) {
        fullConfig.payments.push({
          type: 'exchange',
          platform: 'okx',
          config: exchangeConfig.okx
        })
      }

      // 添加钱包配置
      if (paymentPlatforms.wallet) {
        if (walletConfig.huione.apiKey) {
          fullConfig.payments.push({
            type: 'wallet',
            platform: 'huione',
            config: walletConfig.huione
          })
        }
        if (walletConfig.okpay.apiKey) {
          fullConfig.payments.push({
            type: 'wallet',
            platform: 'okpay',
            config: walletConfig.okpay
          })
        }
      }

      // 添加商户配置
      if (addMerchant && merchantConfig.name) {
        fullConfig.merchant = {
          name: merchantConfig.name,
          callback: merchantConfig.callback
        }
      }

      const response = await api.post('/api/config', fullConfig)
      
      if (response.data.merchant_api_key) {
        setMerchantConfig(prev => ({ ...prev, apiKey: response.data.merchant_api_key }))
      }

      setCurrentStep(3)
    } catch (error) {
      console.error('配置提交失败:', error)
      window.Telegram.WebApp.showAlert('配置提交失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="step-content">
            <Title level="2">数据库配置</Title>
            
            <Section header="选择数据库类型">
              <Cell
                Component="label"
                before={
                  <Radio
                    name="db-type"
                    value="sqlite"
                    checked={config.database.type === 'sqlite'}
                    onChange={(e) => setConfig({
                      ...config,
                      database: { ...config.database, type: 'sqlite' }
                    })}
                  />
                }
              >
                SQLite（推荐）
                <Caption level="2">轻量级，无需额外配置</Caption>
              </Cell>
              
              <Cell
                Component="label"
                before={
                  <Radio
                    name="db-type"
                    value="mysql"
                    checked={config.database.type === 'mysql'}
                    onChange={(e) => setConfig({
                      ...config,
                      database: { ...config.database, type: 'mysql' }
                    })}
                  />
                }
              >
                MySQL
                <Caption level="2">适合大规模部署</Caption>
              </Cell>
            </Section>

            {config.database.type === 'mysql' && (
              <Section header="MySQL 配置">
                <Input
                  header="主机地址"
                  placeholder="localhost"
                  value={config.database.mysql.host}
                  onChange={(e) => setConfig({
                    ...config,
                    database: {
                      ...config.database,
                      mysql: { ...config.database.mysql, host: e.target.value }
                    }
                  })}
                />
                <Input
                  header="端口"
                  placeholder="3306"
                  type="number"
                  value={config.database.mysql.port}
                  onChange={(e) => setConfig({
                    ...config,
                    database: {
                      ...config.database,
                      mysql: { ...config.database.mysql, port: parseInt(e.target.value) }
                    }
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
                      mysql: { ...config.database.mysql, database: e.target.value }
                    }
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
                      mysql: { ...config.database.mysql, username: e.target.value }
                    }
                  })}
                />
                <Input
                  header="密码"
                  placeholder="密码"
                  type="password"
                  value={config.database.mysql.password}
                  onChange={(e) => setConfig({
                    ...config,
                    database: {
                      ...config.database,
                      mysql: { ...config.database.mysql, password: e.target.value }
                    }
                  })}
                />
              </Section>
            )}
          </div>
        )

      case 1:
        return (
          <div className="step-content">
            <Title level="2">支付方式配置</Title>
            
            <Section header="选择支付平台">
              <Cell
                Component="label"
                before={
                  <Checkbox
                    checked={paymentPlatforms.blockchain}
                    onChange={(e) => setPaymentPlatforms({
                      ...paymentPlatforms,
                      blockchain: e.target.checked
                    })}
                  />
                }
              >
                区块链
                <Caption level="2">支持 TRON, BSC, ETH, Polygon, Solana, TON</Caption>
              </Cell>
              
              <Cell
                Component="label"
                before={
                  <Checkbox
                    checked={paymentPlatforms.exchange}
                    onChange={(e) => setPaymentPlatforms({
                      ...paymentPlatforms,
                      exchange: e.target.checked
                    })}
                  />
                }
              >
                交易所
                <Caption level="2">目前支持 OKX</Caption>
              </Cell>
              
              <Cell
                Component="label"
                before={
                  <Checkbox
                    checked={paymentPlatforms.wallet}
                    onChange={(e) => setPaymentPlatforms({
                      ...paymentPlatforms,
                      wallet: e.target.checked
                    })}
                  />
                }
              >
                第三方钱包
                <Caption level="2">支持汇旺（Huione）、OKPay</Caption>
              </Cell>
            </Section>

            {paymentPlatforms.blockchain && (
              <Section header="区块链配置">
                <div className="checkbox-group">
                  <Title level="3">选择支持的主链</Title>
                  {['tron', 'bsc', 'eth', 'polygon', 'solana', 'ton'].map(chain => (
                    <Cell
                      key={chain}
                      Component="label"
                      before={
                        <Checkbox
                          checked={selectedChains.includes(chain)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedChains([...selectedChains, chain])
                            } else {
                              setSelectedChains(selectedChains.filter(c => c !== chain))
                            }
                          }}
                        />
                      }
                    >
                      {getChainName(chain)}
                    </Cell>
                  ))}
                </div>

                {selectedChains.length > 0 && (
                  <>
                    <div className="checkbox-group">
                      <Title level="3">选择支持的代币</Title>
                      {['usdt', 'usdc', 'trx', 'ton'].map(token => (
                        <Cell
                          key={token}
                          Component="label"
                          before={
                            <Checkbox
                              checked={selectedTokens.includes(token)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTokens([...selectedTokens, token])
                                } else {
                                  setSelectedTokens(selectedTokens.filter(t => t !== token))
                                }
                              }}
                            />
                          }
                        >
                          {token.toUpperCase()}
                        </Cell>
                      ))}
                    </div>

                    {selectedChains.map(chain => (
                      <Input
                        key={chain}
                        header={`${getChainName(chain)} 收款地址`}
                        placeholder={`输入 ${getChainName(chain)} 地址`}
                        value={chainAddresses[chain] || ''}
                        onChange={(e) => setChainAddresses({
                          ...chainAddresses,
                          [chain]: e.target.value
                        })}
                      />
                    ))}
                  </>
                )}
              </Section>
            )}

            {paymentPlatforms.exchange && (
              <Section header="OKX 配置">
                <Input
                  header="API Key"
                  placeholder="输入 OKX API Key"
                  value={exchangeConfig.okx.apiKey}
                  onChange={(e) => setExchangeConfig({
                    okx: { ...exchangeConfig.okx, apiKey: e.target.value }
                  })}
                />
                <Input
                  header="API Secret"
                  placeholder="输入 OKX API Secret"
                  type="password"
                  value={exchangeConfig.okx.apiSecret}
                  onChange={(e) => setExchangeConfig({
                    okx: { ...exchangeConfig.okx, apiSecret: e.target.value }
                  })}
                />
                <Input
                  header="Passphrase"
                  placeholder="输入 OKX Passphrase"
                  type="password"
                  value={exchangeConfig.okx.passphrase}
                  onChange={(e) => setExchangeConfig({
                    okx: { ...exchangeConfig.okx, passphrase: e.target.value }
                  })}
                />
                <Caption>请确保 API 权限包含：读取账户信息、读取充值记录</Caption>
              </Section>
            )}
          </div>
        )

      case 2:
        return (
          <div className="step-content">
            <Title level="2">系统设置</Title>
            
            <Section header="基础设置">
              <Select
                header="默认货币"
                value={config.system.currency}
                onChange={(e) => setConfig({
                  ...config,
                  system: { ...config.system, currency: e.target.value }
                })}
              >
                <option value="CNY">CNY - 人民币</option>
                <option value="USD">USD - 美元</option>
                <option value="EUR">EUR - 欧元</option>
                <option value="GBP">GBP - 英镑</option>
                <option value="TWD">TWD - 新台币</option>
              </Select>

              <Input
                header="订单超时时间（秒）"
                placeholder="1800"
                type="number"
                value={config.system.timeout}
                onChange={(e) => setConfig({
                  ...config,
                  system: { ...config.system, timeout: parseInt(e.target.value) }
                })}
              />

              <Cell
                Component="label"
                before={
                  <Checkbox
                    checked={config.system.fastConfirm}
                    onChange={(e) => setConfig({
                      ...config,
                      system: { ...config.system, fastConfirm: e.target.checked }
                    })}
                  />
                }
              >
                更快确认
                <Caption level="2">
                  区块链到账一般需要多个区块确认，但目前受攻击的可能性非常小，
                  可以打开此选项以提升确认收款速度
                </Caption>
              </Cell>

              <Input
                header="汇率微调 (%)"
                placeholder="0"
                type="number"
                step="0.01"
                value={config.system.rateAdjust}
                onChange={(e) => setConfig({
                  ...config,
                  system: { ...config.system, rateAdjust: parseFloat(e.target.value) }
                })}
              />
              {config.system.rateAdjust !== 0 && (
                <Caption>
                  1 {config.system.currency} = {(7.2 * (1 + config.system.rateAdjust / 100)).toFixed(4)} USDT
                </Caption>
              )}
            </Section>

            <Section header="商户设置">
              <Cell
                Component="label"
                before={
                  <Checkbox
                    checked={addMerchant}
                    onChange={(e) => setAddMerchant(e.target.checked)}
                  />
                }
              >
                添加商户站点
                <Caption level="2">允许其他网站或程序对接收款</Caption>
              </Cell>

              {addMerchant && (
                <>
                  <Input
                    header="站点名称"
                    placeholder="输入站点名称"
                    value={merchantConfig.name}
                    onChange={(e) => setMerchantConfig({
                      ...merchantConfig,
                      name: e.target.value
                    })}
                  />
                  <Input
                    header="回调地址"
                    placeholder="https://example.com/callback"
                    value={merchantConfig.callback}
                    onChange={(e) => setMerchantConfig({
                      ...merchantConfig,
                      callback: e.target.value
                    })}
                  />
                </>
              )}
            </Section>
          </div>
        )

      case 3:
        return (
          <div className="step-content complete">
            <Placeholder
              header="配置完成！"
              description="系统正在初始化，请稍候..."
            >
              <img src="https://telegram.org/img/t_logo.png" alt="Success" style={{ width: 100 }} />
            </Placeholder>
            
            {merchantConfig.apiKey && (
              <Section header="商户 API Key">
                <Text weight="2">请妥善保存以下 API Key：</Text>
                <div className="api-key-box">
                  <code>{merchantConfig.apiKey}</code>
                </div>
                <Button
                  size="m"
                  onClick={() => {
                    navigator.clipboard.writeText(merchantConfig.apiKey)
                    window.Telegram.WebApp.showAlert('API Key 已复制到剪贴板')
                  }}
                >
                  复制
                </Button>
              </Section>
            )}

            <Button
              size="l"
              onClick={() => window.Telegram.WebApp.close()}
            >
              完成设置
            </Button>
          </div>
        )

      default:
        return null
    }
  }

  const getChainName = (chain) => {
    const names = {
      tron: 'TRON (TRC20)',
      bsc: 'BNB Smart Chain (BEP20)',
      eth: 'Ethereum (ERC20)',
      polygon: 'Polygon (MATIC)',
      solana: 'Solana',
      ton: 'TON'
    }
    return names[chain] || chain
  }

  const hasPaymentMethod = paymentPlatforms.blockchain || 
                           paymentPlatforms.exchange || 
                           paymentPlatforms.wallet

  return (
    <div className="init-setup">
      <div className="steps-indicator">
        {['数据库', '支付方式', '系统设置', '完成'].map((step, index) => (
          <div 
            key={index} 
            className={`step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
          >
            {step}
          </div>
        ))}
      </div>

      {renderStep()}

      {currentStep < 3 && (
        <div className="button-group">
          {currentStep > 0 && (
            <Button
              size="l"
              mode="secondary"
              onClick={handlePrev}
            >
              上一步
            </Button>
          )}
          <Button
            size="l"
            mode="primary"
            onClick={handleNext}
            loading={loading}
          >
            {currentStep === 1 && !hasPaymentMethod ? '暂时跳过' : '下一步'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default InitSetup
