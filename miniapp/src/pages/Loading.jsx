import React from 'react'
import './Admin.scss'

function Loading() {
  return (
    <div className="screen-loading">
      <div className="pulse-dot" />
      <p>HashPay 正在加载…</p>
    </div>
  )
}

export default Loading
