export function formatTime(ts) {
  if (!ts) return '--'
  if (typeof ts === 'string' && Number.isNaN(Number(ts))) {
    return new Date(ts).toLocaleString()
  }
  const raw = Number(ts)
  const time = raw > 1000000000000 ? raw : raw * 1000
  return new Date(time).toLocaleString()
}

export function formatAmount(value) {
  return Number(value || 0).toFixed(2)
}

export function shortText(value, head = 6, tail = 4) {
  if (!value) return '--'
  if (value.length <= head + tail + 2) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

export function statusText(status) {
  if (status === 'paid') return '已支付'
  if (status === 'expired') return '已过期'
  if (status === 'invalid') return '异常'
  return '待支付'
}

export function networkName(value) {
  const key = String(value || '').trim().toLowerCase()
  if (!key) return '--'
  if (key === 'tron') return 'TRON (TRC20)'
  if (key === 'eth') return 'Ethereum (ERC20)'
  if (key === 'bsc') return 'BNB Smart Chain (BEP20)'
  if (key === 'polygon') return 'Polygon'
  if (key === 'solana') return 'Solana'
  if (key === 'ton') return 'TON'
  return value
}

let toastEl = null
let toastTimer = null

export function showNotice(message) {
  if (!message || typeof document === 'undefined') {
    return
  }

  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.className = 'app-toast'
    document.body.appendChild(toastEl)
  }

  toastEl.textContent = message
  toastEl.classList.add('is-visible')

  if (toastTimer) {
    window.clearTimeout(toastTimer)
  }
  toastTimer = window.setTimeout(() => {
    if (toastEl) {
      toastEl.classList.remove('is-visible')
    }
  }, 1800)
}
