<template>
  <div v-if="show" class="lg-mask">
    <div class="lg-inner">
      <div class="lg-phone"><i class="fa-solid fa-mobile-screen"></i></div>

      <div class="lg-title">请把手机横过来</div>
      <div class="lg-sub">《{{ title }}》是横屏玩法，竖屏放不下</div>

      <!-- 能锁方向的设备（Android Chrome）：按钮是唯一能真正锁死方向的出口 -->
      <button v-if="canLock" class="lg-btn is-primary" @click="onEnter">
        <i class="fa-solid fa-rotate"></i> 横屏进入
      </button>
      <!-- iOS Safari 没有 screen.orientation.lock，只能靠用户自己转 -->
      <div v-else class="lg-tip">
        <i class="fa-solid fa-hand-pointer"></i>
        这台设备不支持自动转屏，请手动把手机转成横向
      </div>
      <!-- 点了「横屏进入」却仍是竖屏 = 这台设备/浏览器不让锁方向
           （微信等 webview 会拦全屏、部分平板受权限策略限制）。
           这种情况必须把话说明白并指出出路，否则按钮会变成一个点了没反应的死按钮，
           用户就被永久困在遮罩里了。 -->
      <div v-if="canLock && lockFailed" class="lg-tip">
        <i class="fa-solid fa-triangle-exclamation"></i>
        已尝试自动横屏，但这台设备/浏览器不允许锁定方向。请把手机<b>手动</b>转成横向即可继续；
        若转了还是进不去，请点下面的「先回去」。
      </div>

      <button class="lg-btn is-ghost" @click="onBack">
        <i class="fa-solid fa-arrow-left"></i> 先回去
      </button>
    </div>
  </div>
</template>

<script setup>
//  横屏遮罩
//
// 只做一件事：移动端竖屏 + 当前页面标记了 meta.landscape 时，盖住屏幕提示用户转横向。
// 方向的锁定与还原全在 composables/useLandscape.js 里，这里只管提示与那一次点击。
//
// ★ 桌面端（含 Electron）永远不会出现：isMobileDevice 为 false。
//   窄窗口被拖成竖条也不会误触发。
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { canLockOrientation, isMobileDevice, isPortrait } from '@/utils/device'
import { enterLandscapeByGesture } from '@/composables/useLandscape'

const route = useRoute()
const router = useRouter()

const show = computed(() => isMobileDevice && isPortrait.value && !!route.meta.landscape)
const title = computed(() => route.meta.landscapeTitle || '这个页面')
// 常量，不是响应式的：能力探测只在启动时做一次
const canLock = canLockOrientation
// 点了「横屏进入」之后到底锁上没有 —— 没锁上就换提示文案，别留死按钮
const lockFailed = ref(false)

async function onEnter() {
  lockFailed.value = false
  enterLandscapeByGesture()
  // 浏览器切方向是异步的，留一点时间让它生效；
  // 800ms 后仍是竖屏，判定为「这台设备锁不上」（多半是 webview 拦了全屏）
  await new Promise((resolve) => setTimeout(resolve, 800))
  if (isPortrait.value) lockFailed.value = true
}

// 不能把用户困在遮罩里 —— 竖屏时也得有路可走。
// hash 路由冷启动（PWA 直接打开 /chess）时 history 里只有一个条目，back() 会退出应用，
// 所以那种情况直接回主页。
function onBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}
</script>

<style scoped>
/* z-index 9999：要盖住游戏页里最高的层（chess/werewolf 的结算遮罩也是 9999），
   同时**不能**更高 —— App.vue 里首次启动的存档选择与条款弹窗同为 9999 且排在后面，
   靠 DOM 顺序压住本遮罩，保证那两步流程不会被横屏提示挡掉。 */
.lg-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(160deg, #1F5C48 0%, #2D7A5F 55%, #3FA98A 100%);
  color: #FBF8F0;
  overflow: hidden;
  touch-action: none;
}

.lg-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 320px;
}

.lg-phone {
  width: 68px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22px;
  background: rgba(251, 248, 240, 0.16);
  border: 1px solid rgba(251, 248, 240, 0.28);
  margin-bottom: 18px;
}
/* 手机图标转 90° —— 一眼看出「要横过来」 */
.lg-phone i {
  font-size: 30px;
  transform: rotate(90deg);
  animation: lg-tilt 2.4s ease-in-out infinite;
}

@keyframes lg-tilt {
  0%, 100% { transform: rotate(90deg); }
  50% { transform: rotate(0deg); }
}

.lg-title {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.lg-sub {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(251, 248, 240, 0.78);
}

.lg-btn {
  margin-top: 18px;
  min-width: 176px;
  min-height: 44px;
  padding: 0 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, background 0.15s, border-color 0.15s;
}
.lg-btn:active { transform: scale(0.97); }

.lg-btn.is-primary {
  border: none;
  background: #FBF8F0;
  color: #1F5C48;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
}

.lg-btn.is-ghost {
  margin-top: 10px;
  border: 1px solid rgba(251, 248, 240, 0.38);
  background: transparent;
  color: rgba(251, 248, 240, 0.9);
  font-weight: 500;
}

.lg-tip {
  margin-top: 18px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(251, 248, 240, 0.12);
  font-size: 13px;
  line-height: 1.6;
  color: rgba(251, 248, 240, 0.88);
}

/* 横屏是真的矮（iPhone 横屏可用高度约 390px），把间距收紧 */
@media (orientation: landscape) and (max-height: 460px) {
  .lg-phone { margin-bottom: 12px; width: 56px; height: 56px; }
  .lg-phone i { font-size: 24px; }
  .lg-btn { margin-top: 12px; min-height: 40px; }
}
</style>
