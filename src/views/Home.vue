<template>
  <div class="home" :class="{ 'home-bg-active': homeBgVisible }">
    <!-- 首页专属背景层：启用时覆盖默认背景，仅作用于背景，不影响内容 -->
    <div v-if="homeBgVisible" class="home-bg-overlay" :style="homeBgStyle"></div>
    <NavBar />

    <!-- 给木：五子棋 / 猜字谜 / 萤火夜话 入口（左上角） -->
    <div class="game-fab-wrap">
      <button type="button" class="game-fab" :class="{ open: showGameMenu }" title="给木" @click="toggleGameMenu" @mouseenter="onHoverGameEntry">
        <i class="fa-solid fa-gamepad"></i>
        <span>给木</span>
      </button>
      <Transition name="game-menu">
        <div v-if="showGameMenu" class="game-menu">
          <button type="button" class="game-menu-item" @click="goChess">
            <img :src="chessImg" alt="五子棋" class="menu-item-img" />
            <span>五子棋</span>
          </button>
          <button type="button" class="game-menu-item" @click="goGuessWord">
            <span class="menu-item-icon-text">字</span>
            <span>猜字谜</span>
          </button>
          <button type="button" class="game-menu-item" @click="goWerewolf">
            <img :src="wolfImg" alt="萤火夜话" class="menu-item-img" />
            <span>萤火夜话</span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- 主页人物：默认形象为 3D PMX 模型；穿戴服装时显示对应 2D 立绘图片 -->
    <div
      ref="characterEl"
      class="home-character"
      :style="characterStyle"
    >
      <PMXCharacter
        v-if="!isSpriteMode"
        ref="pmxRef"
        :active="pageActive"
        :model="DEFAULT_MODEL_CFG.model"
        :basePath="DEFAULT_MODEL_CFG.basePath"
        :eyeTracking="DEFAULT_MODEL_CFG.eyeTracking"
        :defaultPose="DEFAULT_MODEL_CFG.defaultPose"
        :adjustMode="adjustMode"
        @transform-change="onTransformChange"
      />
      <!-- 穿了带 Live2D 模型的服装时优先用 Live2D；左下角可一键切回 2D 立绘 -->
      <Live2DViewer
        v-else-if="isLive2DMode"
        ref="live2dRef"
        :src="live2dSrc"
        :active="pageActive"
        :scale="live2dTransform.scale"
        :offsetX="live2dTransform.x"
        :offsetY="live2dTransform.y"
        :maxFps="isTouchDevice ? 30 : 60"
        @error="onLive2DError"
      />
      <img
        v-else
        ref="characterImgRef"
        class="home-character-img"
        :src="equippedClothing.gameImg"
        :alt="equippedClothing.name"
        :style="characterImgStyle"
        draggable="false"
      />
      <!-- 问候气泡（打字机效果，模拟角色正在说话） -->
      <Transition name="bubble">
        <div v-if="bubbleVisible" class="character-bubble" :style="bubbleStyle">
          {{ bubbleDisplayText }}<span v-if="typing" class="typing-cursor">|</span>
        </div>
      </Transition>
      <!-- 好感度与行动点（按住鼠标右键时显示，位于人物图片右上角） -->
      <Transition name="stats-pop">
        <div v-show="statsVisible" class="character-stats">
          <div class="stats-row">
            <span class="stats-label">好感度</span>
            <span class="stats-value">{{ affection }}</span>
          </div>
          <div class="stats-row">
            <span class="stats-label">行动点</span>
            <span class="stats-value">{{ actionPoint }}</span>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 左下角按钮组：挂机时间 + AI 聊天 -->
    <div class="home-fab-group">
      <button type="button" class="idle-fab" title="挂机时间" @click="goIdle" @mouseenter="onHoverIdle">
        <span>挂机时间</span>
      </button>
      <button type="button" class="chat-fab" title="和流萤聊天" @click="showChat = true">
        <i class="fa-solid fa-comment-dots"></i>
        <span>聊天</span>
      </button>
      <button type="button" class="adjust-fab" :class="{ active: adjustMode }" title="调整人物大小与位置" @click="toggleAdjust">
        <i class="fa-solid fa-up-down-left-right"></i>
        <span>调整</span>
      </button>
      <!-- Live2D / 2D 立绘 一键切换（仅当当前服装有 Live2D 模型时出现） -->
      <button
        v-if="canUseLive2D"
        type="button"
        class="adjust-fab"
        :class="{ active: isLive2DMode }"
        :title="isLive2DMode ? '当前为 Live2D，点击切回立绘' : '当前为立绘，点击切换 Live2D'"
        @click="toggleRenderMode"
      >
        <i class="fa-solid fa-wand-magic-sparkles"></i>
        <span>{{ isLive2DMode ? 'Live2D' : '立绘' }}</span>
      </button>
    </div>

    <!-- 人物调整面板（3D 模型 / 2D 立绘通用，调整模式下显示） -->
    <Transition name="adjust-panel">
      <div v-if="adjustMode" class="model-adjust-panel">
        <div class="adjust-tip">{{ adjustTip }}</div>
        <div class="adjust-row">
          <span class="adjust-label">大小</span>
          <el-slider v-model="modelScale" :min="0.4" :max="2.5" :step="0.05" class="adjust-slider" @input="onSliderInput" />
          <span class="adjust-value">{{ modelScale.toFixed(2) }}x</span>
        </div>
        <div v-if="!isSpriteMode" class="adjust-row">
          <span class="adjust-label">方向</span>
          <el-slider v-model="modelRy" :min="-180" :max="180" :step="1" class="adjust-slider" @input="onRyInput" />
          <span class="adjust-value">{{ modelRy }}°</span>
        </div>
        <div class="adjust-actions">
          <button type="button" class="adjust-btn" @click="resetAdjust">重置</button>
          <button type="button" class="adjust-btn primary" @click="finishAdjust">完成</button>
        </div>
      </div>
    </Transition>

    <!-- 悬浮启动官方游戏按钮 -->
    <button
      class="launch-fab"
      :class="{ configured: hasGamePath }"
      @click="handleLaunchGame"
      @mouseenter="onHoverLaunchGame"
      title="启动星穹铁道"
    >
      <img :src="iconImg" alt="启动星穹铁道" class="fab-img" />
      <span class="fab-tooltip">{{ hasGamePath ? '启动星穹铁道' : '未配置路径，点击跳转官网' }}</span>
    </button>

    <!-- AI 对话（底部抽屉滑出） -->
    <el-drawer
      v-model="showChat"
      direction="btt"
      size="35vh"
      :with-header="false"
      :modal="false"
      :close-on-click-modal="false"
      class="chat-drawer"
    >
      <ChatDialog ref="chatDialogRef" @close="showChat = false" />
    </el-drawer>
  </div>
