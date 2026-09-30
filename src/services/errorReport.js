// 渲染进程错误上报
export function installErrorReporting(app) {
  if (typeof window === 'undefined') return
  const api = window.electronAPI
  const isElectron = !!(api && api.isElectron)

  const send = (level, source, message, detail) => {
    if (isElectron && api.reportError) {
      try { api.reportError(level, source, message, detail) } catch (_) { /* 静默 */ }
    }
    if (level === 'error') console.error(`[${source}] ${message}`, detail || '')
    else if (level === 'warn') console.warn(`[${source}] ${message}`, detail || '')
  }

  // 1. 资源加载失败（img/script/link 等标签，捕获阶段才能拿到）
  window.addEventListener(
    'error',
    (e) => {
      const target = e.target
      if (target && target !== window && (target.src || target.href)) {
        send('error', '资源', `资源加载失败: ${target.src || target.href}（标签: ${target.tagName}）`)
        return
      }
      // 2. JS 运行时错误
      send('error', '渲染', e.message || '未知运行时错误', e.error?.stack)
    },
    true
  )

  // 3. 未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    send('error', '渲染', `未处理的 Promise 拒绝: ${reason?.message || reason}`, reason?.stack)
  })

  // 4. Vue 组件错误
  if (app) {
    app.config.errorHandler = (err, _instance, info) => {
      send('error', 'Vue', `${info}: ${err?.message || err}`, err?.stack)
    }
  }

  // 5. 启动心跳：解除主进程白屏看门狗，并周期保活
  const ping = () => {
    if (isElectron && api.reportAlive) {
      try { api.reportAlive() } catch (_) { /* 静默 */ }
    }
  }
  send('info', '启动', `渲染进程就绪 UA=${navigator.userAgent}`)
  ping()
  setInterval(ping, 10000)
}
