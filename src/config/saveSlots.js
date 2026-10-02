import { defineStore } from 'pinia'

const SLOT_COUNT = 5
const CURRENT_SLOT_KEY = 'current_slot_id'
const SAVE_VERSION = 1

// 浏览器降级时，槽位数据存到 localStorage 的 key 前缀
const LS_SLOT_PREFIX = 'save_slot_'

// 需要按存档槽隔离的 key（游戏进度 / 角色数据）。
// 全局偏好（theme_dark、official_game_path、music_folder_path、ai_config）不在此列，跨槽位共享。
export const SAVE_KEYS = [
  'userSettings',
  'user_data',
  'avatarData',
  'user_background_data',
  'game_inventory',
  'game_gold',
  'game_gold_migrated',
  'player_affection',
  'player_action_bonus',
  'player_action_recover',
  'player_action_recover_time',
  'player_selected_buffs',
  'player_buff_reroll',
  'player_level_data',
  'signin_calendar_data',
  'signin_data',
  'last_login_date',
  'last_login_greeting_date',
  'advanced_tasks_data',
  'home_character_config',
  // 人物形象变换参数（3D 模型 home_model_transform / 2D 立绘 home_image_transform）
  'home_model_transform',
  'home_image_transform',
  'idle_game_state',
  'music_liked_titles',
  'music_panel_opacity',
  'music_wallpaper_data',
  // 音乐播放模式（顺序/随机）与听歌时长累计余数（不足 1 分钟的零头，关系到挂机金币结算）
  'music_play_mode',
  'music_listen_accum_ms',
  // AI 长期记忆卡片：属于角色养成进度，必须随存档走
  'ai_chat_memory',
  // 五子棋对手画像（战绩 / 惯用开局 / 连子方向偏好）：属于这个存档主人的对局习惯，必须随存档走
  'gomoku_profile',
  // 开箱箱子库存（拥有多少个箱子）：属于养成进度，随存档走
  'player_chest_inventory',
]

// 明确不入档的 key（防止以后误加）：current_slot_id 槽位指针、pending_greeting 一次性问候标记、
// ai_chat_current 当前会话聊天、以及 theme_dark / official_game_path / music_folder_path / ai_config / agreement_accepted 等跨槽共享项

function isElectron() {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true
}

// 从槽位 payload 里提取摘要（供存档选择界面展示大号/小号信息）
function extractSummary(payload) {
  const data = payload?.data || {}
  let gold = 0
  let level = 0
  let character = ''
  let affection = 0
  try {
    const g = JSON.parse(data.game_gold || '{}')
    if (typeof g.gold === 'number') gold = g.gold
  } catch (e) {}
  try {
    const p = JSON.parse(data.player_level_data || '{}')
    if (typeof p.level === 'number') level = p.level
  } catch (e) {}
  try {
    const u = JSON.parse(data.user_data || '{}')
    character = u.currentUser || ''
  } catch (e) {}
  if (data.player_affection != null) {
    const a = Number(data.player_affection)
    if (Number.isFinite(a)) affection = a
  }
  return { gold, level, character, affection }
}

