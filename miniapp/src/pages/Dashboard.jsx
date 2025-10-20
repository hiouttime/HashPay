import React from 'react'
import { 
  Section, 
  Cell, 
  Title, 
  Text,
  Button,
  Placeholder
} from '@telegram-apps/telegram-ui'

const Dashboard = () => {
  return (
    <div className="dashboard">
      <Section header="HashPay 管理后台">
        <Title level="1">欢迎使用 HashPay</Title>
        
        <Cell
          subtitle="查看收款统计"
          onClick={() => console.log('Stats')}
        >
          统计数据
        </Cell>
        
        <Cell
          subtitle="管理所有订单"
          onClick={() => console.log('Orders')}
        >
          订单管理
        </Cell>
        
        <Cell
          subtitle="配置支付方式"
          onClick={() => console.log('Payments')}
        >
          支付设置
        </Cell>
        
        <Cell
          subtitle="系统配置"
          onClick={() => console.log('Settings')}
        >
          系统设置
        </Cell>
      </Section>
      
      <Placeholder
        description="更多功能正在开发中..."
      />
    </div>
  )
}

export default Dashboard