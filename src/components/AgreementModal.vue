<template>
  <Teleport to="body">
    <div v-if="modelValue" class="agree-mask" :class="{ 'force-mode': mode === 'force' }" @click.self="onMaskClick">
      <div class="agree-panel" @click.stop>
        <div class="agree-header">
          <div class="agree-title">
            <i class="fa-solid fa-file-contract"></i>
            <span>「萤光纪游」软件使用同意条款</span>
          </div>
          <button v-if="mode === 'view'" class="agree-close" title="关闭" @click="close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- 数据存储一览：让用户在同意前一眼看清「存什么 / 存在哪 / 做什么用 / 怎么删」 -->
        <div class="agree-summary">
          <button class="agree-summary-head" @click="summaryOpen = !summaryOpen">
            <i class="fa-solid fa-shield-halved"></i>
            <span>数据存储一览</span>
            <i class="fa-solid" :class="summaryOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
          </button>
          <ul v-show="summaryOpen" class="agree-summary-list">
            <li><b>存什么</b>：用户名与头像、游戏进度（等级 / 好感度 / 行动点 / 金币 / 背包 / 签到）、AI 对话的长期记忆卡片、AI 服务配置（含 API Key）、多存档槽。</li>
            <li><b>存在哪</b>：只存在您的本机设备（桌面端为 %APPDATA%\Roaming\yingguangjiyou，浏览器端为浏览器本地存储），不上传开发者。</li>
            <li><b>做什么用</b>：仅用于实现软件的各项本地功能、维持您的游戏进度与对话连续性。</li>
            <li><b>怎么删</b>：设置页「清空所有数据」可一次性清除全部本地数据（含存档文件与图片）；也可直接删除上述数据目录。</li>
          </ul>
        </div>

        <div ref="scrollEl" class="agree-body" @scroll="onScroll" @click="onBodyClick">
          <div class="agree-text" v-html="renderedText"></div>
        </div>

        <div class="agree-footer">
          <label class="agree-check agree-key-check" :class="{ disabled: !reachedBottom }">
            <input
              type="checkbox"
              v-model="keyChecked"
              :disabled="!reachedBottom"
            />
            <span>我已特别阅读并同意第七章（免责声明与责任限制）</span>
          </label>
          <label class="agree-check" :class="{ disabled: !reachedBottom }">
            <input
              type="checkbox"
              v-model="checked"
              :disabled="!reachedBottom"
              @change="onCheckboxChange"
            />
            <span>我已阅读并同意《使用同意条款（含免责声明）》</span>
            <em v-if="!reachedBottom" class="agree-hint">请先滚动阅读至条款末尾</em>
          </label>
          <div class="agree-actions">
            <!-- 不同意：仅在首次强制同意模式下出现（查看模式下撤销同意走「取消勾选」路径） -->
            <button v-if="mode === 'force'" class="agree-btn ghost" @click="onDecline">不同意</button>
            <button
              class="agree-btn primary"
              :class="{ active: canConfirm }"
              :disabled="!canConfirm"
              @click="onConfirm"
            >
              同意并继续
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { AGREEMENT_TEXT } from '@/config/agreement'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // force：首次启动强制同意，不可关闭；view：设置页查看，可关闭
  mode: { type: String, default: 'force' },
  // 查看模式下是否已同意（决定勾选框初始是否选中）
  preChecked: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'accepted', 'uncheck'])

const text = AGREEMENT_TEXT
const scrollEl = ref(null)
const reachedBottom = ref(false)
const checked = ref(false)
// 关键章节（第七章免责声明）单独确认
const keyChecked = ref(false)
// 数据存储一览面板（默认展开，用户可收起）
const summaryOpen = ref(true)

const canConfirm = computed(() => reachedBottom.value && checked.value && keyChecked.value)

