<template>
  <transition name="cd-fade">
    <div v-if="modelValue" class="cd-overlay" @click.self="handleCancel">
      <div class="cd-box">
        <div class="cd-icon">
          <i class="fa-solid fa-circle-question"></i>
        </div>
        <div v-if="title" class="cd-title">{{ title }}</div>
        <div class="cd-message">{{ message }}</div>
        <div class="cd-actions">
          <button class="cd-btn cd-cancel" @click="handleCancel">
            {{ cancelText }}
          </button>
          <button class="cd-btn cd-ok" @click="handleConfirm">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
const props = defineProps({
  modelValue: Boolean,
  title: { type: String, default: '提示' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' }
})
const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const handleConfirm = () => {
  emit('confirm')
  emit('update:modelValue', false)
}
const handleCancel = () => {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.cd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
  /* 移动端：安全区内边距，避免贴边被圆角/刘海裁切 */
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}

.cd-box {
  min-width: 320px;
  max-width: 90vw;
  padding: 28px 24px 20px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  text-align: center;
  border: 1px solid #3FA98A;
}

.cd-icon {
  font-size: 40px;
  color: #3FA98A;
  margin-bottom: 12px;
}

.cd-title {
  font-size: 18px;
  font-weight: 700;
  color: #333;
  margin-bottom: 8px;
}

.cd-message {
  font-size: 15px;
  color: #666;
  margin-bottom: 22px;
  line-height: 1.5;
}

.cd-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.cd-btn {
  flex: 1;
  padding: 10px 20px;
  font-size: 15px;
  font-weight: 500;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid #ddd;
  background: #fff;
  color: #666;
}

.cd-cancel:hover {
  border-color: #999;
  color: #333;
}

.cd-ok {
  background: linear-gradient(135deg, #3FA98A, #5BC9A0);
  border: none;
  color: #fff;
  font-weight: 600;
}

.cd-ok:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(63, 169, 138, 0.45);
}

.cd-fade-enter-active,
.cd-fade-leave-active {
  transition: opacity 0.2s ease;
}
.cd-fade-enter-from,
.cd-fade-leave-to {
  opacity: 0;
}

/* ===== 移动端：窄屏下改为接近满宽，按钮加大到可点范围 ===== */
@media (max-width: 768px) {
  .cd-box {
    min-width: 0;
    width: 100%;
    max-width: none;
    padding: 24px 18px 16px;
    border-radius: 14px;
  }
  .cd-icon { font-size: 34px; margin-bottom: 10px; }
  .cd-title { font-size: 17px; }
  .cd-message { font-size: 14px; margin-bottom: 18px; }
  .cd-actions { gap: 10px; }
  /* 触控目标至少 44px 高 */
  .cd-btn {
    padding: 12px 16px;
    font-size: 15px;
    min-height: 46px;
  }
  /* 触摸设备没有 hover，取消位移反馈，只保留按下态 */
  .cd-ok:active { transform: scale(0.98); }
}

@media (hover: none) {
  .cd-cancel:hover { border-color: #ddd; color: #666; }
  .cd-ok:hover { transform: none; box-shadow: none; }
  .cd-ok:active { transform: scale(0.98); }
}
</style>
