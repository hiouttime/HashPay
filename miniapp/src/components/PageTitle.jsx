import React from 'react'
import { Title, Text } from '@telegram-apps/telegram-ui'

function PageTitle({ title, subtitle, actions }) {
  return (
    <div className="admin-head">
      <Title level="2" className="page-title-text">{title}</Title>
      {subtitle ? <Text className="admin-subtitle">{subtitle}</Text> : null}
      {actions ? <div className="admin-toolbar">{actions}</div> : null}
    </div>
  )
}

export default PageTitle