// 将文本中的 URL 链接和文件路径转换为可点击的 HTML
const renderedText = computed(() => {
  let html = text
  // 关键章节（第七章免责声明）加粗变色高亮
  html = html.replace(/(七、免责声明与责任限制[\s\S]*?)(?=\n八、)/, (m) => {
    return `<div class="agree-key-section">${m}</div>`
  })
  // URL → 可点击链接（系统浏览器打开）
  html = html.replace(/(https?:\/\/[^\s<>"'\u3000，。、；]+)/g, (url) => {
    return `<a class="agree-link" href="${url}" target="_blank" rel="noopener">${url}</a>`
  })
  // Windows 路径（%APPDATA%\... 形式）→ 可点击复制
  html = html.replace(/(%APPDATA%\\[^\s<>"'\u3000，。、；]+)/g, (p) => {
    return `<span class="agree-path" data-path="${p}" title="点击复制路径">${p}</span>`
  })
  return html.replace(/\n/g, '<br>')
})

// 点击事件委托：链接跳转、路径复制
function onBodyClick(e) {
  const link = e.target.closest('.agree-link')
  if (link) {
    e.preventDefault()
    const url = link.getAttribute('href')
    if (window.electronAPI?.isElectron) {
      window.electronAPI.openExternal?.(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    return
  }
  const pathEl = e.target.closest('.agree-path')
  if (pathEl) {
    const p = pathEl.getAttribute('data-path')
    if (p && navigator.clipboard) {
      navigator.clipboard.writeText(p).then(() => {
        ElMessage.success(`已复制路径：${p}`)
      }).catch(() => {
        ElMessage.warning('复制失败，请手动选择复制')
      })
    }
  }
}

// 检测是否滚动到了最底部
function checkBottom() {
  const el = scrollEl.value
  if (!el) return
  // 容差 4px，兼容不同浏览器的取整
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 4) {
    reachedBottom.value = true
  }
}

function onScroll() {
  if (!reachedBottom.value) checkBottom()
}

function onConfirm() {
  if (!canConfirm.value) return
  emit('accepted')
  emit('update:modelValue', false)
}

// 拒绝：必须给出「不同意」的出口，不能把用户锁在弹框里只能同意。
// 本软件的本地存储均为实现核心功能所必需（存档、进度等），因此"不同意"等同于停止使用，
// 而非降级使用 —— 这里明确告知后果，并让用户自行选择退出或返回继续阅读。
function onDecline() {
  ElMessageBox.confirm(
    '不同意本条款将无法使用本软件。您可以退出软件，或返回继续阅读后再决定。退出后，您可自行删除本机数据目录以清除全部本地数据。',
    '不同意条款',
    {
      confirmButtonText: '退出软件',
      cancelButtonText: '继续阅读',
      type: 'warning',
    }
  )
    .then(() => {
      if (window.electronAPI?.quitApp) {
        window.electronAPI.quitApp()
      } else {
        window.close()
      }
    })
    .catch(() => {})
}

function onMaskClick() {
  // force 模式不允许点遮罩关闭；view 模式允许
  if (props.mode === 'view') close()
}

// 查看模式下：若已预勾选，用户取消勾选时弹确认框，确认后才真正取消（由父组件移除同意标记并退出游戏）
function onCheckboxChange(e) {
  if (props.mode === 'view' && props.preChecked && !e.target.checked) {
    ElMessageBox.confirm(
      '确定要取消勾选吗？若取消勾选则会强制退出游戏。',
      '取消同意条款',
      {
        confirmButtonText: '确认取消',
        cancelButtonText: '保留勾选',
        type: 'warning',
      }
    )
      .then(() => {
        // 用户确认取消勾选，通知父组件移除同意标记并退出游戏
        emit('uncheck')
      })
      .catch(() => {
        // 用户取消操作，恢复勾选
        checked.value = true
      })
  }
}

function close() {
  emit('update:modelValue', false)
}

// 弹窗打开时重置状态，并检测内容是否本就无需滚动（短文本直接算到底）
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      reachedBottom.value = false
      // 查看模式且已同意：两个勾选框默认选中并直接解锁，允许取消勾选
      if (props.mode === 'view' && props.preChecked) {
        checked.value = true
        keyChecked.value = true
        reachedBottom.value = true
      } else {
        checked.value = false
        keyChecked.value = false
      }
      nextTick(() => {
        checkBottom()
      })
    }
  }
)
</script>