</template>

<script setup>
defineOptions({ name: 'Home' })
import NavBar from '@/components/NavBar.vue'
import ChatDialog from '@/components/ChatDialog.vue'
import PMXCharacter from '@/components/PMXCharacter.vue'
import Live2DViewer from '@/components/Live2DViewer.vue'
import { useRouter } from 'vue-router'
import { ref, reactive, computed, onMounted, onBeforeUnmount, onActivated, onDeactivated, watch } from 'vue'
import { useInventoryStore } from '@/config/inventory'
import { useBackgroundStore } from '@/config/background'
import { getLoginGreeting, getSignGreeting, getAffectionStage, getAffectionGreeting, getHoverGreeting, getClickGreeting } from '@/config/greetings'
import { isTouchDevice } from '@/utils/device'
import chessImg from '@/images/game/chess.png'
import wolfImg from '@/images/game/wolf/ly.png'
import iconImg from '@/images/item/icon.png'

const router = useRouter()
const inventoryStore = useInventoryStore()
const bgStore = useBackgroundStore()

// 首页专属背景：启用时覆盖默认背景图，支持独立透明度
const homeBgVisible = computed(() => !!bgStore.homeBackgroundImage)
const homeBgStyle = computed(() => {
  const img = bgStore.homeBackgroundImage
  if (!img) return {}
  return {
    backgroundImage: `url(${img})`,
    opacity: bgStore.homeBgOpacity,
  }
})

