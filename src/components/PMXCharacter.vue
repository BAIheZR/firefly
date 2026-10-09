<template>
  <div ref="containerRef" class="pmx-character">
    <div v-if="loading" class="pmx-loading">{{ loadingText }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount, shallowRef, nextTick } from 'vue'
import * as THREE from 'three'
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js'
import { TGALoader } from 'three/addons/loaders/TGALoader.js'
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js'
import { isMobileDevice } from '@/utils/device'
import { EMOTION_MORPHS, BLUSH_MORPH_INDEX, BLUSH_AFFECTION_THRESHOLD } from '@/config/emotion'

//  移动端渲染预算 
// 主线是 OutlineEffect（场景渲染两遍），90/120Hz 手机上 RAF 会按刷新率驱动，故移动端限帧
const FRAME_INTERVAL_MS = isMobileDevice ? 1000 / 30 : 0
let lastRenderAt = 0
let lastFrameAt = 0

// 返回 true 表示这一帧该跳过（移动端限帧用）。桌面端 FRAME_INTERVAL_MS=0，永不跳过。
function skipThisFrame(now) {
  if (!FRAME_INTERVAL_MS) return false
  if (now - lastRenderAt < FRAME_INTERVAL_MS - 1) return true
  lastRenderAt = now
  return false
}

// 真实帧间隔（秒），供弹簧/物理类更新使用；限帧后每帧间隔变长，
// 若仍按固定 1/60 推进，头发的摆动速度会与实际不符。首帧无基准时回落到 1/60。
function frameDelta(now) {
  const prev = lastFrameAt
  lastFrameAt = now
  if (!prev) return 1 / 60
  return Math.min((now - prev) / 1000, 0.1)
}

// 渲染器像素比：移动端高 DPR 屏（2~3x）按原值渲染等于成倍增加像素填充量，
// 而全屏 3D 模型本身对分辨率不敏感，1.4 / 1.5 是清晰度与开销的折中。
// 桌面端封顶 1.5（MSAA 已在），比 2 省约 44% 片元着色量，肉眼几乎无差别。
const MAX_PIXEL_RATIO = isMobileDevice ? 1.4 : 1.5

// 后续可扩展：通过 model prop 切换不同模型
const props = defineProps({
  model: { type: String, default: '猫耳流萤.pmx' },
  basePath: { type: String, default: '/models/1/' },
  // 是否激活（keep-alive 切到后台时暂停渲染，避免空转耗性能）
  active: { type: Boolean, default: true },
  // 是否启用眼球追踪（部分模型骨骼轴向不兼容，需关闭）
  eyeTracking: { type: Boolean, default: true },
  // 是否启用默认姿势（部分模型骨骼权重不兼容，强行旋转会穿模/凹陷）
  defaultPose: { type: Boolean, default: true },
  // 调整模式：允许拖动移动模型、滚轮缩放（由 Home 的「调整」按钮开启）
  adjustMode: { type: Boolean, default: false },
})
const emit = defineEmits(['transform-change', 'error'])

const containerRef = ref(null)
const loading = ref(true)
const loadingText = ref('加载中...')

const scene = shallowRef(null)
const camera = shallowRef(null)
const renderer = shallowRef(null)
const outlineEffect = shallowRef(null)
const currentModel = shallowRef(null)
let animationId = null
let resizeObserver = null

// 眼球追踪相关（硬编码默认值，无 UI）
const EYE_ROTATION_SCALE = 0.8
const HEAD_FOLLOW_SCALE = 0.5
const EYE_SMOOTHNESS = 0.1
const BLINK_FREQUENCY = 4
const IDLE_HEAD_MOVEMENT = true
// 模型头骨的「0 度」未必是「看向屏幕正前方」，可能因模型默认姿态/相机位置而偏头或低头。
//   LOOK_FWD_PITCH：上下（正值抬头 / 负值低头，依骨骼轴向而定）
//   LOOK_FWD_YAW  ：左右（正值转左 / 负值转右，依骨骼轴向而定）
const LOOK_FWD_PITCH = 0
const LOOK_FWD_YAW = 0

const leftEyeBone = shallowRef(null)
const rightEyeBone = shallowRef(null)
const headBone = shallowRef(null)

const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
const mouseWorldPoint = new THREE.Vector3(0, 15, 10)
const targetEyeRotL = new THREE.Euler(0, 0, 0)
const targetEyeRotR = new THREE.Euler(0, 0, 0)
const targetHeadRot = new THREE.Euler(0, 0, 0)
const currentEyeRotL = new THREE.Euler(0, 0, 0)
const currentEyeRotR = new THREE.Euler(0, 0, 0)
const currentHeadRot = new THREE.Euler(0, 0, 0)

let blinkTimer = null
let blinkProgress = 0
let isBlinking = false
let lastMouseMoveTime = Date.now()
let morphMesh = null
let lookForward = false // 进入聊天时看向正前方（取消面部跟随鼠标）

// 资源路径适配：打包后 file:// 下以 "/" 开头的路径会被当成磁盘根目录，统一转成相对页面基准的 URL
const toRuntimeUrl = (p) => {
  if (!p) return p
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return p // 已是完整 URL（http: / file: / data: / blob: …），原样返回
  return new URL(p.replace(/^\/+/, ''), document.baseURI).href
}

// 呼吸动画：模型整体微微上下浮动 + 纵向轻微缩放
let breathingTime = 0
const BREATHING_PERIOD = 4.0 // 一个呼吸周期 4 秒（吸 2s + 呼 2s）

// 模型大小/位置调整（调整模式：拖动移动、滚轮缩放；所有模型共享一份持久化）
// 缩放只走 3D mesh.scale —— 渲染器按窗口分辨率重绘，任意大小都清晰（CSS 拉伸 canvas 才会糊）
const transformKey = () => 'home_model_transform' // 所有模型共享同一份大小/位置/方向
const SCALE_MIN = 0.4
const SCALE_MAX = 2.5
const modelTransform = reactive({ scale: 1, x: 0, y: 0, ry: 0 }) // ry = 水平朝向角（绕Y，左右转），单位：度
// pivot 枢轴：把模型中心对齐到原点 → 进入即居中、旋转绕中心，避免转身时模型偏移/歪斜
let modelPivot = null
const modelCenter = new THREE.Vector3()
let modelSizeY = 0 // 模型包围盒高度，用于换算默认大特写的下移量
// 脚下接地阴影（径向渐变平面）。独立挂在 scene 下的 shadowGroup，只跟随 x/y/缩放/朝向，
// 与 modelPivot 解耦，逻辑清晰、也避免被模型变换牵连。
let contactShadow = null
let shadowGroup = null
let shadowFootY = 0      // 脚底相对模型中心的 y（≈ -size.y/2）
let shadowPlaneSize = 0  // 平面基准尺寸（model-local）

const clampScale = (s) => THREE.MathUtils.clamp(s, SCALE_MIN, SCALE_MAX)
const applyModelTransform = () => {
  if (!modelPivot) return
  modelPivot.scale.setScalar(modelTransform.scale)
  modelPivot.position.set(modelTransform.x, modelTransform.y, 0)
  modelPivot.rotation.y = (modelTransform.ry * Math.PI) / 180
  // 接地阴影跟随 x/y/缩放/朝向，独立于 modelPivot（逻辑清晰，也避免被模型变换牵连）
  if (contactShadow && shadowGroup) {
    shadowGroup.position.set(modelTransform.x, modelTransform.y + shadowFootY + 0.02, 0)
    shadowGroup.scale.setScalar(modelTransform.scale)
    shadowGroup.rotation.y = (modelTransform.ry * Math.PI) / 180
  }
}
const emitTransform = () => emit('transform-change', { ...modelTransform })
const setRy = (deg) => {
  modelTransform.ry = (((deg + 180) % 360) + 360) % 360 - 180 // 归一到 -180~180
  applyModelTransform()
  emitTransform()
}
const setScale = (s) => {
  modelTransform.scale = clampScale(s)
  applyModelTransform()
  emitTransform()
}
// 默认形象：大特写（脸部为主）。scale 取上限，y 按模型高度下移，让头/上半身进入画面中心。
// y 用了模型高度比例（而非固定值）→ 换模型也能大致对齐。
const DEFAULT_TRANSFORM_SCALE = 2.5
const DEFAULT_TRANSFORM_Y_FACTOR = -0.95 // y = 系数 × 模型高度（负值=下移）
const applyDefaultTransform = () => {
  modelTransform.scale = DEFAULT_TRANSFORM_SCALE
  modelTransform.x = 0
  modelTransform.y = modelSizeY * DEFAULT_TRANSFORM_Y_FACTOR
  modelTransform.ry = 0
}
const saveTransform = () => {
  localStorage.setItem(transformKey(), JSON.stringify({ scale: modelTransform.scale, x: modelTransform.x, y: modelTransform.y, ry: modelTransform.ry }))
}
const resetTransform = () => {
  applyDefaultTransform()
  applyModelTransform()
  saveTransform()
  emitTransform()
}
const loadSavedTransform = () => {
  let restored = false
  try {
    const saved = JSON.parse(localStorage.getItem(transformKey()) || 'null')
    if (saved) {
      modelTransform.scale = clampScale(saved.scale || 1)
      modelTransform.x = Number(saved.x) || 0
      modelTransform.y = Number(saved.y) || 0
      modelTransform.ry = Number(saved.ry) || 0
      restored = true
    }
  } catch (e) { /* 数据损坏则忽略 */ }
  if (!restored) applyDefaultTransform() // 首次/无存档 → 默认大特写
  applyModelTransform()
}