<style scoped>
.agree-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(20, 40, 35, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.agree-mask.force-mode {
  cursor: default;
}
.agree-panel {
  width: 100%;
  max-width: 640px;
  max-height: 86vh;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.97), rgba(245, 252, 248, 0.97));
  border: 1px solid rgba(63, 169, 138, 0.35);
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(30, 70, 55, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.agree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(63, 169, 138, 0.2);
  background: linear-gradient(135deg, rgba(63, 169, 138, 0.12), rgba(91, 201, 160, 0.06));
}
.agree-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #2c5e4a;
}
.agree-title i {
  color: #3fa98a;
}
.agree-close {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: #7a8a82;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}
.agree-close:hover {
  background: rgba(231, 76, 60, 0.12);
  color: #e74c3c;
}
/* 数据存储一览 */
.agree-summary {
  border-bottom: 1px solid rgba(63, 169, 138, 0.2);
  background: rgba(63, 169, 138, 0.06);
  flex-shrink: 0;
}
.agree-summary-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #2c5e4a;
}
.agree-summary-head span {
  flex: 1;
  text-align: left;
}
.agree-summary-head i:first-child {
  color: #3fa98a;
}
.agree-summary-head i:last-child {
  color: #7a8a82;
  font-size: 11px;
}
.agree-summary-list {
  margin: 0;
  padding: 0 22px 12px 40px;
  font-size: 12px;
  line-height: 1.75;
  color: #3a4a44;
}
.agree-summary-list li {
  margin-bottom: 4px;
}
.agree-summary-list b {
  color: #2c5e4a;
}
.agree-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
  min-height: 0;
}
.agree-body::-webkit-scrollbar {
  width: 8px;
}
.agree-body::-webkit-scrollbar-thumb {
  background: rgba(63, 169, 138, 0.4);
  border-radius: 4px;
}
.agree-text {
  font-size: 13px;
  line-height: 1.9;
  color: #3a4a44;
}
/* 以下样式作用于 v-html 注入的内容，必须用 :deep() 穿透 scoped */
:deep(.agree-link) {
  color: #2d8a6e;
  text-decoration: underline;
  cursor: pointer;
}
:deep(.agree-link:hover) {
  color: #1f6e54;
}
:deep(.agree-path) {
  display: inline-block;
  color: #4a6a5a;
  background: rgba(63, 169, 138, 0.12);
  padding: 1px 5px;
  border-radius: 3px;
  cursor: pointer;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  transition: background 0.2s ease;
}
:deep(.agree-path:hover) {
  background: rgba(63, 169, 138, 0.28);
  text-decoration: underline;
}
/* 关键章节（第七章免责声明）高亮：加粗变红 + 左侧红线 */
:deep(.agree-key-section) {
  font-weight: 600;
  color: #c0392b;
  background: rgba(231, 76, 60, 0.06);
  padding: 10px 14px;
  border-left: 3px solid #e74c3c;
  border-radius: 0 8px 8px 0;
  margin: 10px 0;
}
.agree-footer {
  padding: 14px 20px;
  border-top: 1px solid rgba(63, 169, 138, 0.2);
  background: rgba(255, 255, 255, 0.6);
}
.agree-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #3a4a44;
  cursor: pointer;
  user-select: none;
}
/* 关键章节单独确认框：红色强调 */
.agree-key-check {
  color: #c0392b;
  font-weight: 600;
  margin-bottom: 6px;
}
.agree-key-check input[type='checkbox'] {
  accent-color: #e74c3c;
}
.agree-check.disabled {
  color: #a0aba4;
  cursor: not-allowed;
}
.agree-check input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: #3fa98a;
  cursor: pointer;
}
.agree-check.disabled input[type='checkbox'] {
  cursor: not-allowed;
}
.agree-hint {
  font-size: 11px;
  color: #e74c3c;
  font-style: normal;
  margin-left: 4px;
}
.agree-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.agree-btn {
  padding: 9px 26px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: not-allowed;
  transition: all 0.25s ease;
}
/* 次要按钮：不同意（给出拒绝出口） */
.agree-btn.ghost {
  background: transparent;
  border: 1px solid rgba(63, 169, 138, 0.45);
  color: #4a6a5a;
  cursor: pointer;
  margin-right: 10px;
}
.agree-btn.ghost:hover {
  background: rgba(63, 169, 138, 0.12);
}
.agree-btn.primary {
  background: rgba(160, 171, 164, 0.4);
  color: #c2ccc6;
}
.agree-btn.primary.active {
  background: linear-gradient(135deg, #3fa98a, #5bc9a0);
  color: #fff;
  cursor: pointer;
}
.agree-btn.primary.active:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(63, 169, 138, 0.4);
}

/* = 移动端：条款弹窗要能在窄屏完整阅读并点到「同意」 = */
@media (max-width: 768px) {
  .agree-mask {
    padding: 10px;
    /* 移动端已全局关闭毛玻璃，加深遮罩保证对比度 */
    background: rgba(20, 40, 35, 0.72);
  }

  .agree-panel {
    /* 用 dvh：地址栏收起/展开时不跳变，且底部按钮不会被裁掉 */
    max-height: 92dvh;
    border-radius: 14px;
  }

  .agree-header {
    padding: 12px 14px;
  }

  .agree-title {
    font-size: 14px;
  }

  /* 正文与按钮的左右内边距同步收窄，把宽度让给文字 */
  .agree-body,
  .agree-content {
    padding-left: 14px;
    padding-right: 14px;
  }

  /* 底部操作区：按钮加大到可点，并给底部安全区留白 */
  .agree-footer,
  .agree-actions {
    padding: 10px 14px calc(10px + var(--safe-bottom, 0px));
    gap: 8px;
  }

  .agree-btn {
    min-height: var(--tap-min, 44px);
    font-size: 14px;
  }
}
</style>