// keep-alive 激活状态：控制 PMXCharacter 是否渲染/追踪鼠标
const pageActive = ref(true)

// = 主页形象展示 =
// 默认形象（未穿戴任何服装）使用 3D PMX 模型；穿戴服装时改显对应 2D 立绘图片
const DEFAULT_MODEL_CFG = { model: '猫耳流萤.pmx', basePath: '/models/1/', eyeTracking: true, defaultPose: true }
// 当前穿戴的服装（未穿戴或已失去返回 null）
const equippedClothing = computed(() => inventoryStore.equippedClothing)
// 是否为图片立绘模式：穿戴了带主页立绘的服装
const isImageMode = computed(() => !!equippedClothing.value?.gameImg)

//  Live2D：服装 id → public/live2d 下的模型目录 
// 该目录必须与 src/images/game 下的立绘 png 同名成对，模型入口固定为 <name>.model3.json
const LIVE2D_MAP = {
  101: 'firefly_spring', // 流萤&春日手信
  102: 'small_loli',     // 流萤&小不点
  103: 'firefly_zx',     // 流萤&仲夏萤火之约
  104: 'firefly_war',    // 流萤&战斗服
}
// 当前服装对应的 Live2D 入口路径（没有则空串 → 只能走立绘/3D）
const live2dSrc = computed(() => {
  const name = LIVE2D_MAP[equippedClothing.value?.id]
  return name ? `/live2d/${name}/${name}.model3.json` : ''
})
const canUseLive2D = computed(() => !!live2dSrc.value)

// 展示方式偏好：'live2d'（默认）| 'image'（2D 立绘）。
// 这是「设备级」的显示偏好，不进 SAVE_KEYS，切换存档槽时保持用户习惯。
const RENDER_MODE_KEY = 'home_render_mode'
const renderMode = ref('live2d')
const isLive2DMode = computed(() => canUseLive2D.value && renderMode.value === 'live2d')
// 立绘类展示（Live2D / 2D 图片）统称：它们共用一套拖动/缩放调整逻辑，3D PMX 走另一套
const isSpriteMode = computed(() => isImageMode.value || isLive2DMode.value)
const live2dRef = ref(null)

const saveRenderMode = () => {
  try { localStorage.setItem(RENDER_MODE_KEY, renderMode.value) } catch (e) { /* 隐私模式忽略 */ }
}
const loadRenderMode = () => {
  const saved = localStorage.getItem(RENDER_MODE_KEY)
  if (saved === 'live2d' || saved === 'image') renderMode.value = saved
}
const toggleRenderMode = () => {
  renderMode.value = isLive2DMode.value ? 'image' : 'live2d'
  saveRenderMode()
}
const onLive2DError = (e) => {
  // 模型加载失败（缺 Cubism Core / 文件缺失 / 显存不足）→ 自动退回 2D 立绘，别让首页空着
  console.warn('[Home] Live2D 加载失败，已回退到 2D 立绘：', e)
  renderMode.value = 'image'
  saveRenderMode()
}

const showGameMenu = ref(false)
const toggleGameMenu = () => {
  showGameMenu.value = !showGameMenu.value
}
const goChess = () => {
  showGameMenu.value = false
  router.push('/chess')
}
const goGuessWord = () => {
  showGameMenu.value = false
  router.push('/guess-word')
}
// 萤火夜话：单人模式（帕姆当判官，剩下的座位由 AI 乘客补上）
const goWerewolf = () => {
  showGameMenu.value = false
  router.push('/werewolf')
}
const goIdle = () => {
  router.push({ path: '/idle', query: { autoStart: '1' } })
}

// 主页人物（调整模式下可拖拽移动/缩放；3D 模型与 2D 立绘各存一份到 localStorage）
const characterEl = ref(null)

//  人物大小/位置调整（模型 / 立绘通用） 
const pmxRef = ref(null)
const adjustMode = ref(false)
const modelScale = ref(1)
const modelRy = ref(0)
const SCALE_MIN = 0.4
const SCALE_MAX = 2.5
const clampScale = (s) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, s))