// 拖动移动：屏幕像素位移 → 模型所在深度的世界单位位移
let dragging = false // false | 'move' | 'rotate'
let dragStart = { px: 0, py: 0, x: 0, y: 0, ry: 0 }

//  双指捏合缩放（移动端没有滚轮） 
// 复用 pointer 事件自带 pointerId 来数手指；双指落下时必须立刻终止拖动，否则模型会抖
const activePointers = new Map() // pointerId -> { x, y }
let pinchStartDist = 0
let pinchStartScale = 1

function pointerDistance() {
  const pts = [...activePointers.values()]
  if (pts.length < 2) return 0
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
}

const onPointerDownAdjust = (e) => {
  if (!props.adjustMode) return
  if (e.target && e.target.closest && e.target.closest('.model-adjust-panel')) return
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  // 第二根手指落下 → 进入捏合模式，并放弃拖动
  if (activePointers.size >= 2) {
    dragging = false
    pinchStartDist = pointerDistance()
    pinchStartScale = modelTransform.scale
    return
  }
  if (e.button !== 0 && e.button !== 2) return
  dragging = e.button === 2 ? 'rotate' : 'move' // 左键拖动=移动，右键拖动=转向
  dragStart = { px: e.clientX, py: e.clientY, x: modelTransform.x, y: modelTransform.y, ry: modelTransform.ry }
}
const onContextMenuAdjust = (e) => {
  if (!props.adjustMode) return
  e.preventDefault() // 调整模式下右键用于转向，屏蔽默认菜单
}
const onPointerMoveAdjust = (e) => {
  if (!props.adjustMode) return
  // 先刷新轨迹：判断是否处于双指状态必须基于最新位置
  if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (activePointers.size >= 2) {
    const dist = pointerDistance()
    if (pinchStartDist > 0 && dist > 0) {
      // 始终以「捏合开始时的比例 × 当前距离比」计算，
      // 而不是逐帧累乘 —— 后者会随帧数漂移，松手时大小与手指动作对不上
      setScale(pinchStartScale * (dist / pinchStartDist))
    }
    return
  }
  if (!dragging || !camera.value || !currentModel.value || !containerRef.value) return
  if (dragging === 'rotate') {
    modelTransform.ry = dragStart.ry + (e.clientX - dragStart.px) * 0.5 // 右键水平拖：0.5°/px
  } else {
    const cam = camera.value
    const dist = Math.max(0.1, cam.position.z - (modelPivot ? modelPivot.position.z : 0))
    const worldPerPixel = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / containerRef.value.clientHeight
    modelTransform.x = dragStart.x + (e.clientX - dragStart.px) * worldPerPixel
    modelTransform.y = dragStart.y - (e.clientY - dragStart.py) * worldPerPixel
  }
  applyModelTransform()
  emitTransform()
}
const endDrag = (e) => {
  if (e && e.pointerId != null) activePointers.delete(e.pointerId)
  // 手指数低于两根即退出捏合。这里同时清掉 dragging：
  // 双指抬起一根后剩下的那根不应接着拖动，否则会从捏合中途「跳」一下
  if (activePointers.size < 2) {
    pinchStartDist = 0
    dragging = false
  }
}
const onWheelAdjust = (e) => {
  if (!props.adjustMode || !currentModel.value) return
  e.preventDefault()
  setScale(modelTransform.scale * (e.deltaY < 0 ? 1.05 : 0.95))
}
watch(() => props.adjustMode, (on) => {
  if (on) {
    window.addEventListener('pointerdown', onPointerDownAdjust)
    window.addEventListener('pointermove', onPointerMoveAdjust)
    window.addEventListener('pointerup', endDrag)
    // 触摸被系统打断（来电、手势导航）时不会有 pointerup，必须靠 pointercancel 收尾，
    // 否则 activePointers 会残留，下次进入调整模式直接是「双指」状态
    window.addEventListener('pointercancel', endDrag)
    window.addEventListener('wheel', onWheelAdjust, { passive: false })
    window.addEventListener('contextmenu', onContextMenuAdjust)
  } else {
    window.removeEventListener('pointerdown', onPointerDownAdjust)
    window.removeEventListener('pointermove', onPointerMoveAdjust)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
    window.removeEventListener('wheel', onWheelAdjust)
    window.removeEventListener('contextmenu', onContextMenuAdjust)
    activePointers.clear()
    pinchStartDist = 0
    dragging = false
  }
})

// 昼夜光照相关
let ambientLight = null
let hemiLight = null
let sunLight = null
let bulbLight = null
let fillLight = null
let lightTimer = null

// 根据当前时间应用昼夜光照：白天 6:00~18:00 用太阳，夜晚用灯泡
const applyDayNightLighting = () => {
  const h = new Date().getHours()
  const isDay = h >= 6 && h < 18
  if (isDay) {
    // 白天：太阳
    if (sunLight) sunLight.intensity = 1.0
    if (sunLight) sunLight.position.set(6, 20, 8)
    if (bulbLight) bulbLight.intensity = 0
    // 环境/半球光占比下调，交给主光+补光制造明暗对比，动漫描边与体积感更明显，避免被平光洗白
    if (ambientLight) ambientLight.intensity = 0.55
    if (hemiLight) {
      hemiLight.intensity = 0.6
      hemiLight.color.setHex(0xfff4e0)
      hemiLight.groundColor.setHex(0x8899bb)
    }
    if (fillLight) fillLight.intensity = 0.55
    if (renderer.value) renderer.value.toneMappingExposure = 1.2
  } else {
    // 夜晚：灯泡（暖黄点光源从头顶照下）
    if (sunLight) sunLight.intensity = 0.25
    if (bulbLight) bulbLight.intensity = 1.6
    if (bulbLight) bulbLight.position.set(0, 24, 3)
    if (ambientLight) ambientLight.intensity = 0.42
    if (hemiLight) {
      hemiLight.intensity = 0.45
      hemiLight.color.setHex(0x5a6a8a)
      hemiLight.groundColor.setHex(0x2a2030)
    }
    if (fillLight) fillLight.intensity = 0.35
    if (renderer.value) renderer.value.toneMappingExposure = 1.15
  }
}

const lerp = (a, b, t) => a + (b - a) * t

