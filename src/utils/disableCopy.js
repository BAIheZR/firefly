// 全站复制防护：默认禁止复制/剪切/右键/选中，仅对白名单（.allow-copy）放行
// 设计原则：表单控件（input/textarea/contenteditable）天然放行，避免影响输入；
// 其它元素必须显式加 class="allow-copy" 才能复制。

const ALLOW_SELECTOR = '.allow-copy, .allow-copy *'

function isAllowed(target) {
  if (!target || !(target instanceof Element)) return false
  // 表单控件：天然放行（用户输入需要选择文本）
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    // 只读 input 也允许复制（如配置页的 apiKey 显示框）
    return true
  }
  if (target.isContentEditable) return true
  // 白名单元素及其子孙
  return !!target.closest(ALLOW_SELECTOR)
}

// 1) copy / cut：非白名单直接拦截
function onCopyCut(e) {
  if (isAllowed(e.target)) return
  e.preventDefault()
}

// 2) 右键菜单：非白名单禁止（避免「复制」菜单）
function onContextMenu(e) {
  if (isAllowed(e.target)) return
  e.preventDefault()
}

// 3) 文本选中开始：非白名单禁止（让鼠标拖选无效）
function onSelectStart(e) {
  if (isAllowed(e.target)) return
  e.preventDefault()
}

// 4) 快捷键兜底：Ctrl+C / Ctrl+X 在非白名单时阻止默认行为
function onKeyDown(e) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return
  const key = e.key.toLowerCase()
  if (key !== 'c' && key !== 'x' && key !== 'a') return
  // Ctrl+A 在非白名单也禁止（避免全选后复制）
  if (isAllowed(e.target)) return
  e.preventDefault()
}

export function installDisableCopy() {
  // capture 阶段拦截，确保优先于任何业务监听
  document.addEventListener('copy', onCopyCut, true)
  document.addEventListener('cut', onCopyCut, true)
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('selectstart', onSelectStart, true)
  document.addEventListener('keydown', onKeyDown, true)
}

export function uninstallDisableCopy() {
  document.removeEventListener('copy', onCopyCut, true)
  document.removeEventListener('cut', onCopyCut, true)
  document.removeEventListener('contextmenu', onContextMenu, true)
  document.removeEventListener('selectstart', onSelectStart, true)
  document.removeEventListener('keydown', onKeyDown, true)
}
