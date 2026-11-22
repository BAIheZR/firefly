import { useSaveSlotsStore } from '@/config/saveSlots'

// ===== 自动保存（桌面端）=====
// 1) 运行期间：每 30 分钟无条件备份一次（常开，不提供开关）
// 2) 退出游戏时：可选再存一份（设置页开关控制），同样写新文件、不覆盖上一次
// 落盘位置：<userData>/data/autosave_slotN_时间戳.json
// 快照是「扁平 key」结构，可直接用「导入存档」恢复；不触碰原存档槽文件。

const LAST_AT_KEY = 'auto_save_last_at'
// 退出保存开关（设备级偏好，不入存档，切换槽位不影响）
const EXIT_ENABLED_KEY = 'auto_save_on_exit'
// 旧版本遗留的「自动保存总开关」：关闭过的玩家，升级后默认把退出保存也保持关闭
const LEGACY_ENABLED_KEY = 'auto_save_enabled'

export const AUTO_SAVE_INTERVAL_MS = 30 * 60 * 1000 // 30 分钟

let timer = null

const isElectron = () =>
  typeof window !== 'undefined' && window.electronAPI?.isElectron === true

// 退出时是否自动保存：默认开启
export function isExitAutoSaveEnabled() {
  const v = localStorage.getItem(EXIT_ENABLED_KEY)
  if (v === '0' || v === '1') return v === '1'
  return localStorage.getItem(LEGACY_ENABLED_KEY) !== '0'
}

export function setExitAutoSaveEnabled(on) {
  localStorage.setItem(EXIT_ENABLED_KEY, on ? '1' : '0')
}

export function getLastAutoSaveAt() {
  const n = Number(localStorage.getItem(LAST_AT_KEY))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// 执行一次保存。返回 { success, filePath } 或 { skipped, error }
export async function runAutoSave(reason = 'timer') {
  if (!isElectron()) return { skipped: true, error: 'not-electron' }

  const saveSlots = useSaveSlotsStore()
  const slotId = saveSlots.currentSlotId
  // 还没选档（全新玩家停在选择界面）→ 跳过
  if (!slotId) return { skipped: true, error: 'no-slot' }

  const data = saveSlots.packCurrentData()
  if (!data || Object.keys(data).length === 0) return { skipped: true, error: 'empty' }

  const payload = { ...data, createdAt: new Date().toISOString() }
  const res = await window.electronAPI.autoSave(slotId, payload)
  if (res?.success) localStorage.setItem(LAST_AT_KEY, String(Date.now()))
  return res || { success: false, error: '未知错误' }
}

// 启动 30 分钟定时器（常开，不受任何开关影响）
export function startAutoSave() {
  if (timer) return
  if (!isElectron()) return
  timer = setInterval(() => {
    runAutoSave('timer').catch((e) => console.warn('[自动保存] 失败：', e))
  }, AUTO_SAVE_INTERVAL_MS)
}

export function stopAutoSave() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
