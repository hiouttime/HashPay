import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Section, Title, Text, List, Button, Spinner, Input, Switch, Cell, Checkbox, Caption } from '@telegram-apps/telegram-ui'
import api from '../utils/api'
import useTelegramBackButton from '../utils/useTelegramBackButton'
import { showNotice } from './AdminCommon'
import './Admin.scss'

const paymentCatalog = {
  blockchain: [
    { key: 'tron', title: 'TRON (TRC20)', subtitle: '常用USDT网络', coins: ['USDT', 'TRX'] },
    { key: 'eth', title: 'Ethereum (ERC20)', subtitle: 'EVM虚拟机网络', coins: ['USDT', 'USDC', 'ETH'] },
    { key: 'bsc', title: 'BNB Smart Chain (BEP20)', subtitle: 'EVM虚拟机网络', coins: ['USDT', 'USDC', 'BNB'] },
    { key: 'polygon', title: 'Polygon', subtitle: 'EVM虚拟机网络', coins: ['USDT', 'USDC', 'MATIC'] },
    { key: 'solana', title: 'Solana', subtitle: '高吞吐、低费用网络', coins: ['USDT', 'USDC', 'SOL'] },
    { key: 'ton', title: 'TON', subtitle: 'Telegram 生态网络', coins: ['USDT', 'TON'] },
  ],
  exchange: [
    { key: 'okx', title: 'OKX', subtitle: '交易所收款', coins: ['USDT', 'USDC', 'BTC', 'ETH'] },
  ],
  wallet: [
    { key: 'huione', title: 'Huione', subtitle: '第三方钱包', coins: ['USDT'] },
    { key: 'okpay', title: 'OKPay', subtitle: '第三方钱包', coins: ['USDT'] },
  ],
}

const typeOptions = [
  { key: 'blockchain', label: '区块链' },
  { key: 'exchange', label: '交易所' },
  { key: 'wallet', label: '第三方钱包' },
]
const typeLabelMap = Object.fromEntries(typeOptions.map((item) => [item.key, item.label]))

const evmNetworkOptions = [
  { key: 'eth', title: 'Ethereum (ERC20)', subtitle: 'ETH 网络', coins: ['USDT', 'USDC', 'ETH'] },
  { key: 'bsc', title: 'BNB Smart Chain (BEP20)', subtitle: 'BEP20 网络', coins: ['USDT', 'USDC', 'BNB'] },
  { key: 'polygon', title: 'Polygon', subtitle: 'Polygon 网络', coins: ['USDT', 'USDC', 'MATIC'] },
]

function isEvmNetworkKey(key) {
  return key === 'eth' || key === 'bsc' || key === 'polygon'
}

function firstPlatform(type) {
  return paymentCatalog[type]?.[0]?.key || ''
}

function defaultCoins(type, platform) {
  const item = paymentCatalog[type]?.find((p) => p.key === platform)
  if (!item || item.coins.length === 0) return []
  return [item.coins[0]]
}

function defaultPlatformCoins(type, platforms) {
  const result = {}
  for (const platform of platforms) {
    const coins = defaultCoins(type, platform)
    if (coins.length > 0) {
      result[platform] = coins
    }
  }
  return result
}

function createInitialForm() {
  const type = 'blockchain'
  const platform = firstPlatform(type)
  const platforms = platform ? [platform] : []
  return {
    id: null,
    name: '',
    type,
    platform,
    platforms,
    platformCoins: defaultPlatformCoins(type, platforms),
    platformAddresses: Object.fromEntries(platforms.map((key) => [key, ''])),
    evmNetworks: [],
    evmCoins: {},
    evmAddress: '',
    coins: defaultCoins(type, platform),
    address: '',
    enabled: true,
  }
}

function normalizeCoins(coins) {
  if (!Array.isArray(coins)) return []
  return Array.from(new Set(coins.map((coin) => String(coin || '').trim().toUpperCase()).filter(Boolean)))
}

const evmAddressRE = /^0x[0-9a-fA-F]{40}$/
const tronAddressRE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/
const solanaAddressRE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const tonRawRE = /^-?[0-9]+:[0-9a-fA-F]{64}$/
const tonFriendlyRE = /^[A-Za-z0-9_-]{48}$/

