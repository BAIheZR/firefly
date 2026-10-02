// 横屏模式：本模块负责「尽力锁 + 还原」，LandscapeGate 负责「锁不住时提示」。screen.orientation.lock 只在全屏或已安装 PWA 里生效，
// requestFullscreen 必须在用户手势的同一任务里调用（路由跳转不算手势），iOS Safari 完全没有 lock 只能靠遮罩提示用户手动转手机
import router from '@/router'
import { canLockOrientation, isMobileDevice } from '@/utils/device'

// 要横屏的页面只认路由 meta.landscape，清单在 router/index.js 里，别在这儿再列白名单
export const shouldLockRoute = (route) => !!route?.meta?.landscape

// 全屏是不是我们开的：只有我们开的才由我们关，别把用户在设置页自己开的全屏一起关掉
let weOpenedFullscreen = false

const isFsApiAvailable = () =>
  typeof document !== 'undefined' &&
  document.fullscreenEnabled &&
  typeof document.documentElement.requestFullscreen === 'function'

// 请求全屏。浏览器不接受被 await 打断之后再发出的全屏请求，
// 所以这个函数必须在用户手势的同一个任务里被同步调用。
function requestFullscreen() {
  const el = document.documentElement
  try {
    return el.requestFullscreen({ navigationUI: 'hide' })
  } catch (e) {
    // 老浏览器 / iOS 不认这个选项时退回无参调用
    try { return el.requestFullscreen() } catch (e2) { return null }
  }
}

// 锁横屏。返回是否成功 —— 失败不是异常情况（未全屏、iOS），调用方不必处理。
async function lockLandscape() {
  if (!canLockOrientation) return false
  try {
    await screen.orientation.lock('landscape')
    return true
  } catch (e) {
    return false
  }
}

// 尽力横屏（用在路由跳转、回到前台这类非手势时机）：已安装 PWA / 已全屏时能成，其余静默失败交给遮罩
export async function enterLandscape() {
  if (!isMobileDevice) return false
  if (await lockLandscape()) return true
  if (!isFsApiAvailable() || document.fullscreenElement) return false
  const p = requestFullscreen()
  if (!p || typeof p.then !== 'function') return false
  try {
    await p
    weOpenedFullscreen = true
    return await lockLandscape()
  } catch (e) {
    return false
  }
}

// 遮罩上那个按钮的出口：一次点击同时下全屏和方向锁，全屏请求必须同步发出，否则手势会过期
export function enterLandscapeByGesture() {
  // 第一枪同步打出（此刻还在用户点击的手势里，lock() 成功率最高）
  lockLandscape()

  // 已经是全屏（或直接不支持全屏 API）就只补这一枪，不必再请求全屏
  if (document.fullscreenElement || !isFsApiAvailable()) return

  const p = requestFullscreen()
  if (!p || typeof p.then !== 'function') {
    weOpenedFullscreen = true
    lockLandscape()
    return
  }
  p.then(() => {
    weOpenedFullscreen = true
    lockLandscape()
  }).catch(() => {
    // 全屏被拒（微信/部分 Android 浏览器会拦）仍再锁一次；遮罩检测到没转成后会提示手动旋转
    lockLandscape()
  })
}

// 还原：解锁方向 + 关掉**我们开的**那个全屏。
// 不判断「当初有没有锁上」——解锁本身是幂等且安全的，省掉一个只在排障时才有用的状态位。
export function exitLandscape() {
  if (canLockOrientation) {
    try { screen.orientation.unlock() } catch (e) { /* 已解锁 / 不支持，忽略 */ }
  }
  if (weOpenedFullscreen && document.fullscreenElement) {
    try { document.exitFullscreen?.() } catch (e) { /* 忽略 */ }
  }
  weOpenedFullscreen = false
}

// 用户自己按 Esc / 手势退出了全屏 → 别再以为那个全屏还归我们管
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) weOpenedFullscreen = false
  })
}

// 路由联动：模块级只注册一次。切进「玩」的页面尽力横屏，切出去立刻还原 ——
// 不还原的话回到主页还是横的，那就变成整站横屏了。
router.afterEach((to) => {
  if (shouldLockRoute(to)) enterLandscape()
  else exitLandscape()
})

// 首屏直接落在游戏页（PWA 的 start_url、刷新、直接输地址）时也要锁一次
router.isReady().then(() => {
  if (shouldLockRoute(router.currentRoute.value)) enterLandscape()
})

// 切到后台再回来，全屏与方向锁可能已经被系统丢掉了，补一发
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (shouldLockRoute(router.currentRoute.value)) enterLandscape()
  })
}
