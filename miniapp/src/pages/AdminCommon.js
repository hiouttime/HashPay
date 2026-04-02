export function formatTime(ts) {
  if (!ts) return '--'
  return new Date(ts * 1000).toLocaleString()
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
  if (status === 'failed') return '失败'
  return '待支付'
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
