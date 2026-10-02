<template>
  <div id="app">
    <GlobalBackground />
    <router-view v-slot="{ Component }">
      <keep-alive include="Music,Home">
        <component :is="Component" />
      </keep-alive>
    </router-view>
    <MiniPlayer />
    <!-- 全局问候 Toast（无人物图的页面用，右上角渐入渐出） -->
    <GreetingToast />
    <!-- 移动端底部导航：窄视口才渲染，桌面端由 NavBar 承担同样职能 -->
    <MobileTabBar v-if="isNarrow" />
    <!-- 全局常驻 audio 元素：不随路由切换销毁，保证退出 Music 页面后歌曲继续播放 -->
    <audio id="global-audio" preload="metadata"></audio>
    <!-- 移动端竖屏遮罩：切进「玩」的页面时要求横屏（放在启动弹窗之前，见该组件里的 z-index 说明） -->
    <LandscapeGate />
    <!-- 存档选择界面（首次启动 / 切换角色） -->
    <SlotSelection v-if="saveSlots.showSelector" :first-run="saveSlots.currentSlotId == null" />
    <!-- 使用条款：首次启动强制同意（force 模式不可关闭），设置页可再次查看 -->
    <AgreementModal v-model="agreementVisible" mode="force" @accepted="onAgreementAccepted" />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useGoldStore } from './config/gold'
import { useInventoryStore, getBuffMultiplier, changeAffection } from './config/inventory'
import { useTasksStore } from './config/tasks'
import { useBackgroundStore } from './config/background'
import { useAudioSettingsStore } from './config/music'
import { useSaveSlotsStore } from './config/saveSlots'
import { useMultiplayerStore } from './config/multiplayer'
import { clearCurrentChat } from './services/chatHistory'
import MiniPlayer from './components/MiniPlayer.vue'
import GreetingToast from './components/GreetingToast.vue'
import GlobalBackground from './components/GlobalBackground.vue'
import SlotSelection from './components/SlotSelection.vue'
import AgreementModal from './components/AgreementModal.vue'
import MobileTabBar from './components/MobileTabBar.vue'
import LandscapeGate from './components/LandscapeGate.vue'
import { isNarrow } from './utils/device'
// 副作用导入：模块加载时就挂好「切进游戏页锁横屏 / 切出走人还原」的路由钩子。
// 遮罩组件内部也依赖它，这里显式导入是为了让钩子注册不依赖组件树求值顺序。
import './composables/useLandscape'
import { AGREEMENT_ACCEPTED_KEY } from './config/agreement'

const goldStore = useGoldStore()
const store = useInventoryStore()
const tasksStore = useTasksStore()
const bgStore = useBackgroundStore()
const audioStore = useAudioSettingsStore()
// 联机 store：只为「从后台回前台自动重连」挂一个监听（见 onVisibility）
const mp = useMultiplayerStore()

// 存档槽：同步确定当前槽位（首次无存档时显示选择界面）
const saveSlots = useSaveSlotsStore()
const initResult = saveSlots.syncInit()

// 使用条款：首次启动未同意则强制弹出，滚到底勾选后才能进入游戏
const agreementVisible = ref(localStorage.getItem(AGREEMENT_ACCEPTED_KEY) !== 'true')
const onAgreementAccepted = () => {
  localStorage.setItem(AGREEMENT_ACCEPTED_KEY, 'true')
}

if (initResult.needSelect) {
  // 全新玩家：先显示存档选择，待创建档位后 reload 再加载各 store
  saveSlots.showSelector = true
} else {
  goldStore.loadData()   // 先加载金币（旧存档迁移依赖此顺序）
  store.loadData()       // 加载本地存档（会自动迁移旧金币）
  tasksStore.loadData()  // 加载任务数据，避免其它页面 addStat 时以默认空状态覆盖已领取记录
  bgStore.loadData()     // 加载全局背景设置
  audioStore.init()      // 加载用户音量并应用到全局 audio（BGM）
}

