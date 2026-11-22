<template>
  <nav class="nav-bar">
    <!-- 线性图标精灵：24 网格 / 1.75 描边，统一视觉语言（方案 C） -->
    <svg width="0" height="0" class="icon-sprite" aria-hidden="true">
      <symbol id="ic-gamepad" viewBox="0 0 24 24">
        <rect x="2.5" y="7" width="19" height="10" rx="5" />
        <path d="M7 10.2v3.6M5.2 12h3.6" />
        <circle cx="16.4" cy="10.8" r=".95" fill="currentColor" stroke="none" />
        <circle cx="18.4" cy="13.4" r=".95" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="ic-chess" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        <circle cx="7.6" cy="7.6" r="1.7" fill="currentColor" stroke="none" />
        <circle cx="16.4" cy="16.4" r="1.7" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="ic-riddle" viewBox="0 0 24 24">
        <path d="M20.5 11.3a8.3 8.3 0 0 1-8.3 8.3H8.4L4.5 22v-4A8.3 8.3 0 1 1 20.5 11.3Z" />
        <path d="M9.9 9.5a2.25 2.25 0 1 1 3.2 2.1c-.7.34-1.1.85-1.1 1.55" />
        <circle cx="12" cy="15.4" r=".8" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="ic-moon" viewBox="0 0 24 24">
        <path d="M20.4 14.6A8.6 8.6 0 1 1 9.4 3.6a7 7 0 0 0 11 11Z" />
        <path d="M17.6 5.2v2.4M16.4 6.4h2.4" />
        <path d="M20.4 9v1.6M19.6 9.8H21.2" />
      </symbol>
      <symbol id="ic-bell" viewBox="0 0 24 24">
        <path d="M18 8.6a6 6 0 1 0-12 0c0 5-2.2 6.2-2.2 6.2h16.4S18 13.6 18 8.6Z" />
        <path d="M10.2 19.2a2 2 0 0 0 3.6 0" />
      </symbol>
      <symbol id="ic-music" viewBox="0 0 24 24">
        <path d="M9.2 17.6V5.4l10.4-1.9v12" />
        <circle cx="6.6" cy="18" r="2.6" />
        <circle cx="17" cy="16" r="2.6" />
      </symbol>
      <symbol id="ic-store" viewBox="0 0 24 24">
        <path d="M4.2 8h15.6l-1.2 11.1a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L4.2 8Z" />
        <path d="M9 8V6.6a3 3 0 0 1 6 0V8" />
      </symbol>
      <symbol id="ic-grid" viewBox="0 0 24 24">
        <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
      </symbol>
      <symbol id="ic-gear" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" />
      </symbol>
    </svg>

    <!-- 左侧：品牌字标 + 游乐场入口 -->
    <div class="nav-left">
      <div class="nav-brand">
        <span class="nav-brand-cn">萤养日记</span>
        <span class="nav-brand-en">Firefly Care Diary</span>
      </div>
      <div class="nav-give">
        <button
          type="button"
          class="game-fab"
          title="游乐场"
          @click="goPlay"
          @mouseenter="emit('game-entry-hover')"
        >
          <svg class="ic" aria-hidden="true"><use href="#ic-gamepad" /></svg>
          <span>游乐场</span>
        </button>
      </div>
    </div>

    <!-- 中间：时间 -->
    <div class="nav-center">
      <!-- 时间 -->
      <div class="stat-item time-item">
        <div class="stat-content">
          <div class="stat-time">{{ currentTime }}</div>
          <div class="stat-date">DATE {{ currentDate }}</div>
        </div>
      </div>
    </div>

    <!-- 右侧：功能按钮 -->
    <div class="nav-right">
      <div
        v-for="btn in rightButtons"
        :key="btn.key"
        class="nav-btn"
        :title="btn.title"
        @click="handleClick(btn)"
      >
        <svg class="ic" aria-hidden="true"><use :href="'#' + btn.icon" /></svg>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const emit = defineEmits(['game-entry-hover'])

// = 游乐场入口 =
const goPlay = () => {
  router.push('/play')
}

// = 当前时间 =
const now = ref(new Date())
let timer = null

const currentTime = computed(() => {
  const h = now.value.getHours()
  const m = now.value.getMinutes()
  return `${String(h).padStart(2, '0')}：${String(m).padStart(2, '0')}`
})

const currentDate = computed(() => {
  const y = now.value.getFullYear()
  const mo = now.value.getMonth() + 1
  const d = now.value.getDate()
  return `${y}/${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')}`
})

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  clearInterval(timer)
})

// = 右侧按钮 =（icon 即上方 SVG 精灵的 symbol id）
const rightButtons = ref([
  { key: 'notify', title: '日常', icon: 'ic-bell', action: 'notify' },
  { key: 'music', title: '音乐播放器', icon: 'ic-music', action: 'music' },
  { key: 'bag', title: '背包', icon: 'ic-store', action: 'bag' },
  { key: 'set', title: '设置', icon: 'ic-gear', action: 'set' }
])

const handleClick = (btn) => {
  const routeMap = {
    notify: '/notify',
    music: '/music',
    bag: '/bag',
    set: '/set'
  }
  const path = routeMap[btn.action]
  if (path) {
    router.push(path)
  } else {
    console.log(`暂无该页面: ${btn.action}`)
  }
}
</script>

<style scoped src="@/assets/styles/NavBar.css"></style>
