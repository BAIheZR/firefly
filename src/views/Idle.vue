<template>
  <div class="idle-page">
    <NavBar />
    <div class="idle-body">
      <div class="idle-card">
        <!-- 右上角关闭按钮：停止挂机并返回首页 -->
        <button class="idle-close" @click="closeIdle" title="停止挂机并返回首页">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <h2 class="idle-title">
          <i class="fa-solid fa-hourglass-half"></i>
          挂机ing。。。
        </h2>
        <p class="idle-desc">挂机页面ing...</p>

        <!-- 图片跳动计时（5 张图轮流，每秒切换；时间缩小到顶部中间小位置） -->
        <div class="idle-timer" :class="{ running: isRunning }">
          <div class="timer-mini">
            <i class="fa-solid fa-clock"></i>
            {{ formatDuration(elapsedMs) }}
          </div>
          <div class="timer-img-wrap">
            <img
              v-for="(img, i) in idleImages"
              :key="i"
              :src="img"
              alt="挂机中"
              class="idle-img"
              :class="{
                active: isRunning && i === currentImgIndex,
                bouncing: isRunning && i === currentImgIndex && i < 4,
                scaling: isRunning && i === currentImgIndex && i === 4
              }"
            />
          </div>
          <div class="timer-sub">
            <i :class="isRunning ? 'fa-solid fa-circle play-dot' : 'fa-solid fa-circle pause-dot'"></i>
            {{ isRunning ? '挂机中' : '已停止' }}
          </div>
        </div>

        <!-- 奖励：领取按钮位于待领取与累计获得中间 -->
        <div class="idle-rewards">
          <div class="reward-item highlight">
            <span class="reward-label">待领取</span>
            <span class="reward-value">+{{ pendingGold }} 金币</span>
          </div>
          <button class="btn btn-collect" @click="collect" :disabled="pendingGold <= 0">
            <i class="fa-solid fa-hand-holding-dollar"></i>
            领取奖励 (+{{ pendingGold }})
          </button>
          <div class="reward-item">
            <span class="reward-label">累计获得</span>
            <span class="reward-value">{{ totalEarnedGold }} 金币</span>
          </div>
        </div>

        <!-- 开始挂机（领取奖励按钮已上移到奖励区中间） -->
        <div v-if="!isRunning" class="idle-actions">
          <button class="btn btn-start" @click="startIdle">
            <i class="fa-solid fa-play"></i>
            开始挂机
          </button>
        </div>

        <div v-if="lastTip" class="idle-tip">
          <i class="fa-solid fa-circle-info"></i>
          {{ lastTip }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { useGoldStore } from '@/config/gold'
import { getBuffMultiplier } from '@/config/inventory'
import idleImg1 from '@/images/ldle/1.png'
import idleImg2 from '@/images/ldle/2.png'
import idleImg3 from '@/images/ldle/3.png'
import idleImg4 from '@/images/ldle/4.png'
import idleImg5 from '@/images/ldle/5.png'

// 挂机跳动图片（每秒切换一张，循环 1→5）
const idleImages = [idleImg1, idleImg2, idleImg3, idleImg4, idleImg5]

const route = useRoute()
const router = useRouter()
const goldStore = useGoldStore()

const IDLE_KEY = 'idle_game_state'
// 每 5 秒产出 1 金币（不在 UI 上显示每秒速率）
const EARN_INTERVAL_MS = 5 * 1000
const EARN_PER_INTERVAL = 1
const TICK_MS = 200

// 挂机状态
const isRunning = ref(false)
const elapsedMs = ref(0)
const lastBatchMs = ref(0)  // 已批量结算的毫秒数
const pendingGold = ref(0)
const totalEarnedGold = ref(0)
const lastTip = ref('')

// 当前跳动图片索引：第 1 秒 = 1.png，第 2 秒 = 2.png ... 第 5 秒 = 5.png，之后循环
// 第 0 秒（刚启动 < 1000ms）返回 -1，不激活任何图
const currentImgIndex = computed(() => {
  const sec = Math.floor(elapsedMs.value / 1000)
  if (sec < 1) return -1
  return (sec - 1) % idleImages.length
})

let tickTimer = null
let lastTickAt = 0

// 时间格式化：HH:MM:SS
const formatDuration = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// 结算批量奖励：每 EARN_INTERVAL_MS 累加 1 金币到待领取池
const settleBatches = () => {
  while (elapsedMs.value - lastBatchMs.value >= EARN_INTERVAL_MS) {
    lastBatchMs.value += EARN_INTERVAL_MS
    pendingGold.value += EARN_PER_INTERVAL
  }
}

// 定时心跳：仅在 isRunning 时累加真实经过的毫秒
const tick = () => {
  if (!isRunning.value) return
  const now = Date.now()
  const delta = now - lastTickAt
  lastTickAt = now
  elapsedMs.value += delta
  settleBatches()
}

// 持久化（挂机永远以"已停止"状态保存，加载时不会自动运行）
const saveState = () => {
  localStorage.setItem(IDLE_KEY, JSON.stringify({
    isRunning: false,
    elapsedMs: elapsedMs.value,
    lastBatchMs: lastBatchMs.value,
    pendingGold: pendingGold.value,
    totalEarnedGold: totalEarnedGold.value,
  }))
}

const loadState = () => {
  const saved = localStorage.getItem(IDLE_KEY)
  if (!saved) return
  try {
    const state = JSON.parse(saved)
    isRunning.value = false
    elapsedMs.value = state.elapsedMs ?? 0
    lastBatchMs.value = state.lastBatchMs ?? 0
    pendingGold.value = state.pendingGold ?? 0
    totalEarnedGold.value = state.totalEarnedGold ?? 0
  } catch (e) {
    console.warn('读取挂机状态失败', e)
  }
}

// 开始挂机：重置计时，从 0 开始
const startIdle = () => {
  elapsedMs.value = 0
  lastBatchMs.value = 0
  isRunning.value = true
  lastTickAt = Date.now()
  if (tickTimer) clearInterval(tickTimer)
  tickTimer = setInterval(tick, TICK_MS)
  // lastTip.value = '挂机已开始，每 5 秒获得 1 金币'
  saveState()
}

// 停止挂机（保留待领取金币）
const stopIdle = () => {
  if (!isRunning.value) return
  settleBatches()
  isRunning.value = false
  if (tickTimer) clearInterval(tickTimer)
  tickTimer = null
  // lastTip.value = '挂机已停止，待领取金币保留，记得领取'
  saveState()
}

// 关闭按钮：停止挂机并返回首页
const closeIdle = () => {
  stopIdle()
  router.push('/')
}

// 领取奖励（享受「金币获取」永久加成倍率，由 goldStore.addGold 内部统一应用）
const collect = () => {
  settleBatches()
  if (pendingGold.value <= 0) {
    lastTip.value = '当前暂无可领取奖励，多挂一会儿再来吧'
    return
  }
  const amount = pendingGold.value
  const ok = goldStore.addGold(amount, '挂机奖励')
  if (!ok) {
    lastTip.value = '领取失败，请稍后再试'
    return
  }
  // addGold 内部已乘金币加成倍率，这里同步算出实际获得量用于显示，避免显示不一致
  const actual = Math.round(amount * getBuffMultiplier('gold'))
  totalEarnedGold.value += actual
  pendingGold.value = 0
  lastTip.value = `已领取 +${actual} 金币！`
  saveState()
}

// 关闭窗口前确保停止
const onBeforeUnload = () => {
  if (isRunning.value) {
    stopIdle()
  }
}

onMounted(() => {
  goldStore.loadData()
  loadState()
  window.addEventListener('beforeunload', onBeforeUnload)
  // 从 Home 点击「挂机时间」按钮跳转过来时，带 autoStart=1，自动开始挂机
  if (route.query.autoStart === '1') {
    startIdle()
    // 清除 query，避免刷新页面时重复自动启动
    router.replace({ path: '/idle' })
  }
})

onBeforeUnmount(() => {
  if (isRunning.value) stopIdle()
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>


<style scoped src="@/assets/styles/Idle.css"></style>
