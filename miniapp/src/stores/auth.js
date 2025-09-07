import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const isSetup = ref(localStorage.getItem('isSetup') === 'true')
  const user = ref(null)
  
  function setSetupComplete() {
    isSetup.value = true
    localStorage.setItem('isSetup', 'true')
  }
  
  function setUser(userData) {
    user.value = userData
  }
  
  return {
    isSetup,
    user,
    setSetupComplete,
    setUser
  }
})