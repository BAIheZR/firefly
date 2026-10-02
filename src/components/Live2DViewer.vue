<template>
  <div ref="hostEl" class="live2d-host">
    <div v-if="status === 'loading' || status === 'error'" class="live2d-overlay" :class="`is-${status}`">
      <span v-if="status === 'loading'" class="live2d-spinner" />
      <span class="live2d-msg">{{ overlayText }}</span>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'Live2DViewer' })

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { toRuntimeUrl } from '@/utils/assetUrl'

const props = defineProps({
  /** model3.json 的路径（public 下用 /live2d/xxx/xxx.model3.json 写法即可） */
  src: { type: String, required: true },
  /** 页面是否可见：false 时暂停 ticker（keep-alive 切走 / 隐藏时省电） */
  active: { type: Boolean, default: true },
  /** 用户缩放倍率（调整面板的滑杆） */
  scale: { type: Number, default: 1 },
  /** 用户位移（相对视口中心的像素偏移） */
  offsetX: { type: Number, default: 0 },
  offsetY: { type: Number, default: 0 },
  /** 模型「内容外框」高度占视口高度的比例 */
  fitHeight: { type: Number, default: 0.92 },
  /** 内容外框宽度占视口宽度的上限（横屏兜底，避免被切掉） */
  fitWidth: { type: Number, default: 0.96 },
  /** 渲染帧率上限（移动端建议 30，省电省 GPU） */
  maxFps: { type: Number, default: 60 },
  /** 视线跟随鼠标/手指 */
  followPointer: { type: Boolean, default: true },
  /** 抗锯齿（Live2D 贴图自带边缘透明，关掉能省不少性能） */
  smooth: { type: Boolean, default: false },
})

const emit = defineEmits(['ready', 'error'])

const hostEl = ref(null)
const status = ref('idle') // idle | loading | ready | error
const errMsg = ref('')

const overlayText = computed(() => {
  if (status.value === 'loading') return '正在唤醒流萤…'
  return errMsg.value || ''
})

//  运行时对象：故意不放进 reactive，避免 Vue 去代理 WebGL 内部结构 
let app = null
let model = null
let ApplicationRef = null
let Live2DModelRef = null
let resizeObserver = null
let contentBox = null // { cx, cy, w, h }：模型画布像素空间中的内容外框
let disposed = false
let loadSeq = 0 // 竞态令牌：切服装/切页面时旧的一次加载要能作废
let clearColorFallback = null // 清屏色兜底回调（挂在 ticker 上，teardown 要摘掉）

// 供父组件响应式读取的布局状态（气泡跟随头部坐标要用）
const fitScale = ref(1)
const stageSize = ref({ w: 0, h: 0 })

/** 模型「头部」在视口坐标里的位置（内容外框的顶边中点） */
const headScreenPos = computed(() => {
  if (status.value !== 'ready' || !contentBox) return null
  const s = fitScale.value * props.scale
  return {
    x: stageSize.value.w / 2 + props.offsetX,
    y: stageSize.value.h / 2 + props.offsetY - (contentBox.h * s) / 2,
  }
})

// 等 ticker 真正走过 n 帧（限帧后 ticker 比 rAF 慢，不能等 rAF）；另配超时兜底防止卡在 loading
function waitTicks(n, timeoutMs = 800) {
  if (!app) return Promise.resolve()
  const ticker = app.ticker
  return Promise.race([
    new Promise((resolve) => {
      let left = n
      const fn = () => {
        if (--left <= 0) {
          ticker.remove(fn)
          resolve()
        }
      }
      ticker.add(fn)
    }),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ])
}