// 行动点恢复：每 3 分钟恢复 1 点（乘「行动点恢复」加成倍率），上限 = 50 + 等级×10，
// 已满则不恢复；离线时按上次结算到现在的真实流逝时间补发
const ACTION_RECOVER_INTERVAL = 3 * 60 * 1000
const BASE_ACTION_POINT = 50
const ACTION_POINT_PER_LEVEL = 10 // 50 * 20% = 10
const LAST_RECOVER_KEY = 'player_action_recover_time'

// 读取当前等级（与 Home/notify 共享 localStorage）
function readLevel() {
  let level = 0
  try {
    const p = JSON.parse(localStorage.getItem('player_level_data') || '{}')
    if (typeof p.level === 'number') level = p.level
  } catch (e) {}
  return level
}

// 依据真实流逝时间结算行动点恢复（在线定时器与离线补发共用）
function applyRecovery() {
  const now = Date.now()
  const lastRaw = localStorage.getItem(LAST_RECOVER_KEY)
  // 首次运行：仅记录起点，无恢复
  if (!lastRaw) {
    localStorage.setItem(LAST_RECOVER_KEY, String(now))
    return
  }
  const last = Number(lastRaw)
  if (!Number.isFinite(last) || last <= 0) {
    localStorage.setItem(LAST_RECOVER_KEY, String(now))
    return
  }
  const elapsed = now - last
  // 不足一个恢复周期：保留剩余时间，不推进起点
  if (elapsed < ACTION_RECOVER_INTERVAL) return

  const cap = BASE_ACTION_POINT + readLevel() * ACTION_POINT_PER_LEVEL
  const bonus = store.actionBonus || 0
  const recover = store.actionRecover || 0
  // 剩余可恢复空间 = 上限 - 当前 = -(物品加成 + 恢复累计)
  const room = cap - (cap + bonus + recover)
  if (room <= 0) {
    // 已满或超上限，不恢复；推进起点，避免满值时累积追偿
    localStorage.setItem(LAST_RECOVER_KEY, String(now))
    return
  }
  const ticks = Math.floor(elapsed / ACTION_RECOVER_INTERVAL)
  const gainPerTick = Math.max(1, Math.round(getBuffMultiplier('ap')))
  const actual = Math.min(ticks * gainPerTick, room)
  if (actual > 0) store.recoverActionPoint(actual)
  // 结算后推进起点到当前时间（满值后不再累积）
  localStorage.setItem(LAST_RECOVER_KEY, String(now))
}

let recoverTimer = null
// 在线好感度：每在线 5 分钟 +1（享受「好感度增长」加成倍率）
const AFFECTION_INTERVAL = 5 * 60 * 1000
let affectionTimer = null

// 退出游戏（关闭窗口）时自动清空本次聊天原文，下次启动从问候语重新开始；长期记忆卡不受影响
const onAppExit = () => {
  clearCurrentChat()
}

// 手机切后台时系统会掐掉联机的 WebSocket；回到前台时自动重连，
// 用户视角就是「挂后台也没掉线」。具体重连逻辑在 multiplayer store 的 onAppVisible()。
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') mp.onAppVisible()
}

onMounted(() => {
  applyRecovery()  // 启动时补发离线期间恢复的行动点
  recoverTimer = setInterval(applyRecovery, ACTION_RECOVER_INTERVAL)
  affectionTimer = setInterval(() => changeAffection(1), AFFECTION_INTERVAL)
  window.addEventListener('beforeunload', onAppExit)
  window.addEventListener('pagehide', onAppExit)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onBeforeUnmount(() => {
  if (recoverTimer) clearInterval(recoverTimer)
  if (affectionTimer) clearInterval(affectionTimer)
  window.removeEventListener('beforeunload', onAppExit)
  window.removeEventListener('pagehide', onAppExit)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style>
/* 全局样式已在 main.css 中定义 */
</style>
