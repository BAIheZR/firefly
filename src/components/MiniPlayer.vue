<template>
  <Transition name="mini-slide">
    <div
      v-if="visible"
      class="mini-player"
      :class="{ 'mini-player--home': isHome }"
      :style="posStyle"
      @pointerdown="onDragStart"
    >
      <div class="mini-cover" @click="onCoverClick" title="返回音乐页">
        <img v-if="musicStore.currentCover" :src="musicStore.currentCover" alt="cover" />
        <i v-else class="fa-solid fa-music"></i>
      </div>
      <div class="mini-info" @click="onCoverClick">
        <div class="mini-title">{{ musicStore.trackTitle || '未播放' }}</div>
        <div class="mini-sub">{{ musicStore.trackFile }}</div>
      </div>
      <div class="mini-controls">
        <button class="mini-btn" @click="musicStore.playPrev" title="上一首">
          <i class="fa-solid fa-backward-step"></i>
        </button>
        <button
          class="mini-btn mini-btn-play"
          @click="musicStore.togglePlay"
          :title="musicStore.isPlaying ? '暂停' : '播放'"
        >
          <MorphIcon :icon="musicStore.isPlaying ? Pause : Play" class="morph-icon" />
        </button>
        <button class="mini-btn" @click="musicStore.playNext" title="下一首">
          <i class="fa-solid fa-forward-step"></i>
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMusicStore } from '@/config/music'
import { MorphIcon } from 'morphicons/vue'
import { Play, Pause } from 'lucide'

const route = useRoute()
const router = useRouter()
const musicStore = useMusicStore()

const visible = computed(() => route.path !== '/music' && musicStore.hasTracks)
// 主页在移动端底部有一排操作按钮（挂机/聊天/调整 + 启动星穹铁道），
// 迷你播放器需要再往上让一层，否则两者直接压在一起
const isHome = computed(() => route.path === '/')

//  拖拽逻辑 
const posStyle = ref({})
let isDragging = false
let hasDragged = false
let dragStartX = 0
let dragStartY = 0
let elemStartX = 0
let elemStartY = 0

function onDragStart(e) {
  // 点击控制按钮区域不拖拽
  if (e.target.closest('.mini-controls')) return
  hasDragged = false
  isDragging = true
  const rect = e.currentTarget.getBoundingClientRect()
  dragStartX = e.clientX
  dragStartY = e.clientY
  elemStartX = rect.left
  elemStartY = rect.top
  // 用 pointer 事件而非 mouse：触屏上 mousemove 不会持续触发，拖动会「粘住」
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
  document.addEventListener('pointercancel', onDragEnd)
  e.preventDefault()
}

function onDragMove(e) {
  if (!isDragging) return
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true
  let newX = elemStartX + dx
  let newY = elemStartY + dy
  // 约束在视口内（移动端底部要避开 TabBar，否则会被它盖住）
  const el = document.querySelector('.mini-player')
  const w = el ? el.offsetWidth : 280
  const h = el ? el.offsetHeight : 64
  const bottomGuard = bottomReserve()
  newX = Math.max(4, Math.min(window.innerWidth - w - 4, newX))
  newY = Math.max(4, Math.min(window.innerHeight - h - bottomGuard, newY))
  posStyle.value = { left: newX + 'px', top: newY + 'px', right: 'auto', bottom: 'auto' }
}

// 底部保留区：窄视口下有 MobileTabBar，拖动时不能把播放器塞到它下面
function bottomReserve() {
  if (typeof window === 'undefined') return 4
  const narrow = window.innerWidth <= 768
  const tabbar = 56 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0)
  return narrow ? tabbar + 4 : 4
}

function onDragEnd() {
  isDragging = false
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
}

function onCoverClick() {
  if (hasDragged) return
  router.push('/music')
}

onBeforeUnmount(() => {
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('pointercancel', onDragEnd)
})
</script>

<style scoped>
.mini-player {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(63, 169, 138, 0.3);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  z-index: 9998;
  cursor: grab;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.mini-player:active {
  cursor: grabbing;
}
.mini-player:hover {
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.22);
  border-color: rgba(63, 169, 138, 0.5);
}

