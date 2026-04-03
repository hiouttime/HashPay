import React from 'react'
import { LargeTitle, Text } from '@telegram-apps/telegram-ui'

function PageTitle({ title, subtitle, actions }) {
  return (
    <div className="admin-head">
      <LargeTitle>{title}</LargeTitle>
      {subtitle ? <Text className="admin-subtitle">{subtitle}</Text> : null}
      {actions ? <div className="admin-toolbar">{actions}</div> : null}
    </div>
  )
}

export default PageTitle
