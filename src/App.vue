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
    <!-- 好感度变化飘字：任何地方调 changeAffection() 都会在这里飘一个 +N / -N。
         以前只有主页按住才看得到数字，玩家感受不到自己在变好 -->
    <div class="aff-float-layer">
      <TransitionGroup name="aff-float">
        <div
          v-for="f in affFloats"
          :key="f.id"
          class="aff-float"
          :class="{ 'is-minus': f.delta < 0 }"
        >
          <i class="fa-solid fa-heart"></i>
          {{ f.delta > 0 ? '+' : '' }}{{ f.delta }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useGoldStore } from './config/gold'
import { useInventoryStore, getBuffMultiplier, changeAffection, BASE_ACTION_POINT, ACTION_POINT_PER_LEVEL } from './config/inventory'
import { useTasksStore } from './config/tasks'
import { useBackgroundStore } from './config/background'
import { useAudioSettingsStore } from './config/music'
import { useSaveSlotsStore } from './config/saveSlots'
import { useMultiplayerStore } from './config/multiplayer'
import { clearCurrentChat } from './services/chatHistory'
import { playSfx } from './utils/sfx'
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
// BASE_ACTION_POINT / ACTION_POINT_PER_LEVEL 统一从 @/config/inventory 导入
// （原先 App / Chess / GuessWord / Home 各定义一份，改数值时容易漏改 —— 2026-10-09 收敛）
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
  // 可恢复空间 = 上限 − 当前。口径以 inventory.js:360 为准：
  //   「当前行动点 = cap + actionBonus + actionRecover」
  //   actionBonus 是买来的**永久上限扩展**（属于上限），actionRecover 是消耗后待恢复的余额。
  //   所以 上限 = cap + bonus、当前 = cap + bonus + recover → room = -recover。
  //   旧写法 `cap − (cap + bonus + recover)` 多减了一个 bonus：只要买过行动点加成物品，
  //   恢复空间就被那支加成吃掉，行动点永远回不满（2026-10-09 修）。
  //   拆成 max/current 两个中间量而不是直接写 -recover —— 让口径一眼可核对。
  const maxAction = cap + bonus
  const currentAction = cap + bonus + recover
  const room = maxAction - currentAction
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

//  好感度变化飘字 
// changeAffection() 里会 window.dispatchEvent('affection-change')，这里收下来飘一下。
// 做成全局的（而不是各页面自己搞）—— 好感度来源分散在聊天/游戏/签到/用物品里，
// 挨个页面加提示既重复又会漏（2026-10-09）
const affFloats = ref([])
let affFloatSeq = 0
const onAffectionChange = (e) => {
  const delta = Number(e?.detail?.delta) || 0
  if (!delta) return
  playSfx('heart') // 好感度变化配一声柔和的音
  const id = ++affFloatSeq
  affFloats.value.push({ id, delta })
  // 1.6s 后移除，跟 CSS 动画时长对齐
  setTimeout(() => {
    affFloats.value = affFloats.value.filter((x) => x.id !== id)
  }, 1600)
}

//  全局点击音 
// 用**一处事件委托**，而不是给几十个按钮各挂一次监听（那样既啰嗦又必然漏掉后加的按钮）。
// 只对「真的可点的控件」响 —— 选择器里带上项目自己的几个列表/卡片类名。
const CLICK_SFX_SELECTOR =
  'button, a, [role="button"], .nav-btn, .tab-item, .list-item, .item-card, .clothing-card, .game-menu-item'
const onGlobalClickSfx = (e) => {
  const el = e.target?.closest?.(CLICK_SFX_SELECTOR)
  if (!el) return
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return
  playSfx('click')
}

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
  window.addEventListener('affection-change', onAffectionChange)
  // 用 pointerdown 而不是 click：音效要跟手，"按下就响"比"抬起才响"手感好得多
  window.addEventListener('pointerdown', onGlobalClickSfx, { passive: true })
})
onBeforeUnmount(() => {
  if (recoverTimer) clearInterval(recoverTimer)
  if (affectionTimer) clearInterval(affectionTimer)
  window.removeEventListener('beforeunload', onAppExit)
  window.removeEventListener('pagehide', onAppExit)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('affection-change', onAffectionChange)
  window.removeEventListener('pointerdown', onGlobalClickSfx)
})
</script>

<style>
/* 全局样式已在 main.css 中定义 */

/*  好感度变化飘字（全局，任何页面都飘）  */
.aff-float-layer {
  position: fixed;
  right: 24px;
  top: 84px;              /* 避开顶部导航 */
  z-index: 4000;
  pointer-events: none;   /* 不挡任何点击 */
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.aff-float {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #e08fb0, #d1668c);
  box-shadow: 0 4px 14px rgba(209, 102, 140, 0.35);
  white-space: nowrap;
}
/* 掉好感用冷色，跟涨好感一眼区分开 */
.aff-float.is-minus {
  background: linear-gradient(135deg, #8a94a4, #6b7784);
  box-shadow: 0 4px 14px rgba(107, 119, 132, 0.3);
}
.aff-float-enter-active,
.aff-float-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.aff-float-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.92);
}
.aff-float-leave-to {
  opacity: 0;
  transform: translateY(-14px);
}
</style>