const initScene = () => {
  const container = containerRef.value
  if (!container) return
  const width = container.clientWidth
  const height = container.clientHeight
  if (width === 0 || height === 0) return

  scene.value = new THREE.Scene()
  // 透明背景，透出 Home 的渐变背景

  camera.value = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
  camera.value.position.set(0, 12, 25)

  // antialias（MSAA）在移动 GPU 上开销明显，而本例已有 OutlineEffect 描边弱化锯齿，
  // 移动端关掉换取帧率；桌面端保持开启
  // ★ WebGL context 创建**可能失败**：反复挂载把 context 用光、显卡/驱动不支持、被浏览器回收……
  //   new WebGLRenderer() 这时会直接抛错，整个初始化就崩在这里，首页一片空白。
  //   兜住并通知外层回退到 2D 立绘（思路跟 Live2DViewer 的 onLive2DError 一致）（2026-10-06）
  try {
    renderer.value = new THREE.WebGLRenderer({
      antialias: !isMobileDevice,
      alpha: true,
      powerPreference: 'high-performance' // 双显卡笔记本优先用独显跑 3D
    })
  } catch (e) {
    console.warn('[PMX] WebGL context 创建失败，回退到 2D 立绘：', e)
    emit('error', e)
    return
  }
  renderer.value.setSize(width, height)
  renderer.value.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  renderer.value.shadowMap.enabled = false
  renderer.value.outputColorSpace = THREE.SRGBColorSpace
  renderer.value.toneMapping = THREE.ACESFilmicToneMapping
  // 与白天档保持一致，避免理论上首帧旧值闪烁（applyDayNightLighting 会立即覆盖）
  renderer.value.toneMappingExposure = 1.2
  renderer.value.setClearColor(0x000000, 0) // 透明

  // 描边效果（MMD 动漫风格，读取 PMX 内置描边宽度）
  outlineEffect.value = new OutlineEffect(renderer.value, {
    defaultThickness: 0.012,
    defaultColor: new THREE.Color(0x1a1a1a),
    defaultAlpha: 0.9,
  })
  outlineEffect.value.setSize(width, height)
  outlineEffect.value.domElement.style.pointerEvents = 'none'
  container.appendChild(outlineEffect.value.domElement)

  // 光照系统（昼夜自动切换）。初始值即「白天」默认，applyDayNightLighting 会在毫秒级内
  // 按当前时间覆盖；这里写明是为了：① 与白天档保持一致，避免日后若延迟调用出现一帧旧值闪烁；
  // ② 让后来者读代码时不被「0.45/0.7/0.4 这些初始值到底用不用」困惑。
  ambientLight = new THREE.AmbientLight(0xffffff, 0.55)
  scene.value.add(ambientLight)

  hemiLight = new THREE.HemisphereLight(0xfff4e0, 0x8899bb, 0.6)
  hemiLight.position.set(0, 20, 0)
  scene.value.add(hemiLight)

  // 主光：白天=太阳（方向光），夜晚=灯泡（点光源）
  sunLight = new THREE.DirectionalLight(0xffffff, 1.0)
  sunLight.position.set(6, 20, 8)
  scene.value.add(sunLight)

  bulbLight = new THREE.PointLight(0xffd9a0, 0, 50, 1.5)
  bulbLight.position.set(0, 22, 4)
  scene.value.add(bulbLight)

  // 补光：从正面打一盏柔光，让脸部更亮（环境/半球光占比已下调，明暗对比更明显）
  fillLight = new THREE.DirectionalLight(0xffffff, 0.55)
  fillLight.position.set(0, 8, 18)
  scene.value.add(fillLight)

  applyDayNightLighting()
  // 每 60 秒检查一次时间，自动切换昼夜
  lightTimer = setInterval(applyDayNightLighting, 60000)

  // 动画循环（仅 active 时运行，避免后台空转）
  const animate = (now = performance.now()) => {
    if (!props.active) {
      animationId = null
      return
    }
    animationId = requestAnimationFrame(animate)
    // 移动端限帧：跳过本帧时连物理推进一起跳过，否则 30fps 下动作会加速
    if (skipThisFrame(now)) return
    const dt = frameDelta(now)
    updateEyeTracking()
    updateBlink()
    updateMorphTransition(dt)
    forceCloseMouth()
    updateIdleHeadMovement(dt)
    updateBreathing(dt)
    updateHairSpring(dt)
    if (outlineEffect.value && scene.value && camera.value) {
      outlineEffect.value.render(scene.value, camera.value)
    }
  }
  animate()

  startBlinkLoop()
}

// active 变化：激活时恢复渲染循环+鼠标监听，失活时暂停
watch(
  () => props.active,
  (active) => {
    if (active) {
      window.addEventListener('mousemove', onMouseMove)
      if (!animationId) {
        // 重启渲染循环
        const animate = (now = performance.now()) => {
          if (!props.active) { animationId = null; return }
          animationId = requestAnimationFrame(animate)
          if (skipThisFrame(now)) return
          const dt = frameDelta(now)
          updateEyeTracking()
          updateBlink()
          updateMorphTransition(dt)
          forceCloseMouth()
          updateIdleHeadMovement(dt)
          updateBreathing(dt)
          updateHairSpring(dt)
          if (outlineEffect.value && scene.value && camera.value) {
            outlineEffect.value.render(scene.value, camera.value)
          } else if (renderer.value && scene.value && camera.value) {
            renderer.value.render(scene.value, camera.value)
          }
        }
        animate()
      }
    } else {
      window.removeEventListener('mousemove', onMouseMove)
      if (animationId) {
        cancelAnimationFrame(animationId)
        animationId = null
      }
    }
  }
)

// 修复 TGA 贴图：浏览器原生不支持 tga 解码，用 TGALoader 重新加载替换
const fixTgaTextures = (mesh) => {
  const tgaLoader = new TGALoader()

  mesh.traverse((child) => {
    if (!child.isMesh) return
    const mat = child.material
    if (!mat) return
    const materials = Array.isArray(mat) ? mat : [mat]
    materials.forEach((m) => {
      const tgaProps = ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap']
      tgaProps.forEach((prop) => {
        const tex = m[prop]
        if (!tex) return
        // 取贴图 URL（MMDLoader 已经拼好 basePath 并做过中文编码）
        const url = tex.image?.src || tex.url || tex.source?.data?.src || ''
        if (!url || !/\.tga(\?|$)/i.test(url)) return
        try {
          const loaded = tgaLoader.load(url)
          loaded.colorSpace = THREE.SRGBColorSpace
          m[prop] = loaded
          m.needsUpdate = true
          console.log('TGA 贴图已修复:', url)
        } catch (e) {
          console.warn('TGA 贴图修复失败:', url, e)
        }
      })
    })
  })
}

// 脚下接地阴影：透明背景下角色容易「飘」，用一张径向渐变贴图的平面模拟接触阴影，
// 给人物落地感。不依赖 shadowMap（省开销、不污染透明背景），也不随光照变化，属风格化补强。
// footY = 脚底相对模型中心的 y（模型已居中，≈ -size.y/2）；footprint = 模型水平占地最大边长。
const createContactShadow = (footY, footprint) => {
  if (contactShadow || !scene.value) return
  shadowFootY = footY
  shadowPlaneSize = footprint * 2.4 // 比占地略大，渐变自然收边
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(0,0,0,0.40)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.18)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const geo = new THREE.PlaneGeometry(1, 1)
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false, // 阴影不受 ACES 色调映射影响，保持稳定的暗度
  })
  // 关掉该材质的描边（OutlineEffect 会给平面画一圈黑边，没必要）
  mat.userData.outlineParameters = { visible: false }
  contactShadow = new THREE.Mesh(geo, mat)
  contactShadow.rotation.x = -Math.PI / 2 // 平铺在地面（XZ 平面）
  contactShadow.scale.set(shadowPlaneSize, shadowPlaneSize, 1)
  // 独立 group 挂到 scene：只跟随 x/y/缩放/朝向（在 applyModelTransform 里摆），与 modelPivot 解耦
  shadowGroup = new THREE.Group()
  shadowGroup.add(contactShadow)
  scene.value.add(shadowGroup)
  applyModelTransform() // 立即按当前变换把阴影摆到位
}

const disposeContactShadow = () => {
  if (shadowGroup && scene.value) scene.value.remove(shadowGroup)
  if (contactShadow) {
    contactShadow.traverse((c) => {
      if (c.isMesh) {
        c.geometry?.dispose()
        if (c.material) {
          if (c.material.map) c.material.map.dispose()
          c.material.dispose()
        }
      }
    })
  }
  contactShadow = null
  shadowGroup = null
}

