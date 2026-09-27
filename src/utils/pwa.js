/**
 * PWA 离线壳注册。
 *
 * 只在「生产构建 + 安全上下文」下注册，理由：
 *  1. 开发模式下 Vite 的模块 URL 每次 HMR 都在变，SW 缓存会和热更新打架，
 *     表现为改了代码页面不刷新、甚至加载到已删除的模块。这是最容易踩的坑，直接跳过。
 *  2. Electron 桌面端从 file:// 加载，navigator.serviceWorker 不存在，天然跳过。
 *  3. http（非 localhost）下浏览器不提供 SW，提前判掉可避免抛异常。
 *
 * 更新策略：检测到新版本时**不**主动 skipWaiting 触发刷新 —— 本应用可能有正在播放的
 * 音乐、正在进行的对局，中途刷新会打断用户。新版本在下次冷启动自然生效。
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  // 开发模式不注册（见上）
  if (import.meta.env.DEV) return
  // 非安全上下文（http 且非 localhost）浏览器压根不支持，注册会抛错
  if (!window.isSecureContext) return

  window.addEventListener('load', () => {
    // base 为 './'，用相对路径注册，保证部署到子目录时也能命中
    const swUrl = new URL('sw.js', document.baseURI).href
    navigator.serviceWorker.register(swUrl, { scope: './' }).then(
      (reg) => {
        // 有更新在等待时只记一笔，交给下次冷启动
        if (reg.waiting) console.info('[PWA] 有新版本待下次启动生效')
      },
      (err) => {
        // 注册失败不影响应用本身，静默降级
        console.warn('[PWA] Service Worker 注册失败，应用将按在线模式运行', err)
      }
    )
  })
}
