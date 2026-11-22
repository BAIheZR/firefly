// ===== 地址解析（纯函数，无任何依赖）=====
// 同时被渲染进程（src/config/multiplayer.js）和主进程（electron/main.js）引用。
// 以前两边各写一份，默认端口还不一致（8765 vs MP_PORT），改一处忘另一处就会连不上。

/**
 * 解析「主机[:端口]」写法，兼容：
 *   example.com / example.com:8080 / wss://example.com:8080/path?x=1 / [::1]:9000 / [::1]
 * 返回 { host, port, explicitPort }；无法解析返回 null。
 */
export function parseHostPort(input, defaultPort = 8765) {
  let s = String(input || '').trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  if (!s) return null
  // 去掉路径与查询串，避免把 /path 或 ?x=1 当成端口的一部分
  const slash = s.indexOf('/')
  if (slash !== -1) s = s.slice(0, slash)
  const q = s.indexOf('?')
  if (q !== -1) s = s.slice(0, q)

  // IPv6 字面量：[::1]:9000 或 [::1]
  const m6 = s.match(/^\[([^\]]+)\](?::(\d+))?$/)
  if (m6) {
    return { host: m6[1], port: Number(m6[2]) || defaultPort, explicitPort: !!m6[2] }
  }

  const idx = s.lastIndexOf(':')
  if (idx === -1) return { host: s, port: defaultPort, explicitPort: false }
  const host = s.slice(0, idx)
  const port = Number(s.slice(idx + 1))
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { host, port, explicitPort: true }
}

/** 只取主机名（去掉协议头、路径、查询串、端口），取不到返回空串 */
export function extractHost(input, defaultPort = 8765) {
  const parsed = parseHostPort(input, defaultPort)
  if (parsed) return parsed.host
  // 端口写成非数字 / 越界时 parse 会失败，这里仍尽量取出主机名（保持旧行为，避免协议猜测退化）
  let s = String(input || '').trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  if (!s) return ''
  s = s.split('/')[0].split('?')[0]
  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    return end === -1 ? s.slice(1) : s.slice(1, end)
  }
  const idx = s.lastIndexOf(':')
  return idx === -1 ? s : s.slice(0, idx)
}
