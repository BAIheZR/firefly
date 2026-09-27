import { defineStore } from 'pinia'
import { ref } from 'vue'

// 全局问候 Toast：用于无人物图的页面（如 notify 签到反馈）
// 右上角显示，5 秒后自动隐藏，渐入渐出
export const useToastStore = defineStore('greetingToast', () => {
  const toastText = ref('')
  const toastVisible = ref(false)
  let timer = null

  function showToast(text, duration = 5000) {
    if (!text) return
    toastText.value = text
    toastVisible.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { toastVisible.value = false }, duration)
  }

  function hideToast() {
    toastVisible.value = false
    if (timer) clearTimeout(timer)
  }

  return { toastText, toastVisible, showToast, hideToast }
})
