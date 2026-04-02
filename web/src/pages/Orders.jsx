import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  List,
  Section,
  Placeholder,
  IconButton,
} from '@telegram-apps/telegram-ui'

function Orders() {
  const navigate = useNavigate()

  return (
    <List>
      <Section
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconButton size="s" onClick={() => navigate('/dashboard')}>
              ←
            </IconButton>
            <span>订单管理</span>
          </div>
        }
      >
        <Placeholder
          header="暂无订单"
          description="订单记录将显示在这里"
        />
      </Section>
    </List>
  )
}

export default Orders
