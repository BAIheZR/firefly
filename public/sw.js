const VERSION = 'v1'
const SHELL_CACHE = `shell-${VERSION}`
const ASSET_CACHE = `asset-${VERSION}`

// 预缓存应用外壳。base 为 './'，这里用相对路径，避免部署到子目录时 404
const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './pwa/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // 逐个 add，单个失败不拖垮整个安装（比如图标缺失时仍能装上）
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      )
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

// 页面可以主动要求新版 SW 立即接管
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

/** 异步活数据：不缓存，直接走网络 */
function isBypassed(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws') ||
    url.search.includes('_t=') // 时间戳探测请求
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }

  // 跨域（CDN 等）与协议不支持的请求，交给浏览器默认行为
  if (url.origin !== self.location.origin) return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (isBypassed(url)) return

  // 导航请求：网络优先，离线时才回退到外壳。
  // 用 hash 路由时导航 URL 恒定，等于"打开就用最新版，断网也能开"。
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(SHELL_CACHE)
          // 这里必须 await：不等待的话响应一返回，SW 可能就被回收，写入丢失
          await cache.put('./index.html', fresh.clone()).catch(() => {})
          return fresh
        } catch {
          const cache = await caches.open(SHELL_CACHE)
          return (
            (await cache.match('./index.html')) ||
            (await cache.match('./')) ||
            Response.error()
          )
        }
      })()
    )
    return
  }

  // 静态资源：stale-while-revalidate
  const cachePromise = caches.open(ASSET_CACHE)
  const network = cachePromise.then((cache) =>
    fetch(req)
      .then((res) => {
        // 只缓存成功的基本响应；opaque（跨域）已在上面拦掉了
        if (res && res.status === 200 && res.type === 'basic') {
          return cache.put(req, res.clone()).then(() => res)
        }
        return res
      })
  )
  event.waitUntil(network.catch(() => {}))

  event.respondWith(
    (async () => {
      const cached = await cachePromise.then((c) => c.match(req))
      if (cached) return cached
      const res = await network.catch(() => null)
      return res || Response.error()
    })()
  )
})