const loadPMXModel = () => {
  // 防御：scene 没建起来就什么都别做。正常路径由 boot() 保证「尺寸就绪」后才会走到这里，
  // 但万一将来有人直接调它，不该再抛 TypeError 把整个组件带崩（2026-10-06）
  if (!scene.value) {
    console.warn('[PMX] scene 未初始化，跳过模型加载')
    loadingText.value = '模型加载失败'
    emit('error', new Error('scene 未初始化'))
    return
  }
  loading.value = true
  loadingText.value = '加载模型中...'

  const manager = new THREE.LoadingManager()
  manager.onError = (url) => console.warn('纹理加载失败:', url)
  manager.setURLModifier((url) => {
    if (url && /[\u4e00-\u9fa5]/.test(url)) {
      return url.split('/').map((seg) => {
        return seg && /[\u4e00-\u9fa5]/.test(seg) ? encodeURIComponent(seg) : seg
      }).join('/')
    }
    return url
  })

  const loader = new MMDLoader(manager)
  loader.setPath(toRuntimeUrl(props.basePath))

  loader.load(
    props.model,
    (mesh) => {
      mesh.position.set(0, 0, 0)
      // pivot 包裹模型：后续把模型中心搬到 pivot 原点，实现居中 + 绕中心旋转
      modelPivot = new THREE.Group()
      modelPivot.add(mesh)
      scene.value.add(modelPivot)
      currentModel.value = mesh

      // 修复 TGA 贴图：浏览器原生不支持 tga，用 TGALoader 重载替换
      fixTgaTextures(mesh)

      // 材质优化（精简：只保留必要项）
      const maxAnisotropy = renderer.value.capabilities.getMaxAnisotropy()
      mesh.traverse((child) => {
        if (child.isMesh) {
          const mat = child.material
          if (!mat) return
          const materials = Array.isArray(mat) ? mat : [mat]
          materials.forEach((m) => {
            if (m.map) {
              m.map.anisotropy = maxAnisotropy
              m.map.colorSpace = THREE.SRGBColorSpace
            }
            if (m.emissive) {
              const eb = m.emissive.r + m.emissive.g + m.emissive.b
              if (eb > 0.1) m.emissive.multiplyScalar(0.3)
              m.emissiveIntensity = 0.15
            }
            if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.5)
            if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.3)
            if (m.envMapIntensity !== undefined) m.envMapIntensity = 0.5
            m.needsUpdate = true
          })
        }
      })

      findBones(mesh)
      findMorphMesh(mesh)
      setupHairSpring(mesh)

      // 自适应相机：算出包围盒，把模型中心搬到 pivot 原点，相机正对原点 → 进入即居中
      const box = new THREE.Box3().setFromObject(mesh)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      modelCenter.copy(center)
      modelSizeY = size.y // 供默认大特写换算 y 偏移
      const maxDim = Math.max(size.x, size.y, size.z)
      const fov = camera.value.fov * (Math.PI / 180)
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))
      cameraZ *= 1.1 // 略收紧留白，让角色更「占画面」，又不至于裁到四肢
      mesh.position.set(-center.x, -center.y, -center.z) // 模型中心对齐 pivot 原点
      camera.value.position.set(0, 0, cameraZ)
      camera.value.lookAt(0, 0, 0)
      // 脚下接地阴影：脚底 ≈ -size.y/2，水平占地取 x/z 较大边
      createContactShadow(-size.y / 2, Math.max(size.x, size.z))
      // 应用用户保存的大小/位置/朝向调整（作用于 pivot）
      loadSavedTransform()

      loading.value = false
    },
    (xhr) => {
      if (xhr.lengthComputable) {
        loadingText.value = `加载中... ${(xhr.loaded / xhr.total * 100).toFixed(0)}%`
      }
    },
    (error) => {
      console.error('PMX模型加载失败:', error)
      loadingText.value = '模型加载失败'
      // ★ 同样要通知外层回退到 2D 立绘。以前这里只改了一句文案，
      //   于是首页就一直卡在「模型加载失败」，不会走到立绘兜底（2026-10-06 补）
      emit('error', error)
    }
  )
}

// 手臂骨骼引用（用于姿势调整）
const bones = {
  leftShoulder: null, rightShoulder: null,
  leftArm: null, rightArm: null,
  leftElbow: null, rightElbow: null,
  leftWrist: null, rightWrist: null,
  // 呼吸相关骨骼
  upperBody: null, // 上半身（优先用这个做呼吸缩放）
  chest: null,     // 胸部
  abdomen: null,   // 腹部
}

const findBones = (model) => {
  leftEyeBone.value = null
  rightEyeBone.value = null
  headBone.value = null
  // 重置手臂骨骼
  Object.keys(bones).forEach(k => bones[k] = null)

  // 调试：收集所有含「目」的骨骼名，方便排查不同模型的眼球骨骼命名
  const eyeBoneNames = []

  model.traverse((child) => {
    if (child.isSkinnedMesh && child.skeleton) {
      child.skeleton.bones.forEach((bone) => {
        const name = bone.name
        const low = name.toLowerCase()
        // 眼球（排除睫毛/眉毛/辅助骨）
        if ((name.includes('目') || low.includes('eye')) && !name.includes('まつ毛') && !name.includes('眉') && !low.includes('lash') && !low.includes('brow')) {
          eyeBoneNames.push(name)
          if (low.includes('l') || name.includes('左') || low.includes('left')) leftEyeBone.value = bone
          else if (low.includes('r') || name.includes('右') || low.includes('right')) rightEyeBone.value = bone
        }
        // 头
        if ((name.includes('頭') || low === 'head') && !name.includes('先') && !name.includes('親')) {
          headBone.value = bone
        }
        // 左肩 / 右肩
        if (name.includes('左肩') || low === 'lshoulder' || low === 'l_shoulder') bones.leftShoulder = bone
        if (name.includes('右肩') || low === 'rshoulder' || low === 'r_shoulder') bones.rightShoulder = bone
        // 左上腕 / 右上腕（左腕/右腕）
        if ((name.includes('左腕') || low === 'larm' || low === 'l_arm') && !name.includes('左ひじ') && !name.includes('左手首')) bones.leftArm = bone
        if ((name.includes('右腕') || low === 'rarm' || low === 'r_arm') && !name.includes('右ひじ') && !name.includes('右手首')) bones.rightArm = bone
        // 左肘 / 右肘
        if (name.includes('左ひじ') || low.includes('lelbow') || low.includes('l_elbow')) bones.leftElbow = bone
        if (name.includes('右ひじ') || low.includes('relbow') || low.includes('r_elbow')) bones.rightElbow = bone
        // 左手首 / 右手首
        if (name.includes('左手首') || low.includes('lwrist') || low.includes('l_wrist')) bones.leftWrist = bone
        if (name.includes('右手首') || low.includes('rwrist') || low.includes('r_wrist')) bones.rightWrist = bone
        // 上半身 / 胸 / 腹（呼吸用）
        if (name.includes('上半身') && !name.includes('2') && !bones.upperBody) bones.upperBody = bone
        if (name.includes('上半身2') && !bones.upperBody) bones.upperBody = bone
        if ((name.includes('胸') || low === 'chest') && !bones.chest) bones.chest = bone
        if ((name.includes('腹') || low === 'abdomen') && !bones.abdomen) bones.abdomen = bone
      })
    }
  })

  console.log(`[PMX] ${props.model} 眼球相关骨骼:`, eyeBoneNames, '左眼:', leftEyeBone.value?.name, '右眼:', rightEyeBone.value?.name, '头:', headBone.value?.name, '上半身:', bones.upperBody?.name, '胸:', bones.chest?.name, '腹:', bones.abdomen?.name)
}

const findMorphMesh = (model) => {
  morphMesh = null
  model.traverse((child) => {
    if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences && !morphMesh) {
      morphMesh = child
    }
  })
}