// 懒加载运行时：cubism4 入口顶层就会检查 window.Live2DCubismCore，缺了直接 throw，
// 故必须动态 import，让缺核心文件只影响 Live2D 而不把整个 App 启动带崩（顺带 pixi 也按需加载）
async function ensureRuntime() {
  if (Live2DModelRef) return
  if (typeof window === 'undefined' || !window.Live2DCubismCore) {
    throw new Error('未找到 Live2D Cubism Core（public/live2dcubismcore.min.js 缺失或未在 index.html 中先于 main.js 引入）')
  }
  const [pixiMod, l2dMod] = await Promise.all([
    import('pixi.js'),
    import('@jannchie/pixi-live2d-display/cubism4'),
  ])
  ApplicationRef = pixiMod.Application
  Live2DModelRef = l2dMod.Live2DModel
}

function hostSize() {
  const el = hostEl.value
  if (!el) return { w: 0, h: 0 }
  return { w: el.clientWidth, h: el.clientHeight }
}

// 量出「内容外框」——真正被画出来的部件所占矩形，而不是整张画布。
// Live2D 的 CanvasWidth/Height 往往比角色本身大一圈，按内容缩放才能在任意屏幕上都大小合适
function measureContent() {
  const im = model.internalModel
  const core = im.coreModel
  const W = im.originalWidth || 1
  const H = im.originalHeight || 1
  const fallback = { cx: W / 2, cy: H / 2, w: W, h: H, exact: false }

  let l = Infinity
  let t = Infinity
  let r = -Infinity
  let b = -Infinity
  let used = 0
  const n = core.getDrawableCount ? core.getDrawableCount() : 0

  for (let i = 0; i < n; i++) {
    try {
      if (core.getDrawableVertexCount && core.getDrawableVertexCount(i) <= 0) continue
      if (core.getDrawableDynamicFlagIsVisible && !core.getDrawableDynamicFlagIsVisible(i)) continue
      if (core.getDrawableOpacity && core.getDrawableOpacity(i) <= 0.001) continue
    } catch (e) {
      /* 单个部件的标志位读不到就当它可见，别整个放弃 */
    }
    let box = null
    try {
      box = im.getDrawableBounds(i, {})
    } catch (e) {
      box = null
    }
    if (!box || !isFinite(box.x) || !isFinite(box.y)) continue
    if (!(box.width > 0) || !(box.height > 0)) continue
    l = Math.min(l, box.x)
    t = Math.min(t, box.y)
    r = Math.max(r, box.x + box.width)
    b = Math.max(b, box.y + box.height)
    used++
  }

  // 部件太少（含全部不可见）说明标志位还没写好，退回整张画布
  if (used < 2 || !isFinite(l) || r - l <= 0 || b - t <= 0) return fallback
  // 外框大得离谱 → 多半把某个藏得很远的隐藏部件算进来了，同样不可信
  if (r - l > W * 3 || b - t > H * 3) return fallback
  return { cx: (l + r) / 2, cy: (t + b) / 2, w: r - l, h: b - t, exact: true }
}

/** 按当前容器尺寸 + 用户变换重新摆放模型 */
function layout() {
  if (!app || !model || !contentBox) return
  const sw = app.screen.width
  const sh = app.screen.height
  if (sw <= 0 || sh <= 0) return
  stageSize.value = { w: sw, h: sh }

  // 内容外框先撑到视口高度的 fitHeight，再用宽度上限兜一道
  const s = Math.min((sh * props.fitHeight) / contentBox.h, (sw * props.fitWidth) / contentBox.w)
  fitScale.value = s

  const total = s * props.scale
  model.scale.set(total)
  // 让「内容中心」落在视口中心（再叠加用户偏移）
  model.position.set(
    sw / 2 - contentBox.cx * total + props.offsetX,
    sh / 2 - contentBox.cy * total + props.offsetY,
  )
}

function handleResize() {
  if (!app) return
  const { w, h } = hostSize()
  if (w <= 0 || h <= 0) return
  app.renderer.resize(w, h)
  layout()
}

// 尺寸监听要跟着 mount 走，不能只放在 onMounted（切服装会重挂，observer 会被断开）
function setupResizeObserver() {
  if (!hostEl.value || typeof ResizeObserver === 'undefined') return
  if (resizeObserver) resizeObserver.disconnect()
  resizeObserver = new ResizeObserver(() => handleResize())
  resizeObserver.observe(hostEl.value)
}