.mini-cover {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(63, 169, 138, 0.15), rgba(63, 169, 138, 0.05));
  border: 1px solid rgba(63, 169, 138, 0.25);
  cursor: pointer;
  transition: transform 0.2s ease;
}
.mini-cover:hover {
  transform: scale(1.05);
}
.mini-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mini-cover i {
  font-size: 18px;
  color: #3FA98A;
}

.mini-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 180px;
  cursor: pointer;
}
.mini-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s ease;
}
.mini-info:hover .mini-title {
  color: #5BC9A0;
}
.mini-sub {
  font-size: 10px;
  color: #aaa;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.mini-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(63, 169, 138, 0.2);
  background: rgba(255, 255, 255, 0.6);
  color: #8a6a20;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  transition: all 0.2s ease;
}
.mini-btn:hover {
  transform: translateY(-2px) scale(1.08);
  color: #5BC9A0;
  border-color: #3FA98A;
  box-shadow: 0 3px 10px rgba(63, 169, 138, 0.25);
}
.mini-btn-play {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #3FA98A, #5BC9A0);
  border: none;
  color: #fff;
  font-size: 13px;
  box-shadow: 0 3px 12px rgba(91, 201, 160, 0.3);
}
.mini-btn-play:hover {
  color: #fff;
  background: linear-gradient(135deg, #5BC9A0, #2E8B6F);
  box-shadow: 0 5px 16px rgba(91, 201, 160, 0.45);
}

/* 进出动画 */
.mini-slide-enter-active,
.mini-slide-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.mini-slide-enter-from,
.mini-slide-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

/* ====
   移动端
   ==== */

/* 拖动依赖 pointermove 持续触发；触屏上若不禁用浏览器自身的滚动接管，
   手指一移动就被判定为滚动，pointermove 会中断，表现为「拖一下就断」 */
.mini-player {
  touch-action: none;
}

@media (max-width: 768px) {
  .mini-player {
    left: 10px;
    right: 10px;
    bottom: calc(var(--tabbar-h, 56px) + 10px);
    padding: 8px 10px;
    gap: 8px;
    border-radius: 14px;
    /* 移动端已全局关闭毛玻璃，这里给不透明底色保证与控制按钮的对比度 */
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  }

  /* 主页：让出底部那排操作按钮的高度 */
  .mini-player--home {
    bottom: calc(var(--tabbar-h, 56px) + 68px);
  }

  .mini-info {
    flex: 1 1 auto;
    max-width: none;
  }

  .mini-cover {
    width: 40px;
    height: 40px;
  }

  /* 触控目标放大：默认 30px 在手指下偏小 */
  .mini-btn {
    width: 36px;
    height: 36px;
    font-size: 12px;
  }

  .mini-btn-play {
    width: 44px;
    height: 44px;
    font-size: 15px;
  }

  /* 无悬停设备上 hover 效果会「粘住」，统一还原为静态 */
  .mini-player:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    border-color: rgba(63, 169, 138, 0.3);
  }

  .mini-btn:hover {
    transform: none;
    color: #8a6a20;
    border-color: rgba(63, 169, 138, 0.2);
    box-shadow: none;
  }

  .mini-btn-play:hover {
    color: #fff;
    background: linear-gradient(135deg, #3fa98a, #5bc9a0);
    box-shadow: 0 3px 12px rgba(91, 201, 160, 0.3);
  }

  .mini-cover:hover {
    transform: none;
  }
}

/* 横屏矮视口：进一步压缩，避免播放器占掉近半屏高 */
@media (max-width: 768px) and (max-height: 460px) {
  .mini-player {
    padding: 6px 8px;
  }
  .mini-cover {
    width: 34px;
    height: 34px;
  }
  .mini-btn {
    width: 32px;
    height: 32px;
  }
  .mini-btn-play {
    width: 38px;
    height: 38px;
  }
  .mini-player--home {
    bottom: calc(var(--tabbar-h, 56px) + 58px);
  }
}
</style>