//  立绘类变换（Live2D / 2D 图片各存一份持久化；x/y 为相对屏幕中心的像素偏移） 
const IMAGE_TRANSFORM_KEY = 'home_image_transform'
const LIVE2D_TRANSFORM_KEY = 'home_live2d_transform'
const imageTransform = reactive({ scale: 1, x: 0, y: 0 })
const live2dTransform = reactive({ scale: 1, x: 0, y: 0 })

// 当前生效的那一份：拖动 / 捏合 / 滚轮 / 滑杆全部作用于它，两套各存各的互不干扰
const activeTransform = () => (isLive2DMode.value ? live2dTransform : imageTransform)

const characterImgStyle = computed(() => ({
  // translate 写在 scale 外层，保证位移像素不被缩放放大
  transform: `translate(calc(-50% + ${imageTransform.x}px), calc(-50% + ${imageTransform.y}px)) scale(${imageTransform.scale})`,
}))

const readTransform = (key, target) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null')
    if (saved) {
      target.scale = clampScale(Number(saved.scale) || 1)
      target.x = Number(saved.x) || 0
      target.y = Number(saved.y) || 0
    }
  } catch (e) { /* 数据损坏则忽略 */ }
}
const saveSpriteTransform = (isL2D = isLive2DMode.value) => {
  const tf = isL2D ? live2dTransform : imageTransform
  const key = isL2D ? LIVE2D_TRANSFORM_KEY : IMAGE_TRANSFORM_KEY
  localStorage.setItem(key, JSON.stringify({ ...tf }))
}
const loadSpriteTransforms = () => {
  readTransform(IMAGE_TRANSFORM_KEY, imageTransform)
  readTransform(LIVE2D_TRANSFORM_KEY, live2dTransform)
}
const resetSpriteTransform = () => {
  const tf = activeTransform()
  tf.scale = 1
  tf.x = 0
  tf.y = 0
  saveSpriteTransform()
  modelScale.value = 1
}
const setSpriteScale = (s) => {
  const tf = activeTransform()
  tf.scale = clampScale(s)
  modelScale.value = tf.scale
}

// 进入调整时把当前形象的大小/方向同步到滑杆
const syncAdjustSliders = () => {
  if (isSpriteMode.value) {
    modelScale.value = activeTransform().scale
    modelRy.value = 0
  } else {
    const t = pmxRef.value?.getTransform?.()
    if (t) { modelScale.value = t.scale; modelRy.value = Math.round(t.ry) }
  }
}
// 退出/完成调整时按当前模式保存
const saveCurrentTransform = () => {
  if (isSpriteMode.value) saveSpriteTransform()
  else pmxRef.value?.saveTransform()
}
const toggleAdjust = () => {
  adjustMode.value = !adjustMode.value
  if (adjustMode.value) syncAdjustSliders()
  else saveCurrentTransform()
}
const onTransformChange = (t) => { modelScale.value = t.scale; modelRy.value = Math.round(t.ry) }
const onSliderInput = (v) => {
  if (isSpriteMode.value) setSpriteScale(v)
  else pmxRef.value?.setScale(v)
}
const onRyInput = (v) => { pmxRef.value?.setRy(v) }
const finishAdjust = () => {
  saveCurrentTransform()
  adjustMode.value = false
}
const resetAdjust = () => {
  if (isSpriteMode.value) resetSpriteTransform()
  else pmxRef.value?.resetTransform()
}

//  立绘类（2D 图片 / Live2D）：调整模式下的拖拽移动 + 滚轮/双指缩放 
// 统一挂在 window 上监听，仅「调整模式 + 立绘类展示」时生效。
// Live2D 的 canvas 是 pointer-events:none（为了不挡下层 UI），拿不到自身事件，
// 所以只能走 window —— 也正因如此，这套逻辑对两种模式可以完全共用。
let imgDragging = false
let imgDragStart = { px: 0, py: 0, x: 0, y: 0 }
// 双指捏合状态（移动端没有滚轮，缩放只能靠手势）
const imgPointers = new Map() // pointerId -> { x, y }
let imgPinchStartDist = 0
let imgPinchStartScale = 1

