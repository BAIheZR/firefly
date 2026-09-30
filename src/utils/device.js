// 设备与视口判定
import { ref } from 'vue'

// 与 CSS 里的 @media (max-width: 768px) 保持严格一致 —— 改一处必须改另一处
export const MOBILE_BREAKPOINT = 768

// 「矮视口」断点：手机横屏（游戏页强制横屏）可用高度只有 350~430px，
// 竖屏手机与桌面窗口都远高于它。与各游戏页 CSS 里的
// @media (max-height: 620px) 保持严格一致 —— 改一处必须改另一处。
export const SHORT_VIEWPORT_PX = 620

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

// 视口是不是「矮」的（手机横屏 / 小窗口）。
// 布局（CSS）与棋盘格宽的换算（JS）都要用它，所以必须来自同一处判定，
// 否则会出现「CSS 已经按一屏排好、JS 还按宽屏算格宽」导致棋盘高过容器。
export const isShortViewport = ref(false)

// 视口是不是「竖着」的 —— 横屏遮罩靠它触发。
// ★ 用 innerHeight > innerWidth，而不是 screen.orientation.type：
//   后者在桌面浏览器上反映的是**物理屏幕**方向（显示器恒为 landscape），
//   拿它判断会把「窗口被拖成竖条」误判成横屏。
export const isPortrait = ref(false)

function syncViewport() {
  if (typeof window === 'undefined') return
  // 用 innerWidth 而非 screen.width：分屏、折叠屏、桌面拖窄窗口都要正确响应
  isNarrow.value = window.innerWidth <= MOBILE_BREAKPOINT
  isPortrait.value = window.innerHeight > window.innerWidth
  isShortViewport.value = window.innerHeight <= SHORT_VIEWPORT_PX
}

if (typeof window !== 'undefined') {
  syncViewport()
  // passive: true —— 滚动/旋转时这个回调不能阻塞手势
  window.addEventListener('resize', syncViewport, { passive: true })
  window.addEventListener('orientationchange', syncViewport, { passive: true })
}

// 浏览器能不能「锁定屏幕方向」。
// Android Chrome 有，但要求页面处于全屏或已安装 PWA；iOS Safari 完全没有这个 API。
// 不支持时只能靠 LandscapeGate 的遮罩提示用户手动转手机，所以这里要单独暴露出来。
export const canLockOrientation =
  typeof screen !== 'undefined' &&
  !!screen.orientation &&
  typeof screen.orientation.lock === 'function'

// 用户是否要求减少动效（系统级无障碍设置，移动端省电模式下也会命中）
export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 便捷组合：需要同时拿布局与性能判定的组件用这个
export function useDevice() {
  return {
    isNarrow, isPortrait, isShortViewport,
    isTouchDevice, isMobileDevice, isLowPowerDevice, canLockOrientation,
  }
}
