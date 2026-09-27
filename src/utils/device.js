// ======== 设备与视口判定 ========
// 两类判定分开，不要混用：
//   isNarrow       —— 视口宽度是否处于移动端断点（响应式，随 resize 变化）→ 用于「布局」
//   isTouchDevice  —— 是否触屏设备（不随视口变化）→ 用于「交互方式」
//   isMobileDevice —— 是否移动端设备（UA/触屏，不随视口变化）→ 用于「性能降级」
// 这样桌面端把窗口拖窄只影响布局（仍用鼠标交互），移动端则同时降级性能。
import { ref } from 'vue'

// 与 CSS 里的 @media (max-width: 768px) 保持严格一致 —— 改一处必须改另一处
export const MOBILE_BREAKPOINT = 768

const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''

// 是否触屏（触控交互的判据，桌面触摸屏也算）
export const isTouchDevice =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0)

// 是否移动端设备：手机/平板。用于性能降级，故宁可多认几个 UA
export const isMobileDevice =
  /Android|iPhone|iPod|Mobile|HarmonyOS|MiuiBrowser|MicroMessenger|webOS|BlackBerry|Opera Mini/i.test(ua) ||
  (isTouchDevice && /iPad|Tablet|PlayBook|Silk/i.test(ua))

// 低性能设备：移动端一律按低性能处理。
// 依据：本项目 3D 模型（three.js + MMD）与多处 backdrop-filter 在手机上开销很大，
// 统一走降级路径比逐项探测更可控。
export const isLowPowerDevice = isMobileDevice

// 是否处于「视口窄」状态 —— 布局跟随它，而不是跟随设备类型
export const isNarrow = ref(false)

function syncNarrow() {
  if (typeof window === 'undefined') return
  // 用 innerWidth 而非 screen.width：分屏、折叠屏、桌面拖窄窗口都要正确响应
  isNarrow.value = window.innerWidth <= MOBILE_BREAKPOINT
}

if (typeof window !== 'undefined') {
  syncNarrow()
  // passive: true —— 滚动/旋转时这个回调不能阻塞手势
  window.addEventListener('resize', syncNarrow, { passive: true })
  window.addEventListener('orientationchange', syncNarrow, { passive: true })
}

// 用户是否要求减少动效（系统级无障碍设置，移动端省电模式下也会命中）
export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 便捷组合：需要同时拿布局与性能判定的组件用这个
export function useDevice() {
  return { isNarrow, isTouchDevice, isMobileDevice, isLowPowerDevice }
}
