<template>
  <Transition name="toast-fade">
    <div v-if="toastStore.toastVisible" class="greeting-toast">
      <i class="fa-solid fa-comment-dots toast-icon"></i>
      <span class="toast-text">{{ toastStore.toastText }}</span>
    </div>
  </Transition>
</template>

<script setup>
import { useToastStore } from '@/config/toast'

const toastStore = useToastStore()
</script>

<style scoped>
.greeting-toast {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 360px;
  padding: 12px 18px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid #3FA98A;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  color: #4a3a10;
  font-size: 14px;
  line-height: 1.5;
  pointer-events: none;
}
.toast-icon {
  color: #3FA98A;
  font-size: 16px;
  flex-shrink: 0;
}
.toast-text {
  white-space: pre-wrap;
}

/* 渐入渐出 */
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

/* 移动端：右上角 360px 宽的气泡在窄屏上会横向顶出去，
   改为横跨整行并让出安全区；进出动画方向也改为从上方落下更自然 */
@media (max-width: 768px) {
  .greeting-toast {
    top: calc(var(--safe-top, 0px) + 8px);
    left: 10px;
    right: 10px;
    max-width: none;
    padding: 10px 14px;
    font-size: 13px;
    border-radius: 10px;
    /* 移动端已全局关闭毛玻璃，改不透明底保证文字清晰 */
    background: rgba(255, 255, 255, 0.96);
  }

  .toast-fade-enter-from,
  .toast-fade-leave-to {
    opacity: 0;
    transform: translateY(-12px);
  }
}
</style>