function imgPointerDistance() {
  const pts = [...imgPointers.values()]
  if (pts.length < 2) return 0
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
}

const onImgPointerDown = (e) => {
  if (!adjustMode.value || !isSpriteMode.value) return
  if (e.target && e.target.closest && e.target.closest('.model-adjust-panel')) return
  imgPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (imgPointers.size >= 2) {
    // 第二指落下 → 切到捏合，放弃拖动，避免两指位移同时改位置导致立绘乱跳
    imgDragging = false
    imgPinchStartDist = imgPointerDistance()
    imgPinchStartScale = activeTransform().scale
    return
  }
  if (e.button !== 0) return // 立绘仅左键移动
  imgDragging = true
  {
    const tf = activeTransform()
    imgDragStart = { px: e.clientX, py: e.clientY, x: tf.x, y: tf.y }
  }
}
const onImgPointerMove = (e) => {
  if (!adjustMode.value || !isSpriteMode.value) return
  if (imgPointers.has(e.pointerId)) imgPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (imgPointers.size >= 2) {
    const dist = imgPointerDistance()
    if (imgPinchStartDist > 0 && dist > 0) {
      // 以捏合起点为基准换算，避免逐帧累乘造成漂移
      setSpriteScale(imgPinchStartScale * (dist / imgPinchStartDist))
    }
    return
  }
  if (!imgDragging) return
  const tf = activeTransform()
  tf.x = imgDragStart.x + (e.clientX - imgDragStart.px)
  tf.y = imgDragStart.y + (e.clientY - imgDragStart.py)
}
const endImgDrag = (e) => {
  if (e && e.pointerId != null) imgPointers.delete(e.pointerId)
  if (imgPointers.size < 2) {
    imgPinchStartDist = 0
    imgDragging = false
  }
}
const onImgWheel = (e) => {
  if (!adjustMode.value || !isSpriteMode.value) return
  e.preventDefault()
  setSpriteScale(activeTransform().scale * (e.deltaY < 0 ? 1.05 : 0.95))
}
watch([adjustMode, isSpriteMode], ([adjust, spriteMode]) => {
  const active = adjust && spriteMode
  if (active) {
    window.addEventListener('pointerdown', onImgPointerDown)
    window.addEventListener('pointermove', onImgPointerMove)
    window.addEventListener('pointerup', endImgDrag)
    window.addEventListener('pointercancel', endImgDrag)
    window.addEventListener('wheel', onImgWheel, { passive: false })
  } else {
    window.removeEventListener('pointerdown', onImgPointerDown)
    window.removeEventListener('pointermove', onImgPointerMove)
    window.removeEventListener('pointerup', endImgDrag)
    window.removeEventListener('pointercancel', endImgDrag)
    window.removeEventListener('wheel', onImgWheel)
    if (imgDragging) imgDragging = false
    imgPointers.clear()
    imgPinchStartDist = 0
  }
})

// 调整模式开启期间锁死页面手势：否则单指拖动会被浏览器当成滚动/下拉刷新吃掉，
// pointermove 根本不触发。面板自身要把 touch-action 收回来，否则里面的滑块拖不动
// （对应样式见 assets/styles/main.css 的 .gesture-lock）。
watch(adjustMode, (on) => {
  document.documentElement.classList.toggle('gesture-lock', on)
})

// 展示方式切换时：先把「旧的那一份」变换存好，再决定调整模式怎么走。
// 用 prev 而不是当前状态来存，因为切换那一刻 activeTransform() 已经指向新的一份了。
const displayKey = computed(() => (isLive2DMode.value ? 'live2d' : (isImageMode.value ? 'image' : '3d')))
watch(displayKey, (now, prev) => {
  if (!adjustMode.value) return
  if (prev === 'live2d') saveSpriteTransform(true)
  else if (prev === 'image') saveSpriteTransform(false)
  else pmxRef.value?.saveTransform()
  // 3D 与立绘类的调整面板内容不一样（方向滑杆只对 3D 有意义），跨类切换直接退出调整
  if (prev === '3d' || now === '3d') adjustMode.value = false
  else syncAdjustSliders()
})