//  发饰弹簧物理（伪物理：头部旋转惯性滞后 + 弹簧回归 + 微风噪声）
const HAIR_SPRING_PROFILES = {
  // 飘带：柔软、惯性大、摆动幅度大（春日手信 髮帶）
  band: { response: 1.05, stiffness: 0.055, damping: 0.90, maxAngle: 0.55, wind: 0.022 },
  // 花瓣翼：硬挺、惯性小、幅度小（春日手信 髪翼飾）
  wing: { response: 0.50, stiffness: 0.120, damping: 0.86, maxAngle: 0.18, wind: 0.007 },
  // 蝴蝶结：几乎不晃，只带一点微动（春日手信 髮飾結）
  knot: { response: 0.28, stiffness: 0.160, damping: 0.85, maxAngle: 0.08, wind: 0.003 },
  // 发饰小挂件：短促轻晃（猫耳流萤 ButterflyDL 蝴蝶饰）
  charm: { response: 0.45, stiffness: 0.100, damping: 0.85, maxAngle: 0.15, wind: 0.006 },
  // 猫耳：硬挺、回正快，只有耳尖轻微弹跳（像猫耳抽动，不是软塌狗耳）
  ear: { response: 0.75, stiffness: 0.130, damping: 0.85, maxAngle: 0.18, wind: 0.006 },
  // 刘海/前发：贴脸，摆动空间小，几乎不晃只有极轻颤动（幅度大了会穿脸）
  bang: { response: 0.40, stiffness: 0.150, damping: 0.82, maxAngle: 0.09, wind: 0.003 },
  // 侧发：中等摆幅，转头时轻微拖尾
  side: { response: 0.70, stiffness: 0.085, damping: 0.86, maxAngle: 0.20, wind: 0.006 },
  // 后发/马尾：柔软大摆幅、滞后甩出慢回弹，风噪主要给这里（长发鞭梢效应）
  tail: { response: 0.60, stiffness: 0.060, damping: 0.88, maxAngle: 0.20, wind: 0.003 },
  // 猫耳流萤 服装（有真实骨骼链）；gate 阈值挡住呼吸/眨眼等微动画，人物静止时绝不飘
  // 肩带（背后两条）：无风噪，静止时纹丝不动，只有身体大幅转动/移动才滞后摆动
  sash: { response: 0.90, stiffness: 0.070, damping: 0.88, maxAngle: 0.35, wind: 0, gate: 0.015, posSens: 0.10, posGate: 0.01 },
  // 铃铛：硬挺快回正，转身时有「叮当」小弹跳；静止时同样不动
  bell: { response: 0.80, stiffness: 0.110, damping: 0.85, maxAngle: 0.25, wind: 0, gate: 0.006, posSens: 0.08, posGate: 0.008 },
  // 裙摆：柔软大摆幅，静止时只保留极轻微的微风感（wind 很小，不干扰）
  skirt: { response: 0.35, stiffness: 0.090, damping: 0.88, maxAngle: 0.02, maxAngleX: 0.05, wind: 0.001, gate: 0.003, posSens: 0.06, posGate: 0.006 },
  // —— 春日手信 胸前蝴蝶结（胸結/領結/左胸結/右胸結/胸結帶）——
  chestBow: { response: 0.55, stiffness: 0.100, damping: 0.87, maxAngle: 0.18, wind: 0, gate: 0.006, posSens: 0.07, posGate: 0.008 },
}

const hairSpring = {
  chains: [],
  windTime: 0,
  hasClothing: false,
}
// 服装链位移冲击的基准（模型根上一帧位置，跨链共享）
const clothShift = { prev: new THREE.Vector3(), init: false }
// 复用临时对象，避免每帧分配
const _sqA = new THREE.Quaternion()
const _sqB = new THREE.Quaternion()
const _sqC = new THREE.Quaternion()
const _sqD = new THREE.Quaternion()
const _sqE = new THREE.Quaternion()
const _svAxis = new THREE.Vector3()
const _svRootPos = new THREE.Vector3()
const _svRootDelta = new THREE.Vector3()
const _svClothAxis = new THREE.Vector3()

const setupHairSpring = (model) => {
  hairSpring.chains = []
  const found = []
  model.traverse((child) => {
    if (!child.isSkinnedMesh || !child.skeleton) return
    child.skeleton.bones.forEach((bone) => {
      const n = bone.name
      let kind = null
      if (n.startsWith('髮帶')) kind = 'band'
      else if (n.startsWith('髪翼飾')) kind = 'wing'
      else if (n.startsWith('髮飾結')) kind = 'knot'
      else if (n.startsWith('ButterflyDL')) kind = 'charm'
      else if (n.startsWith('右耳') || n.startsWith('左耳')) kind = 'ear'
      // 猫耳流萤 服装链（已核实骨骼名）
      else if (/^(yjd__|zjd_)/.test(n)) kind = 'sash'
      else if (n.startsWith('CoatM_a_')) kind = 'bell'  
      else if (/^wt_/.test(n)) kind = 'skirt' 
      // 春日手信 服装链
      else if (/^(胸結|領結|左胸結|右胸結|左胸結帶|右胸結帶)/.test(n)) kind = 'chestBow'
      else if (/^裙_/.test(n)) kind = 'skirt'
      // 头发三档（猫耳流萤：HairFM刘海+HairR/L侧发；春日手信：中劉海+側髪+後髪/馬尾）
      else if (n.includes('劉海') || n.includes('刘海') || n.includes('前髪') || n.includes('前发') || n.startsWith('HairFM')) kind = 'bang'
      else if (n.includes('側髪') || n.includes('侧髪') || n.includes('側发') || n.includes('侧发') || n.startsWith('HairR') || n.startsWith('HairL')) kind = 'side'
      else if (n.includes('馬尾') || n.includes('马尾') || n.includes('後髪') || n.includes('后髪') || /^(hf_|yhb_|zhb_)/.test(n)) kind = 'tail'
      if (kind) found.push({ bone, kind })
    })
  })
  if (!found.length) {
    console.log('[PMX] 当前模型无发饰链骨骼，发饰弹簧物理跳过')
    hairSpring.hasClothing = false
    return
  }
  // 去重（同一 skeleton 可能被多个 mesh 遍历到）
  const uniq = new Map()
  found.forEach((f) => { if (!uniq.has(f.bone.uuid)) uniq.set(f.bone.uuid, f) })
  const all = [...uniq.values()]
  const boneSet = new Set(all.map((f) => f.bone))

  // 构建 父→子 映射（用于发现分叉；同级骨骼各自成链，避免被 find 跳过）
  const childrenMap = new Map()
  all.forEach((f) => {
    const p = f.bone.parent
    if (!childrenMap.has(p)) childrenMap.set(p, [])
    childrenMap.get(p).push(f.bone)
  })

  const processed = new Set()
  const pushSeg = (bone, depth, phase) => {
    const item = all.find((x) => x.bone === bone)
    bone.updateWorldMatrix(true, false)
    const seg = {
      bone,
      kind: item.kind,
      depth,
      baseX: bone.rotation.x,
      baseY: bone.rotation.y,
      baseZ: bone.rotation.z,
      a: new THREE.Vector3(0, 0, 0),
      v: new THREE.Vector3(0, 0, 0),
      phase,
      parentBone: bone.parent,
      prevParentQ: new THREE.Quaternion(),
      init: false,
    }
    bone.parent.getWorldQuaternion(seg.prevParentQ)
    return seg
  }
  // 从某根骨开始构建链：单子则串联，多子则在此处分叉、各子独立成链
  const buildChain = (startBone, startDepth, startPhase) => {
    const chain = []
    let cur = startBone
    let depth = startDepth
    let phase = startPhase
    while (cur && !processed.has(cur) && boneSet.has(cur)) {
      processed.add(cur)
      chain.push(pushSeg(cur, depth, phase))
      const children = (childrenMap.get(cur) || []).filter((c) => !processed.has(c))
      if (children.length === 0) break
      if (children.length === 1) {
        cur = children[0]
        depth++
        phase += 0.55
      } else {
        // 分叉：当前链在此结束，每个子骨各自开启一条新链
        children.forEach((cb, i) => buildChain(cb, depth + 1, phase + 0.55 * (i + 1)))
        break
      }
    }
    if (chain.length) hairSpring.chains.push(chain)
  }

  // 链头 = 父骨骼不在发饰集合内（直接挂在「髮飾」「上半身」「下半身」等根骨下）
  all.filter((f) => !boneSet.has(f.bone.parent)).forEach((f, i) => {
    buildChain(f.bone, 0, Math.random() * Math.PI * 2 + i * 0.3)
  })
  const total = hairSpring.chains.reduce((s, c) => s + c.length, 0)
  // 服装链标记 + 分类计数日志（便于核对肩带/铃铛/裙摆骨骼是否全部识别）
  hairSpring.hasClothing = all.some((f) => HAIR_SPRING_PROFILES[f.kind].posSens)
  clothShift.init = false // 新模型加载，位移基准重置
  const kindCounts = {}
  all.forEach((f) => { kindCounts[f.kind] = (kindCounts[f.kind] || 0) + 1 })
  console.log(`[PMX] 弹簧物理已启用：${hairSpring.chains.length} 条链 / ${total} 根骨骼`, JSON.stringify(kindCounts))
}

