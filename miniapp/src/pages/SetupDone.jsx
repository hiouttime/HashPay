import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Caption, List, Section, Text } from '@telegram-apps/telegram-ui'
import { CreditCard, Settings2, Store } from 'lucide-react'
import { AppPage } from '../components/AppPage'
import './Admin.scss'

function SetupDone() {
  const navigate = useNavigate()

  return (
    <AppPage
      title="就是这样！"
      subtitle="可以开始使用 HashPay了"
      className="setup-page"
      footer={(
        <Button stretched onClick={() => navigate('/dashboard')}>
          完成
        </Button>
      )}
    >
      <List>
        <div className="admin-section">
          <Section header="接下来，你可以进行以下配置：">
            <div className="setup-next-list">
              <div className="setup-next-item">
                <div className="setup-next-icon">
                  <Settings2 size={18} strokeWidth={2.2} />
                </div>
                <div className="setup-next-copy">
                  <Text>系统设置</Text>
                  <Caption>配置币种、汇率以及超时时间。</Caption>
                </div>
              </div>

              <div className="setup-next-item">
                <div className="setup-next-icon">
                  <CreditCard size={18} strokeWidth={2.2} />
                </div>
                <div className="setup-next-copy">
                  <Text>支付方式</Text>
                  <Caption>添加接受的支付方式。</Caption>
                </div>
              </div>

              <div className="setup-next-item">
                <div className="setup-next-icon">
                  <Store size={18} strokeWidth={2.2} />
                </div>
                <div className="setup-next-copy">
                  <Text>添加商户</Text>
                  <Caption>让网站也能通过 HashPay 收款</Caption>
                </div>
              </div>
            </div>
          </Section>
        </div>
      </List>
    </AppPage>
  )
}

export default SetupDone
