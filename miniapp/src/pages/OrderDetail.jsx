import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { adminApi } from '../utils/api'
import { AppGroup, AppPage } from '../components/AppPage'
import { formatAmount, formatTime, statusText } from './AdminCommon'
import './Admin.scss'

function OrderDetail() {
  const { id } = useParams()
  const [item, setItem] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await adminApi.order(id)
        setItem(data)
      } catch {
        setItem(null)
      }
    }
    void load()
  }, [id])

  return (
    <AppPage title="订单详情" subtitle="这里应该能让管理员快速判断订单在什么阶段卡住。">
      <AppGroup title="状态快照">
        {item ? (
          <div className="detail-grid">
            <div><dt>订单号</dt><dd>{item.id}</dd></div>
            <div><dt>状态</dt><dd>{statusText(item.status)}</dd></div>
            <div><dt>商户</dt><dd>{item.merchant_id}</dd></div>
            <div><dt>商户单号</dt><dd>{item.merchant_order_no || '--'}</dd></div>
            <div><dt>金额</dt><dd>{formatAmount(item.fiat_amount)} {item.fiat_currency}</dd></div>
            <div><dt>创建时间</dt><dd>{formatTime(item.created_at)}</dd></div>
            <div><dt>过期时间</dt><dd>{formatTime(item.expire_at)}</dd></div>
            <div><dt>回调状态</dt><dd>{item.notify_status || '--'}</dd></div>
            <div><dt>交易哈希</dt><dd>{item.tx_hash || '--'}</dd></div>
          </div>
        ) : <div className="empty-state">订单不存在。</div>}
      </AppGroup>
      {item?.route ? (
        <AppGroup title="支付快照">
          <div className="detail-grid">
            <div><dt>驱动</dt><dd>{item.route.driver}</dd></div>
            <div><dt>网络</dt><dd>{item.route.network}</dd></div>
            <div><dt>币种</dt><dd>{item.route.currency}</dd></div>
            <div><dt>应付金额</dt><dd>{item.route.amount}</dd></div>
            <div><dt>地址/账户</dt><dd>{item.route.address || item.route.account_name || '--'}</dd></div>
            <div><dt>备注</dt><dd>{item.route.memo || '--'}</dd></div>
            <div><dt>说明</dt><dd>{item.route.instructions || '--'}</dd></div>
          </div>
        </AppGroup>
      ) : null}
    </AppPage>
  )
}

export default OrderDetail