const updateHairSpring = (dt) => {
  if (!hairSpring.chains.length) return
  hairSpring.windTime += dt
  const t = hairSpring.windTime

  // 服装链用：本帧模型根的水平位移（调整模式拖动移动模型时产生惯性冲击；静止时恒为 0）
  let shiftLen = 0
  let shiftX = 0
  let shiftZ = 0
  if (hairSpring.hasClothing && currentModel.value) {
    currentModel.value.getWorldPosition(_svRootPos)
    if (clothShift.init) {
      _svRootDelta.subVectors(_svRootPos, clothShift.prev)
      shiftLen = Math.hypot(_svRootDelta.x, _svRootDelta.z)
      shiftX = _svRootDelta.x
      shiftZ = _svRootDelta.z
    }
    clothShift.prev.copy(_svRootPos)
    clothShift.init = true
  }

  for (const chain of hairSpring.chains) {
    for (const seg of chain) {
      const p = HAIR_SPRING_PROFILES[seg.kind]
      // 越往链梢越软：刚度递减、惯性略增
      const depthK = 1 + seg.depth * 0.25
      const stiffness = p.stiffness / depthK
      const response = p.response * (1 + seg.depth * 0.12)

      // 1) 父骨骼本帧的世界旋转增量（头转动 / 上一节链骨摆动都会传下来）
      seg.parentBone.getWorldQuaternion(_sqA) // parentQ（世界）
      seg.bone.getWorldQuaternion(_sqB)       // boneQ（世界）

      if (seg.init) {
        // dParent = parentQ * prevParentQ⁻¹（父骨这帧转了多少）
        _sqC.copy(seg.prevParentQ).invert()
        _sqD.copy(_sqA).multiply(_sqC)
        _sqD.invert()
        _sqC.copy(_sqB).invert().multiply(_sqD).multiply(_sqB)
        const cosHalf = THREE.MathUtils.clamp(_sqC.w, -1, 1)
        const angle = 2 * Math.acos(cosHalf)
        // gate 阈值：呼吸/微动画的每帧增量（约 0.0002 rad）低于阈值不产生冲击，
        // 人物静止时肩带/铃铛因此保持纹丝不动
        if (angle > (p.gate || 0)) {
          const sinHalf = Math.sqrt(Math.max(1e-8, 1 - cosHalf * cosHalf))
          _svAxis.set(_sqC.x / sinHalf, _sqC.y / sinHalf, _sqC.z / sinHalf)
          seg.v.addScaledVector(_svAxis, angle * response)
        }

        // 2) 模型整体位移冲击（仅服装链 posSens>0）：挂件因惯性朝位移反方向甩
        if (p.posSens && shiftLen > p.posGate) {
          // 滞后旋转轴 = cross(竖直方向, 位移方向) = (dz, 0, -dx)，转到本骨局部空间
          _svClothAxis.set(shiftZ / shiftLen, 0, -shiftX / shiftLen)
          _sqE.copy(_sqB).invert()
          _svClothAxis.applyQuaternion(_sqE)
          seg.v.addScaledVector(_svClothAxis, Math.min(shiftLen * p.posSens, 0.4))
        }
      } else {
        seg.init = true // 首帧只记录基准，不产生冲击（避免模型加载/朝向跳变甩动）
      }
      seg.prevParentQ.copy(_sqA)

      // 3) 弹簧回归 + 阻尼
      seg.v.x = (seg.v.x - seg.a.x * stiffness) * p.damping
      seg.v.y = (seg.v.y - seg.a.y * stiffness * 1.5) * p.damping // 扭转回正稍快
      seg.v.z = (seg.v.z - seg.a.z * stiffness) * p.damping
      seg.a.add(seg.v)
      if (seg.a.length() > p.maxAngle) seg.a.setLength(p.maxAngle)
      // 前后方向（X轴）单独限幅：裙摆上翻最易走光，此方向限制更严
      if (p.maxAngleX !== undefined && Math.abs(seg.a.x) > p.maxAngleX) {
        seg.a.x = Math.sign(seg.a.x) * p.maxAngleX
        seg.v.x *= 0.4 // 刹停该方向速度，避免反复撞击限幅
      }

      // 4) 微风噪声（双频正弦叠加避免机械往返；沿链相位滞后、幅度随深度增大）
      const windAmp = p.wind * (1 + seg.depth * 0.5)
      const wx = (Math.sin(t * 0.9 + seg.phase) * 0.6 + Math.sin(t * 0.37 + seg.phase * 1.7) * 0.4) * windAmp
      const wz = (Math.sin(t * 0.7 + seg.phase * 2.3) * 0.6 + Math.sin(t * 0.29 + seg.phase) * 0.4) * windAmp

      seg.bone.rotation.set(
        seg.baseX + seg.a.x + wx,
        seg.baseY + seg.a.y,
        seg.baseZ + seg.a.z + wz
      )
    }
  }
}

// 眼球追踪（window 级鼠标移动，canvas 设了 pointer-events:none 不影响）
const onMouseMove = (event) => {
  lastMouseMoveTime = Date.now()
  if (!renderer.value || !camera.value || !currentModel.value) return
  const rect = renderer.value.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera.value)
  // 用头部骨骼真实世界坐标作为射线平面高度，避免模型大小导致的偏差
  const headWorldPos = new THREE.Vector3()
  if (headBone.value) {
    headBone.value.getWorldPosition(headWorldPos)
  } else {
    headWorldPos.set(0, 14, 0)
  }
  const planeNormal = new THREE.Vector3()
  camera.value.getWorldDirection(planeNormal)
  planeNormal.negate()
  const eyePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, headWorldPos)
  const intersectPoint = new THREE.Vector3()
  if (raycaster.ray.intersectPlane(eyePlane, intersectPoint)) {
    mouseWorldPoint.copy(intersectPoint)
  }
}

const updateEyeTracking = () => {
  if (!currentModel.value) return
  if (!leftEyeBone.value && !rightEyeBone.value && !headBone.value) return

  // 看向正前方（聊天时）：目标角度回正 + 手动偏移，眼睛/头部平滑看向屏幕正前方
  if (lookForward) {
    targetEyeRotL.set(-LOOK_FWD_PITCH, LOOK_FWD_YAW, 0)
    targetEyeRotR.set(-LOOK_FWD_PITCH, LOOK_FWD_YAW, 0)
    targetHeadRot.set(-LOOK_FWD_PITCH * HEAD_FOLLOW_SCALE, LOOK_FWD_YAW * HEAD_FOLLOW_SCALE, 0)
  } else {
    // 用头部骨骼真实世界坐标，避免模型大小/位置导致方向计算偏差
    const headPos = new THREE.Vector3()
    if (headBone.value) {
      headBone.value.getWorldPosition(headPos)
    } else {
      headPos.set(0, 14, 0)
    }
    const direction = new THREE.Vector3().subVectors(mouseWorldPoint, headPos)
    direction.normalize()

    // 增大上下旋转范围，确保眼球上下看明显可见
    const maxYaw = 0.9 * EYE_ROTATION_SCALE
    const maxPitch = 0.8 * EYE_ROTATION_SCALE
    const yaw = Math.atan2(direction.x, direction.z)
    const pitch = Math.atan2(direction.y, Math.sqrt(direction.x * direction.x + direction.z * direction.z))
    const clampedYaw = Math.max(-maxYaw, Math.min(maxYaw, yaw))
    const clampedPitch = Math.max(-maxPitch, Math.min(maxPitch, pitch))

    targetEyeRotL.set(-clampedPitch, clampedYaw, 0)
    targetEyeRotR.set(-clampedPitch, clampedYaw, 0)
    targetHeadRot.set(-clampedPitch * HEAD_FOLLOW_SCALE, clampedYaw * HEAD_FOLLOW_SCALE, 0)
  }

  const s = EYE_SMOOTHNESS
  currentEyeRotL.x = lerp(currentEyeRotL.x, targetEyeRotL.x, s)
  currentEyeRotL.y = lerp(currentEyeRotL.y, targetEyeRotL.y, s)
  currentEyeRotL.z = lerp(currentEyeRotL.z, targetEyeRotL.z, s)
  currentEyeRotR.x = lerp(currentEyeRotR.x, targetEyeRotR.x, s)
  currentEyeRotR.y = lerp(currentEyeRotR.y, targetEyeRotR.y, s)
  currentEyeRotR.z = lerp(currentEyeRotR.z, targetEyeRotR.z, s)
  currentHeadRot.x = lerp(currentHeadRot.x, targetHeadRot.x, s * 0.7)
  currentHeadRot.y = lerp(currentHeadRot.y, targetHeadRot.y, s * 0.7)
  currentHeadRot.z = lerp(currentHeadRot.z, targetHeadRot.z, s * 0.7)

  // 眼球追踪（部分模型骨骼轴向不兼容，可关闭）
  if (props.eyeTracking) {
    if (leftEyeBone.value) {
      leftEyeBone.value.rotation.set(currentEyeRotL.x, currentEyeRotL.y, currentEyeRotL.z)
    }
    if (rightEyeBone.value) {
      rightEyeBone.value.rotation.set(currentEyeRotR.x, currentEyeRotR.y, currentEyeRotR.z)
    }
  }
  // 头部跟随鼠标：始终保留
  if (headBone.value) {
    headBone.value.rotation.set(currentHeadRot.x, currentHeadRot.y, currentHeadRot.z)
  }
}