export const useSaveSlotsStore = defineStore('saveSlots', {
  state: () => ({
    currentSlotId: null,
    slots: [],
    initialized: false,
    showSelector: false,
  }),

  actions: {
    //  底层读写（桌面 IPC / 浏览器降级） 
    async readSlot(slotId) {
      if (isElectron()) {
        const res = await window.electronAPI.loadSaveSlot(slotId)
        return (res && res.success) ? (res.payload || null) : null
      }
      const raw = localStorage.getItem(LS_SLOT_PREFIX + slotId)
      return raw ? JSON.parse(raw) : null
    },

    async writeSlot(slotId, payload) {
      if (isElectron()) {
        await window.electronAPI.saveSaveSlot(slotId, payload)
      } else {
        localStorage.setItem(LS_SLOT_PREFIX + slotId, JSON.stringify(payload))
      }
    },

    async deleteSlotFile(slotId) {
      if (isElectron()) {
        await window.electronAPI.deleteSaveSlot(slotId)
      } else {
        localStorage.removeItem(LS_SLOT_PREFIX + slotId)
      }
    },

    //  打包 / 恢复 
    // 把当前 localStorage 打包成 data 对象（只含白名单 key）
    packCurrentData() {
      const data = {}
      for (const k of SAVE_KEYS) {
        const v = localStorage.getItem(k)
        if (v !== null) data[k] = v
      }
      return data
    },

    // 用 data 对象恢复 localStorage（先清空白名单 key，避免跨槽位残留）
    restoreData(data) {
      for (const k of SAVE_KEYS) localStorage.removeItem(k)
      for (const [k, v] of Object.entries(data || {})) {
        if (v !== null && v !== undefined) localStorage.setItem(k, String(v))
      }
      localStorage.removeItem('pending_greeting')
    },

    //  槽位列表 
    async loadSlots() {
      const slots = []
      for (let i = 1; i <= SLOT_COUNT; i++) {
        const payload = await this.readSlot(i)
        slots.push({
          slotId: i,
          exists: !!payload,
          name: payload?.meta?.name || '',
          updatedAt: payload?.meta?.updatedAt || 0,
          summary: extractSummary(payload),
        })
      }
      this.slots = slots
      return slots
    },

    //  同步初始化（启动时调用） 
    // localStorage 本身就是「当前活动槽位」的真相源（Electron 会持久化），故无需从文件恢复
    syncInit() {
      const raw = localStorage.getItem(CURRENT_SLOT_KEY)
      const id = Number(raw)
      if (raw != null && Number.isFinite(id) && id >= 1 && id <= SLOT_COUNT) {
        this.currentSlotId = id
        this.initialized = true
        return { needSelect: false }
      }

      // 无槽位记录：检测是否有旧版存档（旧版直接玩过，localStorage 有数据）
      if (this.hasLegacyData()) {
        localStorage.setItem(CURRENT_SLOT_KEY, '1')
        this.currentSlotId = 1
        this.initialized = true
        // 后台把旧数据写入槽位 1 文件（不阻塞启动）
        this.migrateLegacyToSlot1().catch(() => {})
        return { needSelect: false, migrated: true }
      }

      // 全新玩家：需要显示存档选择界面
      this.initialized = true
      return { needSelect: true }
    },

    hasLegacyData() {
      return SAVE_KEYS.some((k) => localStorage.getItem(k) !== null)
    },

    async migrateLegacyToSlot1() {
      const payload = {
        meta: { name: '旧存档', updatedAt: Date.now(), version: SAVE_VERSION },
        data: this.packCurrentData(),
      }
      await this.writeSlot(1, payload)
      await this.loadSlots()
    },

    //  保存 / 切换 / 创建 / 删除 
    // 把当前 localStorage 写回当前槽位文件
    async saveCurrent() {
      if (this.currentSlotId == null) return
      const cur = this.slots.find((s) => s.slotId === this.currentSlotId)
      const name = cur?.name || ''
      const payload = {
        meta: { name, updatedAt: Date.now(), version: SAVE_VERSION },
        data: this.packCurrentData(),
      }
      await this.writeSlot(this.currentSlotId, payload)
      await this.loadSlots()
    },

    // 切换到指定槽位：写回当前槽位 -> 恢复目标槽位 -> 记录当前槽位
    async switchToSlot(slotId) {
      await this.saveCurrent()
      const payload = await this.readSlot(slotId)
      this.restoreData(payload?.data || {})
      localStorage.setItem(CURRENT_SLOT_KEY, String(slotId))
      this.currentSlotId = slotId
      await this.loadSlots()
    },

    // 新建空槽位（data 为空，进入后各 store 用默认值初始化）
    async createSlot(slotId, name) {
      const payload = {
        meta: { name: name || '', updatedAt: Date.now(), version: SAVE_VERSION },
        data: {},
      }
      await this.writeSlot(slotId, payload)
      this.restoreData({})
      localStorage.setItem(CURRENT_SLOT_KEY, String(slotId))
      this.currentSlotId = slotId
      await this.loadSlots()
    },

    async renameSlot(slotId, name) {
      const payload = await this.readSlot(slotId)
      if (!payload) return
      payload.meta = { ...(payload.meta || {}), name, updatedAt: Date.now() }
      await this.writeSlot(slotId, payload)
      await this.loadSlots()
    },

    async removeSlot(slotId) {
      await this.deleteSlotFile(slotId)
      if (this.currentSlotId === slotId) {
        localStorage.removeItem(CURRENT_SLOT_KEY)
        this.currentSlotId = null
      }
      await this.loadSlots()
    },

    // 获取当前槽位名称（供界面显示）
    currentSlotName() {
      const cur = this.slots.find((s) => s.slotId === this.currentSlotId)
      return cur?.name || (this.currentSlotId ? `存档 ${this.currentSlotId}` : '')
    },

    openSelector() {
      this.showSelector = true
    },

    closeSelector() {
      this.showSelector = false
    },
  },
})

export { SLOT_COUNT }
