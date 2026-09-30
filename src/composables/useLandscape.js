// 横屏模式
//
// 用户要求：移动端进入「玩」的页面一律横屏，不要竖屏。
//
// 现实约束（决定了整个实现的形状）：
//   · `screen.orientation.lock('landscape')` 只在**全屏**或**已安装的 PWA**里生效；
//     普通浏览器标签页里调用会被拒。
//   · `requestFullscreen()` 必须落在用户手势的同一个任务里 —— 路由跳转不算手势，
//     所以「自动横屏」只能尽力而为，真正可靠的那一枪得由遮罩上的按钮打出去。
//   · iOS Safari **完全没有** screen.orientation.lock。那边唯一的出路是遮罩提示
//     用户手动转手机 —— 转过去之后 isPortrait 变 false，遮罩自己就消失了。
//
// 因此分工：本模块负责「尽力锁 + 还原」，LandscapeGate 负责「锁不住时提示」。
import router from '@/router'
import { canLockOrientation, isMobileDevice } from '@/utils/device'

// 要横屏的页面只认路由 meta.landscape —— 清单在 router/index.js 里，
// 别在这儿再列一份路径白名单，否则新增游戏一定漏改一处。
export const shouldLockRoute = (route) => !!route?.meta?.landscape

// 全屏是不是我们开的。只有我们开的才由我们关 ——
// 用户可能在设置页自己点过全屏，退出游戏时不该把他的全屏一起关掉。
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

// 尽力横屏（用在路由跳转、回到前台这类**非手势**时机）：
// 已安装 PWA / 已处于全屏时能成，其余情况静默失败，交给遮罩。
// ★ 桌面端直接返回：这条需求只针对移动端，桌面窗口该怎么摆是用户自己的事，
//   顺便也免掉了「桌面浏览器访问 /chess 时莫名尝试全屏」这种怪行为。
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

// 遮罩上那个按钮的出口：一次点击同时要下全屏和方向锁。
// ★ 全屏请求先同步发出去，别在它前面 await 任何东西，否则手势就过期了。
export function enterLandscapeByGesture() {
  if (!isFsApiAvailable() || document.fullscreenElement) {
    lockLandscape()
    return
  }
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
    // 全屏被拒（部分 iPad / 权限策略）—— 仍然再试一次锁方向
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
