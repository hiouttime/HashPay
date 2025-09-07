<template>
  <div class="setup">
    <van-nav-bar title="初始化设置" />
    
    <van-steps :active="activeStep" active-color="#667eea">
      <van-step>数据库</van-step>
      <van-step>支付方式</van-step>
      <van-step>系统配置</van-step>
      <van-step>完成</van-step>
    </van-steps>
    
    <div class="step-content">
      <!-- Step 1: 数据库配置 -->
      <div v-if="activeStep === 0" class="step-panel">
        <van-cell-group inset>
          <van-field label="数据库类型">
            <template #input>
              <van-radio-group v-model="config.database.type" direction="horizontal">
                <van-radio name="sqlite">SQLite</van-radio>
                <van-radio name="mysql">MySQL</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          
          <template v-if="config.database.type === 'mysql'">
            <van-field
              v-model="config.database.mysql.host"
              label="主机"
              placeholder="localhost"
            />
            <van-field
              v-model="config.database.mysql.port"
              label="端口"
              type="number"
              placeholder="3306"
            />
            <van-field
              v-model="config.database.mysql.database"
              label="数据库名"
              placeholder="hashpay"
            />
            <van-field
              v-model="config.database.mysql.username"
              label="用户名"
              placeholder="root"
            />
            <van-field
              v-model="config.database.mysql.password"
              label="密码"
              type="password"
              placeholder="密码"
            />
          </template>
        </van-cell-group>
      </div>
      
      <!-- Step 2: 支付方式 -->
      <div v-if="activeStep === 1" class="step-panel">
        <van-tabs v-model:active="paymentTab">
          <van-tab title="区块链">
            <van-cell-group inset>
              <van-checkbox-group v-model="selectedChains">
                <van-cell
                  v-for="chain in chainOptions"
                  :key="chain.value"
                  :title="chain.label"
                  clickable
                  @click="toggleChain(chain.value)"
                >
                  <template #right-icon>
                    <van-checkbox :name="chain.value" />
                  </template>
                </van-cell>
              </van-checkbox-group>
            </van-cell-group>
            
            <van-cell-group 
              v-for="chain in selectedChains" 
              :key="chain"
              :title="`${chain} 配置`"
              inset
            >
              <van-field
                v-model="chainConfigs[chain].address"
                label="收款地址"
                placeholder="输入地址"
              />
              <van-field
                v-model="chainConfigs[chain].apiKey"
                label="API Key"
                placeholder="选填"
              />
            </van-cell-group>
          </van-tab>
          
          <van-tab title="交易所">
            <van-cell-group inset>
              <van-checkbox-group v-model="selectedExchanges">
                <van-cell
                  title="OKX"
                  clickable
                  @click="toggleExchange('okx')"
                >
                  <template #right-icon>
                    <van-checkbox name="okx" />
                  </template>
                </van-cell>
              </van-checkbox-group>
            </van-cell-group>
            
            <van-cell-group v-if="selectedExchanges.includes('okx')" title="OKX 配置" inset>
              <van-field
                v-model="exchangeConfigs.okx.apiKey"
                label="API Key"
                placeholder="输入 API Key"
              />
              <van-field
                v-model="exchangeConfigs.okx.secret"
                label="Secret"
                type="password"
                placeholder="输入 Secret"
              />
              <van-field
                v-model="exchangeConfigs.okx.passphrase"
                label="Passphrase"
                type="password"
                placeholder="输入 Passphrase"
              />
            </van-cell-group>
          </van-tab>
          
          <van-tab title="钱包">
            <van-cell-group inset>
              <van-checkbox-group v-model="selectedWallets">
                <van-cell
                  title="汇旺 (Huione)"
                  clickable
                  @click="toggleWallet('huione')"
                >
                  <template #right-icon>
                    <van-checkbox name="huione" />
                  </template>
                </van-cell>
                <van-cell
                  title="OKPay"
                  clickable
                  @click="toggleWallet('okpay')"
                >
                  <template #right-icon>
                    <van-checkbox name="okpay" />
                  </template>
                </van-cell>
              </van-checkbox-group>
            </van-cell-group>
          </van-tab>
        </van-tabs>
        
        <div class="skip-button">
          <van-button plain type="primary" @click="skipPayment">暂时跳过</van-button>
        </div>
      </div>
      
      <!-- Step 3: 系统配置 -->
      <div v-if="activeStep === 2" class="step-panel">
        <van-cell-group inset>
          <van-field label="基础货币">
            <template #input>
              <van-radio-group v-model="config.system.currency" direction="horizontal">
                <van-radio name="CNY">CNY</van-radio>
                <van-radio name="USD">USD</van-radio>
                <van-radio name="EUR">EUR</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          
          <van-field
            v-model.number="config.system.timeout"
            label="订单超时"
            type="number"
            placeholder="30"
            input-align="right"
          >
            <template #button>
              <span>分钟</span>
            </template>
          </van-field>
          
          <van-cell title="快速确认" label="减少区块确认数，提升确认速度">
            <template #right-icon>
              <van-switch v-model="config.system.fastConfirm" />
            </template>
          </van-cell>
          
          <van-field
            v-model.number="config.system.rateAdjust"
            label="汇率微调"
            type="number"
            placeholder="0.00"
            input-align="right"
          >
            <template #button>
              <span>%</span>
            </template>
          </van-field>
        </van-cell-group>
        
        <van-cell-group title="添加站点" inset>
          <van-cell title="是否添加对接站点？" label="商户可以对接网站收款">
            <template #right-icon>
              <van-switch v-model="addSite" />
            </template>
          </van-cell>
          
          <template v-if="addSite">
            <van-field
              v-model="site.name"
              label="站点名称"
              placeholder="输入站点名称"
            />
            <van-field
              v-model="site.callback"
              label="回调地址"
              placeholder="https://example.com/callback"
            />
          </template>
        </van-cell-group>
      </div>
      
      <!-- Step 4: 完成 -->
      <div v-if="activeStep === 3" class="step-panel complete">
        <van-icon name="checked" size="60" color="#67c23a" />
        <h3>设置完成!</h3>
        <p>HashPay 已成功初始化</p>
        <p class="tip">您可以在聊天中 @{{ botUsername }} 快速发起收款</p>
        
        <van-button type="primary" block @click="finish">
          开始使用
        </van-button>
      </div>
    </div>
    
    <div class="step-actions" v-if="activeStep < 3">
      <van-button 
        v-if="activeStep > 0"
        plain
        @click="prevStep"
      >
        上一步
      </van-button>
      <van-button 
        type="primary"
        @click="nextStep"
      >
        {{ activeStep === 2 ? '完成' : '下一步' }}
      </van-button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { api } from '../utils/api'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const activeStep = ref(0)