// 玩家状态：好感度 / 行动点
const LEVEL_KEY = 'player_level_data'
const AFFECTION_KEY = 'player_affection'
const DEFAULT_AFFECTION = 100
const BASE_ACTION_POINT = 50
const ACTION_POINT_PER_LEVEL = 10 // 50 * 20% = 10，每升一级 +10 行动点

const level = ref(0)
// 好感度 / 行动点加成走 store 响应式 state，使用物品 / 签到 / 上线更新时自动响应
const affection = computed(() => inventoryStore.affection)
const actionBonus = computed(() => inventoryStore.actionBonus)
const actionRecover = computed(() => inventoryStore.actionRecover)
// 行动点 = 基础(50 + 等级 * 10) + 物品累计加成 + 恢复累计
const actionPoint = computed(() => BASE_ACTION_POINT + level.value * ACTION_POINT_PER_LEVEL + actionBonus.value + actionRecover.value)

// 好感度/行动点面板：桌面端按住鼠标右键显示，松开隐藏
const statsVisible = ref(false)
const onStatsMouseDown = (e) => {
  if (e.button === 2) statsVisible.value = true // 右键按下
}
const onStatsMouseUp = (e) => {
  if (e.button === 2) statsVisible.value = false // 右键松开
}
const onStatsBlur = () => { statsVisible.value = false } // 窗口失焦兜底

//  移动端：长按显示好感度/行动点 
// 触屏没有「右键」，但「按住才显示、松手就收起」这个语义要保留，
// 长按是最接近的映射；同时避开调整模式（那时长按属于拖拽手势）。
const STATS_LONG_PRESS_MS = 400
let statsPressTimer = null
const cancelStatsPress = () => {
  if (statsPressTimer) {
    clearTimeout(statsPressTimer)
    statsPressTimer = null
  }
}
const onStatsTouchStart = (e) => {
  if (adjustMode.value) return
  if (e.touches.length !== 1) { cancelStatsPress(); return }
  cancelStatsPress()
  statsPressTimer = setTimeout(() => {
    statsPressTimer = null
    statsVisible.value = true
  }, STATS_LONG_PRESS_MS)
}
const onStatsTouchEnd = () => {
  cancelStatsPress()
  statsVisible.value = false
}
// 长按计时的过程中手指动了，说明用户其实是在滚动/拖拽，不是要长按 —— 取消计时，
// 否则面板会在滚动途中突然弹出并一直粘在屏幕上（touchend 前不会消失）
const onStatsTouchMove = () => { cancelStatsPress() }

// 调整面板的操作提示：触屏没有右键/滚轮，文案要跟着换，否则用户按提示操作无反应
const adjustTip = computed(() => {
  if (isTouchDevice) {
    return isSpriteMode.value
      ? '拖动移动 · 双指捏合或滑杆调大小'
      : '拖动移动 · 双指捏合或滑杆调大小 · 转向用滑杆'
  }
  return isSpriteMode.value
    ? '左键拖动移动 · 滚轮或滑杆调大小'
    : '左键拖动移动 · 右键拖动转向 · 滚轮或滑杆调大小'
})