// 修一个「第三方偷改 GL 全局状态、pixi 却不知情」的坑 —— 白屏根因：Live2D 渲染 clip mask 时
// 调 gl.clearColor(1,1,1,0) 没告诉 pixi，缓存失真后拿残留白色清主画布。这里套一层并同步缓存
function patchClearColorSync(application) {
  const gl = application?.renderer?.gl
  const cache = application?.renderer?.renderTarget?.adaptor?._clearColorCache
  if (!gl) return false

  if (!Array.isArray(cache)) {
    // 兜底：拿不到 pixi 的内部缓存时，改为每帧渲染前主动把清屏色掰回透明
    // 这里用 NORMAL(0) 注册，一定比它先跑。本组件固定 backgroundAlpha: 0，所以安全。
    clearColorFallback = () => gl.clearColor(0, 0, 0, 0)
    application.ticker.add(clearColorFallback, undefined, 0)
    console.warn('[Live2D] 未找到 pixi 清屏色缓存，已启用逐帧重置兜底')
    return true
  }

  const original = gl.clearColor.bind(gl)
  gl.clearColor = (r, g, b, a) => {
    original(r, g, b, a)
    if (cache[0] !== r || cache[1] !== g || cache[2] !== b || cache[3] !== a) {
      cache[0] = r
      cache[1] = g
      cache[2] = b
      cache[3] = a
    }
  }
  return true
}

async function mount() {
  const seq = ++loadSeq
  teardown(false)
  setupResizeObserver()
  status.value = 'loading'
  errMsg.value = ''

  try {
    await ensureRuntime()
    if (seq !== loadSeq || disposed) return

    const { w, h } = hostSize()
    if (w <= 0 || h <= 0) throw new Error('容器尺寸为 0')

    const created = new ApplicationRef()
    await created.init({
      width: w,
      height: h,
      backgroundAlpha: 0, // 透明底：让页面背景透出来
      antialias: props.smooth,
      autoDensity: true, // 逻辑坐标 = CSS 像素，模型位置可以直接按像素算
      resolution: Math.min(window.devicePixelRatio || 1, 2), // 高分屏上限 2，防移动端显存爆
      preference: 'webgl', // Live2D 的自绘渲染器只认 WebGL，别让 pixi 去挑 WebGPU
      powerPreference: 'high-performance',
    })
    if (seq !== loadSeq || disposed) {
      try { created.destroy({ removeView: true }) } catch (e) { /* 忽略 */ }
      return
    }

    app = created
    // 白屏修复：让 pixi 的清屏色缓存与真实 GL 状态保持同步（详见函数注释）
    patchClearColorSync(app)
    app.canvas.classList.add('live2d-canvas')
    app.ticker.maxFPS = props.maxFps
    hostEl.value.appendChild(app.canvas)

    const loaded = await Live2DModelRef.from(toRuntimeUrl(props.src), {
      ticker: app.ticker, // 由 app 自己的 ticker 驱动 autoUpdate，方便统一暂停
      autoUpdate: true,
      // 关掉自动交互：canvas 不吃指针事件，避免挡住下层 UI。
      // v0.5.0 起 autoInteract 已废弃、拆成下面两个开关，别再传旧的那个（会打警告）
      autoHitTest: false,
      autoFocus: false,
      motionPreload: 'IDLE', // 只预载 Idle，其余动作按需加载，省首屏时间
    })
    if (seq !== loadSeq || disposed) {
      try { loaded.destroy({ children: true, texture: true, textureSource: true }) } catch (e) { /* 忽略 */ }
      return
    }

    model = loaded
    model.anchor.set(0, 0) // 以画布左上角为原点，位置换算最直观
    app.stage.addChild(model)

    // 等几帧：核心要跑完一次 update 才会写入动态可见性/不透明度标志，
    // 否则量出来的内容外框是空的（会退回整张画布，角色就偏小了）
    await waitTicks(3)
    if (seq !== loadSeq || disposed) return

    contentBox = measureContent()
    layout()
    handleResize() // 加载期间容器若已变过尺寸，这里补一次对齐
    status.value = 'ready'
    if (!props.active) app.ticker.stop()
    emit('ready', { contentBox })
  } catch (e) {
    if (seq !== loadSeq || disposed) return
    console.error('[Live2D] 加载失败', e)
    errMsg.value = '模型加载失败：' + (e && e.message ? e.message : e)
    teardown(false)
    status.value = 'error'
    emit('error', e)
  }
}

