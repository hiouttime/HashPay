import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function useTelegramBackButton() {
  const navigate = useNavigate()

  useEffect(() => {
    const backButton = window.Telegram?.WebApp?.BackButton
    if (!backButton) return undefined

    const onBack = () => {
      navigate(-1)
    }

    backButton.show()
    backButton.onClick(onBack)

    return () => {
      backButton.offClick(onBack)
      backButton.hide()
    }
  }, [navigate])
}

export default useTelegramBackButton
