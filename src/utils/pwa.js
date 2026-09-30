//  PWA 离线壳注册
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