// 问候气泡（打字机效果，每条文字每隔 6s 才能重新触发一次）
const bubbleVisible = ref(false)
const bubbleText = ref('')        // 完整文本
const bubbleDisplayText = ref('') // 当前显示的打字机文本
const typing = ref(false)         // 是否正在打字
// 气泡跟随角色头部位置：3D 模式由 showBubble 一次性赋值；2D 模式由 computed 实时跟随图片变换
const bubbleX = ref(typeof window !== 'undefined' ? window.innerWidth / 2 : 0)
const bubbleY = ref(typeof window !== 'undefined' ? window.innerHeight * 0.14 : 0)
const characterImgRef = ref(null)
const bubbleStyle = computed(() => {
  if (isLive2DMode.value) {
    // Live2D：坐标由组件根据「内容外框」实时算出（跟随缩放/位移/窗口 resize）
    const pos = live2dRef.value?.headScreenPos
    if (pos) return { left: pos.x + 'px', top: (pos.y - 80) + 'px' }
    return { left: bubbleX.value + 'px', top: bubbleY.value + 'px' }
  }
  if (isImageMode.value && characterImgRef.value) {
    // 2D 图片：读真实渲染矩形，自适应拖拽 / 缩放 / 窗口 resize
    const rect = characterImgRef.value.getBoundingClientRect()
    const headX = rect.left + rect.width * 0.5
    const headY = rect.top + rect.height * 0.15
    return { left: headX + 'px', top: (headY - 80) + 'px' }
  }
  // 3D 模型 / 默认：用 showBubble 时一次性写入的坐标
  return { left: bubbleX.value + 'px', top: bubbleY.value + 'px' }
})
let bubbleTimer = null
let typeTimer = null
let lastBubbleAt = 0
const BUBBLE_THROTTLE_MS = 6000
const TYPE_SPEED_MS = 60 // 每个字的间隔（毫秒）

function showBubble(text, duration = 6000) {
  if (!text) return
  const now = Date.now()
  if (now - lastBubbleAt < BUBBLE_THROTTLE_MS) return
  lastBubbleAt = now
  bubbleText.value = text
  bubbleDisplayText.value = ''
  typing.value = true
  // 3D 模型模式：取头部屏幕坐标（2D 图片模式由 bubbleStyle computed 自动跟随）
  if (!isImageMode.value) {
    const pos = pmxRef.value?.getHeadScreenPos?.()
    if (pos) {
      bubbleX.value = pos.x
      bubbleY.value = pos.y - 80 // 气泡在头部上方 80px
    }
  }
  bubbleVisible.value = true

  // 打字机：逐字显示
  let i = 0
  if (typeTimer) clearInterval(typeTimer)
  typeTimer = setInterval(() => {
    if (i < text.length) {
      bubbleDisplayText.value += text[i]
      i++
    } else {
      clearInterval(typeTimer)
      typeTimer = null
      typing.value = false
      // 打完后停留剩余时间再消失
      const remain = Math.max(2000, duration - text.length * TYPE_SPEED_MS)
      if (bubbleTimer) clearTimeout(bubbleTimer)
      bubbleTimer = setTimeout(() => { bubbleVisible.value = false }, remain)
    }
  }, TYPE_SPEED_MS)
}
// 好感度阶段：跨入新区间时显示台词
let lastAffectionStage = -1
watch(affection, (v) => {
  const newStage = getAffectionStage(v)
  if (lastAffectionStage >= 0 && newStage !== lastAffectionStage) {
    const g = getAffectionGreeting(v)
    if (g) showBubble(g, 6000)
  }
  lastAffectionStage = newStage
})

// 悬浮入口反馈
const onHoverGameEntry = () => showBubble(getHoverGreeting('gameEntry'))
const onHoverIdle = () => showBubble(getHoverGreeting('idle'))
const onHoverLaunchGame = () => showBubble(getHoverGreeting('launchGame'))

// AI 对话（右侧抽屉）
const showChat = ref(false)
// 聊天抽屉关闭时立即触发长期记忆整理（短对话也录入记忆卡）
const chatDialogRef = ref(null)
watch(showChat, (open) => {
  if (!open) chatDialogRef.value?.onDrawerClosed?.()
})

const loadPlayerStats = () => {
  // 等级（与 notify 页面共享 localStorage，升级后回首页刷新）
  const savedLevel = localStorage.getItem(LEVEL_KEY)
  if (savedLevel) {
    try {
      const p = JSON.parse(savedLevel)
      level.value = p.level ?? 0
    } catch (e) {
      console.warn('读取等级数据失败')
    }
  }
}

const characterStyle = computed(() => ({
  transform: `translate(-50%, -50%)`,
}))

//  官方游戏启动 
const GAME_PATH_KEY = 'official_game_path'
const gamePath = ref('')
const hasGamePath = computed(() => !!gamePath.value)