// 眨眼
const startBlinkLoop = () => {
  const scheduleNext = () => {
    blinkTimer = setTimeout(() => {
      isBlinking = true
      blinkProgress = 0
      scheduleNext()
    }, BLINK_FREQUENCY * 1000 + Math.random() * 2000)
  }
  scheduleNext()
}

const updateBlink = () => {
  if (!isBlinking || !morphMesh) return
  blinkProgress += 0.15
  let eyelidScale = 1
  if (blinkProgress < 1) eyelidScale = 1 - blinkProgress
  else if (blinkProgress < 2) eyelidScale = blinkProgress - 1
  else { isBlinking = false; eyelidScale = 1 }

  const dict = morphMesh.morphTargetDictionary
  const influences = morphMesh.morphTargetInfluences
  if (dict && influences) {
    const blinkIndex = dict['まばたき'] ?? dict['眨眼'] ?? dict['blink']
    if (blinkIndex !== undefined) influences[blinkIndex] = 1 - eyelidScale
  }
}

// 强制闭嘴：每帧将嘴巴相关 morph influence 归零，覆盖说话口型。
// ★ 但情绪表情（笑い/口角下げ等）可能正驱动着嘴型 morph —— 此时不该强行归零，
//   否则「开心(笑い)」「伤心(口角下げ)」这些表情会被每帧抹掉，只剩默认脸。
//   规则：该 morph 在 emotion 目标值（morphTargets）里 > 0 时，跳过归零（让情绪表情优先）。
const MOUTH_MORPH_KEYWORDS = ['あ', 'い', 'う', 'え', 'お', '口', '口角', '笑い', 'ワ', 'ア', 'イ', 'ウ', 'エ', 'オ']
const forceCloseMouth = () => {
  if (!morphMesh) return
  const dict = morphMesh.morphTargetDictionary
  const influences = morphMesh.morphTargetInfluences
  if (!dict || !influences) return
  for (const name in dict) {
    const idx = dict[name]
    if (!MOUTH_MORPH_KEYWORDS.some(kw => name.includes(kw))) continue
    // 情绪表情正驱动这个嘴型 morph（目标值 > 0）→ 不归零，让表情显示
    if (morphTargets && idx < morphTargets.length && morphTargets[idx] > 0) continue
    influences[idx] = 0
  }
}

// 空闲头部微动
let idleTime = 0
let idleTargetRot = new THREE.Euler(0, 0, 0)
// dt：真实帧间隔（秒），理由同 updateBreathing —— 限帧后不能再用固定的 0.016
const updateIdleHeadMovement = (dt = 0.016) => {
  if (!IDLE_HEAD_MOVEMENT || !headBone.value) return
  if (lookForward) return // 聊天时看向正前方，不叠加空闲头部微动（否则头会乱转，像头部跟随又回来了）
  const timeSinceMouseMove = Date.now() - lastMouseMoveTime
  if (timeSinceMouseMove > 2000) {
    idleTime += dt
    if (idleTime > 3 + Math.random() * 2) {
      idleTime = 0
      idleTargetRot.x = (Math.random() - 0.5) * 0.1
      idleTargetRot.y = (Math.random() - 0.5) * 0.15
      idleTargetRot.z = (Math.random() - 0.5) * 0.05
    }
    // 叠加在眼球追踪的头部旋转上
    const idleX = lerp(0, idleTargetRot.x, 0.02)
    const idleY = lerp(0, idleTargetRot.y, 0.02)
    const idleZ = lerp(0, idleTargetRot.z, 0.02)
    headBone.value.rotation.x = currentHeadRot.x + idleX
    headBone.value.rotation.y = currentHeadRot.y + idleY
    headBone.value.rotation.z = currentHeadRot.z + idleZ
  }
}

// 呼吸动画：胸口起伏（骨骼级），优先缩放上半身/胸部骨骼，极轻微整体浮动。dt 为真实帧间隔（秒）
const updateBreathing = (dt = 0.016) => {
  if (!currentModel.value) return
  breathingTime += dt
  // sin² 波形：0→1→0，一个周期 = BREATHING_PERIOD 秒（吸气 2s + 呼气 2s）
  const phase = Math.pow(Math.sin((breathingTime / BREATHING_PERIOD) * Math.PI), 2)
  // 吸气峰值：胸口 X/Z 微放大 1.5%，上半身轻微挺胸（绕 X 轴 +0.8°）
  const chestScale = 1 + phase * 0.005
  const chestRotX = phase * THREE.MathUtils.degToRad(0.8)

  if (bones.upperBody) {
    // 上半身骨骼：三维微缩放（主要是 X/Z 扩胸），Y 不动避免拉长全身
    bones.upperBody.scale.set(chestScale, 1 + phase * 0.004, chestScale)
    // 挺胸：绕 X 轴轻微后倾
    bones.upperBody.rotation.x = chestRotX
  } else if (bones.chest) {
    bones.chest.scale.set(chestScale, 1 + phase * 0.004, chestScale)
    bones.chest.rotation.x = chestRotX
  } else {
    // 兜底：没有胸/上半身骨骼时，做极轻微整体浮动（几乎不可察觉）
    currentModel.value.position.y = -modelCenter.y + phase * 0.015
  }
}

const onResize = () => {
  const container = containerRef.value
  if (!container || !camera.value || !renderer.value) return
  const width = container.clientWidth
  const height = container.clientHeight
  if (width === 0 || height === 0) return
  camera.value.aspect = width / height
  camera.value.updateProjectionMatrix()
  renderer.value.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
  if (outlineEffect.value) outlineEffect.value.setSize(width, height)
  renderer.value.setSize(width, height)
}

const observeResize = () => {
  if (!containerRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => onResize())
  resizeObserver.observe(containerRef.value)
}

const disposeModel = (model) => {
  if (!model || !scene.value) return
  scene.value.remove(model)
  model.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose()
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((m) => {
          if (m.map) m.map.dispose()
          m.dispose()
        })
      }
    }
  })
}

// 模型/路径变化时（换装）自动重新加载
watch(
  () => [props.model, props.basePath],
  () => {
    if (!scene.value) return
    if (modelPivot && scene.value) scene.value.remove(modelPivot)
    disposeContactShadow()
    modelPivot = null
    if (currentModel.value) {
      disposeModel(currentModel.value)
      currentModel.value = null
    }
    loadPMXModel()
  }
)

// ★ 等容器尺寸就绪再初始化，失败要重试 —— 这是「换肤后模型加载失败」的根治点。
//   背景：`v-if` 把 PMX 卸载重挂时，挂载瞬间容器尺寸可能是 0，而 `initScene()` 开头有
//   `if (width === 0 || height === 0) return` —— 它会**静默早退**，`scene` 保持 null；
//   紧接着无条件执行的 `loadPMXModel()` 就撞上 `scene.value.add(...)` → TypeError，模型再也出不来。
//   更麻烦的是 `onResize` 在 camera/renderer 为 null 时也直接 return，等于没有第二次机会（2026-10-06 修）。
let bootTimer = null
const boot = (attempt = 0) => {
  if (renderer.value) return // 已经初始化过，别重复建 scene / renderer（那才会真泄漏）
  const c = containerRef.value
  if (!c || c.clientWidth === 0 || c.clientHeight === 0) {
    if (attempt < 40) {
      bootTimer = setTimeout(() => boot(attempt + 1), 50) // 最多等 2s
      return
    }
    console.warn('[PMX] 容器尺寸始终为 0，放弃 3D 初始化')
    emit('error', new Error('容器尺寸为 0，无法初始化 3D 模型'))
    return
  }
  initScene()
  observeResize()
  loadPMXModel()
  if (props.active) window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)
}