function teardown(clearStatus = true) {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (clearColorFallback) {
    try { if (app) app.ticker.remove(clearColorFallback) } catch (e) { /* 忽略 */ }
    clearColorFallback = null
  }
  try {
    if (model) {
      if (model.parent) model.parent.removeChild(model)
      // textureSource: true → 插件会走 Assets.unload，把 4096² 贴图（≈67MB）真正释放掉；
      // 少了这一步，来回切服装几次显存就爆了
      model.destroy({ children: true, texture: true, textureSource: true })
    }
  } catch (e) {
    console.warn('[Live2D] 释放模型失败', e)
  }
  model = null

  try {
    if (app) {
      const canvas = app.canvas
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true })
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
    }
  } catch (e) {
    console.warn('[Live2D] 释放渲染器失败', e)
  }
  app = null
  contentBox = null
  fitScale.value = 1
  stageSize.value = { w: 0, h: 0 }

  if (clearStatus) status.value = 'idle'
}

//  视线跟随：canvas 是 pointer-events:none 拿不到 pointermove，故挂在 window 上换算 [-1,1] 注视点。
// 不用 model.focus（收世界坐标、用整张画布归一化并压到单位圆，只剩方向没有比例响应），改为自己算
function onPointerMove(e) {
  if (!props.followPointer || !props.active || !model || !app) return
  const canvas = app.canvas
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const sw = app.screen.width
  const sh = app.screen.height
  // 指针 → 画布（世界）坐标：canvas 左上角即世界原点
  const wx = (e.clientX - rect.left) * (sw / rect.width)
  const wy = (e.clientY - rect.top) * (sh / rect.height)

  // 原点 = 视口中心
  const ox = sw / 2
  const oy = sh / 2

  // y 取反：focus 的 y 正值代表「往上看」，而屏幕坐标 y 向下为正
  const fx = (wx - ox) / (sw / 2)
  const fy = -(wy - oy) / (sh / 2)

  model.lookTo(fx, fy)
}

/** 播放指定动作组（Nod / Shake / Idle…），priority 3 = FORCE 覆盖当前动作 */
function playMotion(group, index = 0, priority = 3) {
  if (!model) return false
  const groups = model.internalModel?.motionManager?.motionGroups || {}
  if (!groups[group] || !groups[group].length) return false
  model.motion(group, index, priority)
  return true
}

watch(() => [props.scale, props.offsetX, props.offsetY], layout)

watch(() => props.maxFps, (v) => {
  if (app) app.ticker.maxFPS = v
})

watch(() => props.active, (on) => {
  if (!app) return
  if (on) {
    if (!app.ticker.started) app.ticker.start()
  } else {
    app.ticker.stop()
  }
})

watch(() => props.src, () => {
  if (!disposed) mount()
})

onMounted(() => {
  mount() // 内部会建 ResizeObserver
  window.addEventListener('pointermove', onPointerMove, { passive: true })
})

onBeforeUnmount(() => {
  disposed = true
  loadSeq++
  window.removeEventListener('pointermove', onPointerMove)
  teardown(false)
})

defineExpose({
  status,
  headScreenPos,
  playMotion,
  reload: () => mount(),
  getContentBox: () => contentBox,
})
</script>

<style scoped src="@/assets/styles/Live2DViewer.css"></style>
