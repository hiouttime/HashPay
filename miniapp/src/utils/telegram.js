export const tg = window.Telegram?.WebApp

export function initTelegram() {
  if (!tg) {
    console.warn('Telegram WebApp not available')
    return
  }
  
  tg.ready()
  tg.expand()
  
  tg.MainButton.setParams({
    text: '保存',
    color: '#667eea',
    text_color: '#ffffff',
    is_active: false,
    is_visible: false
  })
  
  tg.BackButton.onClick(() => {
    window.history.back()
  })
  
  tg.SettingsButton.onClick(() => {
    window.location.href = '/settings'
  })
}

export function showMainButton(text, onClick) {
  if (!tg) return
  
  tg.MainButton.setParams({
    text,
    is_active: true,
    is_visible: true
  })
  
  tg.MainButton.offClick()
  tg.MainButton.onClick(onClick)
}

export function hideMainButton() {
  if (!tg) return
  
  tg.MainButton.hide()
  tg.MainButton.offClick()
}

export function showBackButton() {
  if (!tg) return
  tg.BackButton.show()
}

export function hideBackButton() {
  if (!tg) return
  tg.BackButton.hide()
}

export function showLoading() {
  if (!tg) return
  tg.MainButton.showProgress()
}

export function hideLoading() {
  if (!tg) return
  tg.MainButton.hideProgress()
}

export function showAlert(message) {
  if (!tg) return
  tg.showAlert(message)
}

export function showConfirm(message) {
  if (!tg) return
  return new Promise(resolve => {
    tg.showConfirm(message, resolve)
  })
}

export function getUserData() {
  if (!tg) return null
  
  return {
    id: tg.initDataUnsafe?.user?.id,
    username: tg.initDataUnsafe?.user?.username,
    firstName: tg.initDataUnsafe?.user?.first_name,
    lastName: tg.initDataUnsafe?.user?.last_name,
    photoUrl: tg.initDataUnsafe?.user?.photo_url,
    authDate: tg.initDataUnsafe?.auth_date,
    hash: tg.initDataUnsafe?.hash
  }
}

export function getThemeParams() {
  if (!tg) return {}
  return tg.themeParams || {}
}