function validateAddress(platform, address) {
  const plat = String(platform || '').trim().toLowerCase()
  const addr = String(address || '').trim()
  if (!addr) return '收款地址不能为空'

  if (plat === 'eth' || plat === 'bsc' || plat === 'polygon') {
    return evmAddressRE.test(addr) ? '' : 'EVM 地址格式错误'
  }
  if (plat === 'tron') {
    return tronAddressRE.test(addr) ? '' : 'TRON 地址格式错误'
  }
  if (plat === 'solana') {
    return solanaAddressRE.test(addr) ? '' : 'Solana 地址格式错误'
  }
  if (plat === 'ton') {
    return tonRawRE.test(addr) || tonFriendlyRE.test(addr) ? '' : 'TON 地址格式错误'
  }
  return ''
}

function PaymentForm() {
  useTelegramBackButton()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const paymentID = params.id ? Number(params.id) : 0
  const isAdding = paymentID === 0

  const [loading, setLoading] = useState(!isAdding)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(createInitialForm)

  const platformOptions = useMemo(() => paymentCatalog[form.type] || [], [form.type])
  const evmNetworkMap = useMemo(() => Object.fromEntries(evmNetworkOptions.map((item) => [item.key, item])), [])
  const platformMap = useMemo(
    () => Object.fromEntries(platformOptions.map((item) => [item.key, item])),
    [platformOptions]
  )
  const addPlatformOptions = useMemo(() => {
    if (!isAdding || form.type !== 'blockchain') {
      return platformOptions
    }
    const normalPlatforms = platformOptions.filter((item) => !isEvmNetworkKey(item.key))
    return [
      { key: 'evm', title: 'EVM 虚拟机', subtitle: 'ETH、BSC、Polygon 等 EVM 网络' },
      ...normalPlatforms,
    ]
  }, [isAdding, form.type, platformOptions])
  const selectedPlatforms = useMemo(
    () => platformOptions.filter((item) => form.platforms.includes(item.key) && !isEvmNetworkKey(item.key)),
    [platformOptions, form.platforms]
  )
  const isEvmAddEnabled = isAdding && form.type === 'blockchain' && form.platforms.includes('evm')
  const selectedPlatform = useMemo(
    () => platformOptions.find((item) => item.key === form.platform) || null,
    [form.platform, platformOptions]
  )

  const fillEditForm = (item) => {
    const type = item.type || 'blockchain'
    const platform = item.platform || firstPlatform(type)
    const currentCoins = normalizeCoins(item.coins)
    const coins = currentCoins.length > 0 ? currentCoins : defaultCoins(type, platform)
    setForm({
      id: item.id,
      name: item.name || '',
      type,
      platform,
      platforms: platform ? [platform] : [],
      platformCoins: platform ? { [platform]: coins } : {},
      platformAddresses: platform ? { [platform]: item.address || '' } : {},
      evmNetworks: [],
      evmCoins: {},
      evmAddress: '',
      coins,
      address: item.address || '',
      enabled: !!item.enabled,
    })
  }

  useEffect(() => {
    if (isAdding) {
      setLoading(false)
      setForm(createInitialForm())
      return
    }

    let active = true
    const preload = async () => {
      setLoading(true)
      const stateItem = location.state?.item
      if (stateItem && Number(stateItem.id) === paymentID) {
        if (active) {
          fillEditForm(stateItem)
          setLoading(false)
        }
        return
      }
      try {
        const { data } = await api.get('/api/admin/payments')
        if (!active) return
        const item = Array.isArray(data) ? data.find((entry) => Number(entry.id) === paymentID) : null
        if (!item) {
          showNotice('支付方式不存在')
          navigate('/payments', { replace: true })
          return
        }
        fillEditForm(item)
      } catch {
        if (active) {
          showNotice('加载支付方式失败')
          navigate('/payments', { replace: true })
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void preload()
    return () => {
      active = false
    }
  }, [isAdding, paymentID, location.state, navigate])

  const selectType = (type) => {
    const platform = firstPlatform(type)
    const platforms = platform ? [platform] : []
    setForm((prev) => ({
      ...prev,
      type,
      platform,
      platforms,
      platformCoins: defaultPlatformCoins(type, platforms),
      platformAddresses: Object.fromEntries(platforms.map((key) => [key, ''])),
      evmNetworks: [],
      evmCoins: {},
      evmAddress: '',
      coins: defaultCoins(type, platform),
    }))
  }

  const togglePlatform = (platform) => {
    setForm((prev) => {
      if (platform === 'evm') {
        const has = prev.platforms.includes('evm')
        if (has) {
          return {
            ...prev,
            platforms: prev.platforms.filter((item) => item !== 'evm'),
            evmNetworks: [],
            evmCoins: {},
            evmAddress: '',
          }
        }
        return {
          ...prev,
          platforms: [...prev.platforms, 'evm'],
          evmNetworks: ['eth'],
          evmCoins: { eth: defaultCoins(prev.type, 'eth') },
          evmAddress: '',
        }
      }

      const has = prev.platforms.includes(platform)
      const next = has ? prev.platforms.filter((item) => item !== platform) : [...prev.platforms, platform]
      const nextPlatformCoins = { ...(prev.platformCoins || {}) }
      const nextPlatformAddresses = { ...(prev.platformAddresses || {}) }
      if (has) {
        delete nextPlatformCoins[platform]
        delete nextPlatformAddresses[platform]
      } else {
        nextPlatformCoins[platform] = defaultCoins(prev.type, platform)
        nextPlatformAddresses[platform] = ''
      }
      return {
        ...prev,
        platforms: next,
        platformCoins: nextPlatformCoins,
        platformAddresses: nextPlatformAddresses,
      }
    })
  }

  const toggleEvmNetwork = (network) => {
    setForm((prev) => {
      const has = prev.evmNetworks.includes(network)
      const next = has ? prev.evmNetworks.filter((item) => item !== network) : [...prev.evmNetworks, network]
      const nextCoins = { ...(prev.evmCoins || {}) }
      if (has) {
        delete nextCoins[network]
      } else {
        nextCoins[network] = defaultCoins(prev.type, network)
      }
      return {
        ...prev,
        evmNetworks: next,
        evmCoins: nextCoins,
      }
    })
  }

  const toggleEvmCoin = (network, coin) => {
    setForm((prev) => {
      const current = normalizeCoins(prev.evmCoins?.[network] || [])
      const has = current.includes(coin)
      const next = has ? current.filter((item) => item !== coin) : [...current, coin]
      return {
        ...prev,
        evmCoins: {
          ...(prev.evmCoins || {}),
          [network]: next,
        },
      }
    })
  }

  const togglePlatformCoin = (platform, coin) => {
    setForm((prev) => {
      const current = normalizeCoins(prev.platformCoins?.[platform] || [])
      const has = current.includes(coin)
      const next = has ? current.filter((item) => item !== coin) : [...current, coin]
      return {
        ...prev,
        platformCoins: {
          ...(prev.platformCoins || {}),
          [platform]: next,
        },
      }
    })
  }

  const setPlatformAddress = (platform, value) => {
    setForm((prev) => ({
      ...prev,
      platformAddresses: {
        ...(prev.platformAddresses || {}),
        [platform]: value,
      },
    }))
  }

  const setEvmAddress = (value) => {
    setForm((prev) => ({ ...prev, evmAddress: value }))
  }

  const toggleCoin = (coin) => {
    setForm((prev) => {
      const has = prev.coins.includes(coin)
      const coins = has ? prev.coins.filter((item) => item !== coin) : [...prev.coins, coin]
      return { ...prev, coins }
    })
  }

  const savePayment = async () => {
    setSaving(true)
    try {
      if (!isAdding) {
        const baseName = String(form.name || '').trim()
        if (!baseName) {
          showNotice('请填写支付方式名称')
          return
        }
        if (!form.platform) {
          showNotice('支付平台无效')
          return
        }
        const coins = normalizeCoins(form.coins)
        if (coins.length === 0) {
          showNotice('请至少选择一个代币')
          return
        }
        if (!form.address.trim()) {
          showNotice('请填写收款地址')
          return
        }
        {
          const msg = validateAddress(form.platform, form.address.trim())
          if (msg) {
            showNotice(msg)
            return
          }
        }
        await api.put(`/api/admin/payments/${form.id}`, {
          type: form.type,
          name: baseName,
          platform: form.platform,
          coins,
          address: form.address.trim(),
          enabled: form.enabled,
        })
        showNotice('支付方式已保存')
      } else {
        const platforms = Array.from(new Set(form.platforms.map((item) => String(item || '').trim()).filter(Boolean)))
        if (platforms.length === 0) {
          showNotice('请至少选择一个支付平台')
          return
        }

        const requests = []
        for (const platform of platforms.filter((item) => item !== 'evm')) {
          const coins = normalizeCoins(form.platformCoins?.[platform] || [])
          if (coins.length === 0) {
            const title = platformMap[platform]?.title || platform
            showNotice(`请为 ${title} 选择至少一个代币`)
            return
          }
          const address = String(form.platformAddresses?.[platform] || '').trim()
          if (!address) {
            const title = platformMap[platform]?.title || platform
            showNotice(`请填写 ${title} 的收款地址`)
            return
          }
          {
            const msg = validateAddress(platform, address)
            if (msg) {
              const title = platformMap[platform]?.title || platform
              showNotice(`${title}: ${msg}`)
              return
            }
          }
          requests.push({
            label: platformMap[platform]?.title || platform,
            type: form.type,
            platform,
            coins,
            address,
          })
        }

        if (platforms.includes('evm')) {
          if (form.evmNetworks.length === 0) {
            showNotice('请至少选择一个 EVM 网络')
            return
          }
          const evmAddress = String(form.evmAddress || '').trim()
          if (!evmAddress) {
            showNotice('请填写 EVM 虚拟机共用地址')
            return
          }
          {
            const msg = validateAddress('eth', evmAddress)
            if (msg) {
              showNotice(msg)
              return
            }
          }
          for (const network of form.evmNetworks) {
            const coins = normalizeCoins(form.evmCoins?.[network] || [])
            if (coins.length === 0) {
              const title = evmNetworkMap[network]?.title || network
              showNotice(`请为 ${title} 选择至少一个代币`)
              return
            }
            requests.push({
              label: evmNetworkMap[network]?.title || network,
              type: form.type,
              platform: network,
              coins,
              address: evmAddress,
            })
          }
        }

        if (requests.length === 0) {
          showNotice('当前选择无法创建支付方式')
          return
        }

        for (const payload of requests) {
          await api.post('/api/admin/payments', {
            type: payload.type,
            name: payload.label,
            platform: payload.platform,
            coins: payload.coins,
            address: payload.address,
          })
        }
        showNotice(`已新增 ${requests.length} 条支付方式`)
      }

      navigate('/payments', { replace: true })
    } catch {
      showNotice('保存支付方式失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-head">
          <Title level="2">{isAdding ? '添加支付方式' : '编辑支付方式'}</Title>
        </div>
        <div className="loading-wrap">
          <Spinner size="m" />
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-head">
        <Title level="2">{isAdding ? '添加支付方式' : '编辑支付方式'}</Title>
      </div>

      <List>
        <div className="admin-section">
          <Section header={isAdding ? '新增配置' : '编辑配置'}>
            <div className="form-wrap">
              {!isAdding && (
                <div className="field-wrap">
                  <Input
                    header="支付方式名称"
                    placeholder="输入名称，如 TRON-USDT 主收款"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              )}

              {isAdding ? (
                <>
                  <Caption className="form-caption">支付类型</Caption>
                  <div className="page-nav">
                    {typeOptions.map((item) => (
                      <Button
                        key={item.key}
                        size="m"
                        mode={form.type === item.key ? 'filled' : 'outline'}
                        onClick={() => selectType(item.key)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>

                  <Caption className="form-caption">支付平台</Caption>
                  {addPlatformOptions.map((item) => (
                    <Cell
                      key={item.key}
                      Component="label"
                      subtitle={item.subtitle}
                      before={
                        <Checkbox checked={form.platforms.includes(item.key)} onChange={() => togglePlatform(item.key)} />
                      }
                    >
                      {item.title}
                    </Cell>
                  ))}

                  <Text className="hint-line">新增会按“平台 x 地址”批量创建，默认启用。</Text>

                  {isEvmAddEnabled && (
                    <>
                      <Caption className="form-caption">EVM 网络</Caption>
                      {evmNetworkOptions.map((network) => (
                        <Cell
                          key={network.key}
                          Component="label"
                          subtitle={network.subtitle}
                          before={
                            <Checkbox
                              checked={form.evmNetworks.includes(network.key)}
                              onChange={() => toggleEvmNetwork(network.key)}
                            />
                          }
                        >
                          {network.title}
                        </Cell>
                      ))}

                      {form.evmNetworks.map((networkKey) => {
                        const network = evmNetworkMap[networkKey]
                        if (!network) return null
                        return (
                          <div key={`evm-network-${networkKey}`}>
                            <Caption className="form-caption">{network.title} 接受代币</Caption>
                            {network.coins.map((coin) => (
                              <Cell
                                key={`evm-${networkKey}-${coin}`}
                                Component="label"
                                before={
                                  <Checkbox
                                    checked={(form.evmCoins?.[networkKey] || []).includes(coin)}
                                    onChange={() => toggleEvmCoin(networkKey, coin)}
                                  />
                                }
                              >
                                {coin}
                              </Cell>
                            ))}
                          </div>
                        )
                      })}

                      <div className="field-wrap">
                        <Input
                          header="EVM虚拟机共用地址"
                          placeholder="输入EVM共用地址"
                          value={form.evmAddress}
                          onChange={(e) => setEvmAddress(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {selectedPlatforms.length > 0 && (
                    <>
                      {selectedPlatforms.map((platformItem) => (
                        <div key={`coins-${platformItem.key}`}>
                          <Caption className="form-caption">{platformItem.title}</Caption>
                          {platformItem.coins.map((coin) => (
                            <Cell
                              key={`${platformItem.key}-${coin}`}
                              Component="label"
                              before={
                                <Checkbox
                                  checked={(form.platformCoins?.[platformItem.key] || []).includes(coin)}
                                  onChange={() => togglePlatformCoin(platformItem.key, coin)}
                                />
                              }
                            >
                              {coin}
                            </Cell>
                          ))}
                          <div className="field-wrap">
                            <Input
                              header="收款地址"
                              placeholder="输入收款地址"
                              value={form.platformAddresses?.[platformItem.key] || ''}
                              onChange={(e) => setPlatformAddress(platformItem.key, e.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  <Caption className="form-caption">支付类型</Caption>
                  <Text className="hint-line">{typeLabelMap[form.type] || form.type || '--'}</Text>
                  <Caption className="form-caption">支付平台</Caption>
                  <Text className="hint-line">{selectedPlatform?.title || form.platform || '--'}</Text>
                  <Caption className="form-caption">接受代币</Caption>
                  {(selectedPlatform?.coins || form.coins).map((coin) => (
                    <Cell
                      key={coin}
                      Component="label"
                      before={<Checkbox checked={form.coins.includes(coin)} onChange={() => toggleCoin(coin)} />}
                    >
                      {coin}
                    </Cell>
                  ))}

                  <div className="field-wrap">
                    <Input
                      header="收款地址"
                      placeholder="输入收款地址"
                      value={form.address}
                      onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                    />
                  </div>

                  <div className="switch-line">
                    <Text>启用状态</Text>
                    <Switch checked={form.enabled} onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))} />
                  </div>
                </>
              )}

              <div className="section-action">
                <Button size="m" stretched onClick={savePayment} disabled={saving}>
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
              <div className="section-action">
                <Button size="m" mode="outline" stretched onClick={() => navigate('/payments')}>
                  取消
                </Button>
              </div>
            </div>
          </Section>
        </div>
      </List>
    </div>
  )
}

export default PaymentForm