const showTip = (message, type = 'info') => {
  const div = document.createElement('div')
  div.className = `custom-alert custom-alert-${type}`
  div.textContent = message
  Object.assign(div.style, {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 28px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '10001',
    color: '#fff',
    background: type === 'success' ? '#52c41a' : type === 'error' ? '#e74c3c' : '#1677ff',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'opacity 0.3s ease'
  })
  document.body.appendChild(div)
  setTimeout(() => {
    div.style.opacity = '0'
    setTimeout(() => div.remove(), 300)
  }, 2000)
}

const handleLaunchGame = async () => {
  if (!window.electronAPI?.isElectron) {
    showTip('请在桌面端使用此功能', 'error')
    return
  }
  try {
    const result = await window.electronAPI.launchGame(gamePath.value)
    showTip(result.msg, result.success ? 'success' : 'error')
  } catch (err) {
    showTip('启动失败: ' + err.message, 'error')
  }
}

onMounted(() => {
  inventoryStore.loadData()
  loadPlayerStats()
  loadRenderMode()
  loadSpriteTransforms()
  // 好感度/行动点面板：桌面端按住右键显示，松开/失焦隐藏；移动端长按显示
  window.addEventListener('mousedown', onStatsMouseDown)
  window.addEventListener('mouseup', onStatsMouseUp)
  window.addEventListener('blur', onStatsBlur)
  window.addEventListener('touchstart', onStatsTouchStart, { passive: true })
  window.addEventListener('touchmove', onStatsTouchMove, { passive: true })
  window.addEventListener('touchend', onStatsTouchEnd, { passive: true })
  window.addEventListener('touchcancel', onStatsTouchEnd, { passive: true })
  const saved = localStorage.getItem(GAME_PATH_KEY)
  if (saved) gamePath.value = saved
  // 问候气泡触发：优先签到反馈，其次每日登录问候
  const pending = localStorage.getItem('pending_greeting')
  if (pending === 'sign') {
    localStorage.removeItem('pending_greeting')
    showBubble(getSignGreeting())
  } else {
    const today = new Date().toDateString()
    const last = localStorage.getItem('last_login_greeting_date')
    if (last !== today) {
      localStorage.setItem('last_login_greeting_date', today)
      showBubble(getLoginGreeting())
    }
  }
  // 初始化好感度阶段基线（避免首次进入就触发阶段台词）
  lastAffectionStage = getAffectionStage(affection.value)
})

// keep-alive 缓存：控制 PMXCharacter 渲染/追踪
onActivated(() => {
  pageActive.value = true
})

onDeactivated(() => {
  pageActive.value = false
})

onBeforeUnmount(() => {
  if (bubbleTimer) clearTimeout(bubbleTimer)
  if (typeTimer) clearInterval(typeTimer)
  window.removeEventListener('mousedown', onStatsMouseDown)
  window.removeEventListener('mouseup', onStatsMouseUp)
  window.removeEventListener('blur', onStatsBlur)
  window.removeEventListener('touchstart', onStatsTouchStart)
  window.removeEventListener('touchmove', onStatsTouchMove)
  window.removeEventListener('touchend', onStatsTouchEnd)
  window.removeEventListener('touchcancel', onStatsTouchEnd)
  cancelStatsPress()
  window.removeEventListener('pointerdown', onImgPointerDown)
  window.removeEventListener('pointermove', onImgPointerMove)
  window.removeEventListener('pointerup', endImgDrag)
  window.removeEventListener('wheel', onImgWheel)
})
</script>

<style scoped src="@/assets/styles/Home.css"></style>

<!-- 覆盖 Element Plus drawer 默认白色背景，让背后角色可见 -->
<style>
.chat-drawer.el-drawer {
  background: transparent !important;
  box-shadow: none !important;
}
.chat-drawer.el-drawer .el-drawer__body {
  background: transparent !important;
  padding: 0;
}
/* 移动端抽屉高度统一在 assets/styles/main.css 的 `.el-drawer.btt` 里控制
   （用 dvh 而非 vh，能跟随地址栏伸缩）。此处不要再写一遍，否则两个 !important
   互相覆盖，反而把 dvh 换回了会跳变的 vh。 */
</style>