const paymentTab = ref(0)
const addSite = ref(false)
const botUsername = ref('hashpay_bot')

const config = ref({
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
    timeout: 30,
    fastConfirm: true,
    rateAdjust: 0
  }
})

const chainOptions = [
  { label: 'TRON (TRC20)', value: 'TRON' },
  { label: 'BNB Smart Chain (BEP20)', value: 'BSC' },
  { label: 'Ethereum (ERC20)', value: 'ETH' },
  { label: 'Polygon (MATIC)', value: 'MATIC' },
  { label: 'Solana', value: 'SOL' },
  { label: 'TON', value: 'TON' }
]

const selectedChains = ref([])
const selectedExchanges = ref([])
const selectedWallets = ref([])

const chainConfigs = ref({})
const exchangeConfigs = ref({
  okx: { apiKey: '', secret: '', passphrase: '' }
})

const site = ref({
  name: '',
  callback: ''
})

function toggleChain(chain) {
  const index = selectedChains.value.indexOf(chain)
  if (index > -1) {
    selectedChains.value.splice(index, 1)
    delete chainConfigs.value[chain]
  } else {
    selectedChains.value.push(chain)
    chainConfigs.value[chain] = { address: '', apiKey: '' }
  }
}

function toggleExchange(exchange) {
  const index = selectedExchanges.value.indexOf(exchange)
  if (index > -1) {
    selectedExchanges.value.splice(index, 1)
  } else {
    selectedExchanges.value.push(exchange)
  }
}

function toggleWallet(wallet) {
  const index = selectedWallets.value.indexOf(wallet)
  if (index > -1) {
    selectedWallets.value.splice(index, 1)
  } else {
    selectedWallets.value.push(wallet)
  }
}

function skipPayment() {
  activeStep.value++
}

async function nextStep() {
  if (activeStep.value === 2) {
    await saveConfig()
  } else {
    activeStep.value++
  }
}

function prevStep() {
  activeStep.value--
}

async function saveConfig() {
  try {
    showToast.loading({
      message: '保存中...',
      forbidClick: true
    })
    
    // 保存系统配置
    await api.put('/internal/config', {
      currency: config.value.system.currency,
      timeout: String(config.value.system.timeout * 60),
      fast_confirm: String(config.value.system.fastConfirm),
      rate_adjust: String(config.value.system.rateAdjust / 100)
    })
    
    // 保存支付方式
    for (const chain of selectedChains.value) {
      const cfg = chainConfigs.value[chain]
      if (cfg.address) {
        await api.post('/internal/payments', {
          type: 'blockchain',
          chain,
          currency: 'USDT',
          address: cfg.address,
          api_key: cfg.apiKey
        })
      }
    }
    
    // 保存站点
    if (addSite.value && site.value.name) {
      await api.post('/internal/sites', site.value)
    }
    
    showToast.success('配置保存成功')
    activeStep.value++
  } catch (err) {
    showToast.fail('保存失败')
    console.error(err)
  }
}

function finish() {
  authStore.setSetupComplete()
  router.replace('/')
}
</script>

<style lang="scss" scoped>
.setup {
  min-height: 100vh;
  background: #f7f8fa;
}

.step-content {
  padding: 20px 0;
  min-height: 400px;
}

.step-panel {
  &.complete {
    text-align: center;
    padding: 60px 20px;
    
    h3 {
      margin: 20px 0 10px;
      font-size: 20px;
    }
    
    p {
      color: #666;
      margin-bottom: 10px;
    }
    
    .tip {
      color: #999;
      font-size: 14px;
      margin-bottom: 30px;
    }
  }
}

.skip-button {
  text-align: center;
  padding: 20px;
}

.step-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  background: white;
  border-top: 1px solid #ebedf0;
  display: flex;
  gap: 12px;
  
  .van-button {
    flex: 1;
  }
}
</style>