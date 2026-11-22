<template>
  <!-- 移动端底部导航栏。仅在窄视口渲染；桌面端由顶部 NavBar 承担同样职能。
       之所以做成全局组件（挂载在 App.vue）而不是加进 NavBar.vue：
       NavBar 只在 Home / Idle 使用，其余页面各有自己的顶部返回栏，
       若把 TabBar 放在 NavBar 里，其它页面在手机上就没有底部导航了。 -->
  <nav class="tab-bar" role="navigation" aria-label="主导航">
    <!-- 线性图标精灵：与桌面导航同一套（24 网格 / 1.75 描边） -->
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <symbol id="tb-home" viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z"/></symbol>
      <symbol id="tb-bell" viewBox="0 0 24 24"><path d="M18 8.6a6 6 0 1 0-12 0c0 5-2.2 6.2-2.2 6.2h16.4S18 13.6 18 8.6Z"/><path d="M10.2 19.2a2 2 0 0 0 3.6 0"/></symbol>
      <symbol id="tb-music" viewBox="0 0 24 24"><path d="M9.2 17.6V5.4l10.4-1.9v12"/><circle cx="6.6" cy="18" r="2.6"/><circle cx="17" cy="16" r="2.6"/></symbol>
      <symbol id="tb-bag" viewBox="0 0 24 24"><path d="M5 8h14l-1.1 11a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6.6a3 3 0 0 1 6 0V8"/></symbol>
      <symbol id="tb-play" viewBox="0 0 24 24"><rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M7 10.2v3.6M5.2 12h3.6"/></symbol>
      <symbol id="tb-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/></symbol>
    </svg>
    <button
      v-for="btn in buttons"
      :key="btn.key"
      type="button"
      class="tab-item"
      :class="{ active: isActive(btn) }"
      :aria-current="isActive(btn) ? 'page' : undefined"
      @click="go(btn)"
    >
      <svg class="ic" aria-hidden="true"><use :href="'#' + btn.icon" /></svg>
      <span class="tab-text">{{ btn.text }}</span>
      <span class="tab-dot" aria-hidden="true"></span>
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isNarrow } from '@/utils/device'

const route = useRoute()
const router = useRouter()

// 与 NavBar 右侧按钮同一份入口；比桌面端多一个「主页」（移动端没有顶部 logo 可点）
const buttons = [
  { key: 'home', text: '主页', icon: 'tb-home', path: '/' },
  { key: 'daily', text: '日常', icon: 'tb-bell', path: '/notify' },
  { key: 'bag', text: '背包', icon: 'tb-bag', path: '/bag' },
  { key: 'play', text: '游乐场', icon: 'tb-play', path: '/play' },
  { key: 'set', text: '设置', icon: 'tb-gear', path: '/set' },
]

// 高亮判定：主页精确匹配（否则任何路径都会点亮它），其余用前缀匹配，子页面由各自返回栏导航
function isActive(btn) {
  if (btn.path === '/') return route.path === '/'
  return route.path === btn.path || route.path.startsWith(btn.path + '/')
}

function go(btn) {
  if (isActive(btn)) return
  router.push(btn.path)
}

// 暴露给模板用（保留 isNarrow 引用，便于后续按需做更细的分支）
const narrow = computed(() => isNarrow.value)
</script>

<style scoped>
.tab-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 900;
  display: flex;
  align-items: stretch;
  /* 底部安全区：全面屏的手势条高度，避免按钮被盖住 */
  padding-bottom: var(--safe-bottom, 0px);
  padding-left: var(--safe-left, 0px);
  padding-right: var(--safe-right, 0px);
  background: rgba(251, 248, 240, 0.96);
  border-top: 1px solid rgba(176, 138, 74, 0.28);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);
}

/* 移动端已在 main.css 里全局关掉毛玻璃，这里不再写 backdrop-filter，
   避免被 !important 覆盖后留下无用声明。深色模式单独覆盖底色。 */
:global(html.dark) .tab-bar {
  background: rgba(24, 26, 25, 0.96);
  border-top-color: rgba(63, 169, 138, 0.35);
}

.tab-item {
  flex: 1 1 0;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  /* 56px 减去底部安全区，保证整条高度稳定 */
  height: 56px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--c-text-sub, #6b5a40);
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  /* 去掉移动端点击高亮与长按菜单 */
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  transition: color 0.18s ease;
}

/* 统一线性图标：颜色跟 currentColor 走 */
.tab-item .ic {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.tab-item.active {
  color: #b08a4a;
  font-weight: 600;
}

.tab-item.active .ic {
  transform: translateY(-1px) scale(1.06);
}

:global(html.dark) .tab-item {
  color: #9aa9a0;
}
:global(html.dark) .tab-item.active {
  color: #d8b87a;
}

/* 选中指示：顶部一小段圆角条，比整块底色更轻，不干扰图标识别 */
.tab-dot {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 22px;
  height: 2.5px;
  border-radius: 0 0 3px 3px;
  background: #b08a4a;
  transition: transform 0.2s ease;
}

.tab-item.active .tab-dot {
  transform: translateX(-50%) scaleX(1);
}

:global(html.dark) .tab-dot {
  background: #d8b87a;
}

/* 文字在极窄屏（<340px）隐藏，只留图标，避免中文被压断行 */
@media (max-width: 340px) {
  .tab-text {
    display: none;
  }
}
</style>
