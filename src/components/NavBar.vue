<template>
  <nav class="nav-bar">
    <!-- 左侧：用户头像 -->
    <div class="nav-left">
      <div class="avatar-wrapper" @click="handleAvatarClick">
        <img v-if="avatarData" :src="avatarData" class="avatar-img" />
        <i v-else class="fa-solid fa-user avatar-icon"></i>
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
        <i :class="btn.icon"></i>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()
// ====== 头像 ======
const avatarData = ref(localStorage.getItem('avatarData') || '')
onMounted(() => {
  avatarData.value = localStorage.getItem('avatarData') || ''
})

// ====== 当前时间 ======
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

// ====== 右侧按钮 ======
const rightButtons = ref([
  { key: 'notify', title: '通知', icon: 'fa-solid fa-bell', action: 'notify' },
  { key: 'music', title: '音乐播放器', icon: 'fa-solid fa-music', action: 'music' },
  { key: 'shop', title: '商店', icon: 'fa-solid fa-store', action: 'shop' },
  { key: 'menu', title: '菜单', icon: 'fa-solid fa-bars', action: 'menu' }
])

const handleAvatarClick = () => {
  console.log('点击了头像')
}

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