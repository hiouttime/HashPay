import React from 'react'
import { Spinner, Text } from '@telegram-apps/telegram-ui'
import './Loading.scss'

function Loading() {
  return (
    <div className="loading-page">
      <Spinner size="m" />
      <Text className="loading-text">正在加载...</Text>
    </div>
  )
}

export default Loading
