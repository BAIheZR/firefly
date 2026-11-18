<template>
  <nav class="nav-bar" :class="{ 'menu-open': showGameMenu }">
    <!-- 左侧：给木游戏入口（原头像位置） -->
    <div class="nav-left">
      <button
        type="button"
        class="game-fab"
        :class="{ open: showGameMenu }"
        title="给木"
        @click="toggleGameMenu"
        @mouseenter="emit('game-entry-hover')"
      >
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
          <button type="button" class="game-menu-item" disabled title="萤火夜话暂未开放">
            <img :src="wolfImg" alt="萤火夜话" class="menu-item-img" />
            <span>萤火夜话</span>
          </button>
        </div>
      </Transition>
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
        <i :class="btn.icon"></i>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import chessImg from '@/images/game/chess.png'
import wolfImg from '@/images/game/wolf/ly.png'

const router = useRouter()
const emit = defineEmits(['game-entry-hover'])

// = 给木：游戏入口 =
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

// = 右侧按钮 =
const rightButtons = ref([
  { key: 'notify', title: '通知', icon: 'fa-solid fa-bell', action: 'notify' },
  { key: 'music', title: '音乐播放器', icon: 'fa-solid fa-music', action: 'music' },
  { key: 'shop', title: '商店', icon: 'fa-solid fa-store', action: 'shop' },
  { key: 'menu', title: '菜单', icon: 'fa-solid fa-bars', action: 'menu' }
])

const handleClick = (btn) => {
  const routeMap = {
    notify: '/notify',
    music: '/music',
    shop: '/shop',
    menu: '/set'
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
