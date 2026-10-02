import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/styles/main.css'
import { createPinia } from 'pinia'
import { watch } from 'vue'
import { installErrorReporting } from '@/services/errorReport'
import { installDisableCopy } from '@/utils/disableCopy'
import { isMobileDevice, isTouchDevice, isNarrow } from '@/utils/device'

// 把设备判定结果挂到 <html> 上供 CSS 走降级分支：性能降级看设备本身（桌面端拖窄不该触发），布局看视口宽度
const rootEl = document.documentElement
if (isMobileDevice) rootEl.classList.add('is-mobile')
if (isTouchDevice) rootEl.classList.add('is-touch')

// is-narrow 要跟随窗口变化（桌面拖窄窗口 / 手机横竖屏切换），
// 否则只在启动时判定一次，旋转屏幕后类名就跟实际视口对不上了
watch(isNarrow, (narrow) => rootEl.classList.toggle('is-narrow', narrow), { immediate: true })

// 全站复制防护：默认禁止复制/剪切/右键/选中，.allow-copy 白名单放行
installDisableCopy()

const app = createApp(App)
// PCL 风格错误上报：JS 错误/资源加载失败/Vue 错误 → 主进程日志与错误弹窗
installErrorReporting(app)
const pinia = createPinia()
app.use(router)
app.use(ElementPlus)
app.use(pinia)
app.mount('#app')