onMounted(() => {
  nextTick(() => {
    setTimeout(() => boot(), 50)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('pointerdown', onPointerDownAdjust)
  window.removeEventListener('pointermove', onPointerMoveAdjust)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('wheel', onWheelAdjust)
  window.removeEventListener('contextmenu', onContextMenuAdjust)
  if (bootTimer) { clearTimeout(bootTimer); bootTimer = null }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (lightTimer) { clearInterval(lightTimer); lightTimer = null }
  if (blinkTimer) clearTimeout(blinkTimer)
  if (emotionTimer) { clearTimeout(emotionTimer); emotionTimer = null }
  if (animationId) cancelAnimationFrame(animationId)
  if (modelPivot && scene.value) scene.value.remove(modelPivot)
  disposeContactShadow()
  modelPivot = null
  if (currentModel.value) disposeModel(currentModel.value)
  if (outlineEffect.value) {
    // ★ OutlineEffect 只是一个包装器，**自己没有 dispose()** —— 直接调会抛 TypeError。
    //   而 onBeforeUnmount 里一旦抛错，**后面的 renderer 清理就全都不执行了**
    //   （forceContextLoss / dispose 都在它下面），那才是真的 context 泄漏。
    //   用 ?.() 兜住：它持有的 domElement 手动摘掉，它包的那个 renderer 由下面统一处理（2026-10-06 修）
    if (containerRef.value && outlineEffect.value.domElement) {
      containerRef.value.removeChild(outlineEffect.value.domElement)
    }
    outlineEffect.value.dispose?.()
    outlineEffect.value = null
  }
  if (renderer.value) {
    // ★ 必须显式释放 WebGL context —— dispose() 只释放 GPU 资源，**不释放 context**。
    //   不释放的话，每次「穿服装 → 换回默认」都会泄漏一个（v-if 会把 PMX 卸掉再挂回来），
    //   浏览器对 context 有数量上限（Chrome 约 16 个），耗尽后新画布就创建不出 context，
    //   首页人物直接渲染不出来；位置也会停在初始值（loadSavedTransform 轮不到执行）。
    //   用 ?.() 兜住：context 已丢失时再调会抛错，不该影响卸载流程（2026-10-06 修）
    try { renderer.value.forceContextLoss?.() } catch (e) { /* 已丢失，忽略 */ }
    renderer.value.dispose()
  }
})

// 获取头部骨骼在屏幕（容器）上的像素坐标，供气泡定位用
const getHeadScreenPos = () => {
  if (!headBone.value || !camera.value || !containerRef.value) return null
  const pos = new THREE.Vector3()
  headBone.value.getWorldPosition(pos)
  pos.project(camera.value) // NDC: x,y ∈ [-1,1]
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  return { x: (pos.x * 0.5 + 0.5) * w, y: (-pos.y * 0.5 + 0.5) * h }
}

// 获取当前大小/位置/方向（供外部进入调整模式时同步滑杆初值）
const getTransform = () => ({ ...modelTransform })

// ===== 情绪表情驱动 =====
// 目标值（每索引），animate 循环里每帧把实际 morphTargetInfluences 向它平滑逼近（1s 过渡）。
// 「情绪表情」和「红脸（照れ）」分离管理：红脸是常驻的（好感≥200 永久保留、不随情绪清理），
// 情绪表情叠加在红脸之上。
const EMOTION_TRANSITION = 1.0 // 过渡时长（秒），0→1 约 1s 平滑
let morphTargets = null        // Float32Array，惰性初始化
let emotionTimer = null
let blushActive = false        // 红脸是否常驻（好感≥200）

const currentAffection = () => {
  try {
    const raw = Number(localStorage.getItem('player_affection'))
    return Number.isFinite(raw) ? raw : 0
  } catch (e) { return 0 }
}

// 确保 morphTargets 已初始化（长度 = influence 数量）
const ensureMorphTargets = () => {
  const mm = morphMesh
  if (!mm || !mm.morphTargetInfluences) return false
  if (!morphTargets || morphTargets.length !== mm.morphTargetInfluences.length) {
    morphTargets = new Float32Array(mm.morphTargetInfluences.length)
  }
  return true
}

// 每帧把实际 influence 平滑逼近目标值（1s 过渡）
const updateMorphTransition = (dt) => {
  const mm = morphMesh
  if (!mm || !mm.morphTargetInfluences) return
  if (!morphTargets) return
  const infl = mm.morphTargetInfluences
  const n = Math.min(infl.length, morphTargets.length)
  // 红脸常驻：好感≥200 时目标值始终为 1
  if (blushActive && BLUSH_MORPH_INDEX < n) morphTargets[BLUSH_MORPH_INDEX] = 1
  const rate = EMOTION_TRANSITION > 0 ? 1 - Math.exp(-dt / (EMOTION_TRANSITION / 3)) : 1
  for (let i = 0; i < n; i++) {
    const target = morphTargets[i]
    const cur = infl[i]
    if (Math.abs(target - cur) < 0.001) { infl[i] = target; continue }
    infl[i] += (target - cur) * rate
  }
}

// 播放情绪：把对应池里随机一个表情的目标值设为 1，其余情绪表情目标值归 0（红脸保持常驻）。
// 注意：嘴型表情会被 forceCloseMouth 每帧归零，这里只设目标值，实际嘴型以渲染循环为准。
const setEmotion = (emotionKey, duration = 3000) => {
  const pool = EMOTION_MORPHS[emotionKey]
  if (!pool || !ensureMorphTargets()) return
  const mm = morphMesh
  const n = mm.morphTargetInfluences.length
  // 先刷新红脸常驻状态（每次调用都重新读好感，跨档即时生效）
  blushActive = currentAffection() >= BLUSH_AFFECTION_THRESHOLD
  // 清空所有「情绪表情」目标值（红脸除外），避免残留叠加
  for (let i = 0; i < n; i++) {
    if (i === BLUSH_MORPH_INDEX) continue
    morphTargets[i] = 0
  }
  // 红脸目标值：常驻则 1，否则 0（也走 1s 过渡）
  if (BLUSH_MORPH_INDEX < n) morphTargets[BLUSH_MORPH_INDEX] = blushActive ? 1 : 0
  // 随机取池中一个表情，目标值设为 1
  const pick = pool[Math.floor(Math.random() * pool.length)]
  if (pick >= 0 && pick < n) morphTargets[pick] = 1
  // duration 秒后把情绪表情目标值归 0（红脸保留）
  if (emotionTimer) clearTimeout(emotionTimer)
  if (duration > 0) {
    emotionTimer = setTimeout(() => {
      if (ensureMorphTargets()) {
        for (let i = 0; i < morphTargets.length; i++) {
          if (i === BLUSH_MORPH_INDEX) continue
          morphTargets[i] = 0
        }
      }
      emotionTimer = null
    }, duration)
  }
}

// 恢复默认表情：清空所有「情绪表情」目标值（红脸常驻保留）。用于关闭聊天时把脸还原。
const clearEmotion = () => {
  if (emotionTimer) { clearTimeout(emotionTimer); emotionTimer = null }
  if (!ensureMorphTargets()) return
  const n = morphMesh.morphTargetInfluences.length
  for (let i = 0; i < n; i++) {
    if (i === BLUSH_MORPH_INDEX) continue
    morphTargets[i] = 0
  }
}

// 看向正前方：进入聊天时取消面部跟随鼠标，眼睛/头部回正看向屏幕正前方
const setLookForward = (forward) => {
  lookForward = forward
}

// 暴露给 Home：滑杆调大小 / 完成保存 / 重置 / 头部屏幕坐标 / 情绪表情 / 看向正前方 / 恢复默认表情
defineExpose({ setScale, setRy, saveTransform, resetTransform, getHeadScreenPos, getTransform, setEmotion, setLookForward, clearEmotion })
</script>

<style scoped>
.pmx-character {
  width: 100%;
  height: 100%;
  position: relative;
}

.pmx-character :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

.pmx-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 14px;
  z-index: 10;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
</style>
