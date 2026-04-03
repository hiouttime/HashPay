import React from 'react'
import './Admin.scss'

function Loading() {
  return (
    <div className="screen-loading">
      <div className="pulse-dot" />
      <p>HashPay 正在整理管理面板…</p>
    </div>
  )
}

export default Loading
