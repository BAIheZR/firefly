<template>
  <div class="slot-select-overlay">
    <div class="slot-select-panel">
      <div class="slot-select-header">
        <i class="fa-solid fa-dragon"></i>
        <h1>选择存档</h1>
        <p>萤光纪游 · 共 5 个存档位，可分别保存「大号」「小号」互不干扰</p>
      </div>

      <div class="slot-grid">
        <div
          v-for="slot in slots"
          :key="slot.slotId"
          class="slot-card"
          :class="{ empty: !slot.exists, current: slot.slotId === currentSlotId }"
        >
          <!-- 已有存档 -->
          <template v-if="slot.exists">
            <div class="slot-card-top">
              <span class="slot-no">存档 {{ slot.slotId }}</span>
              <span v-if="slot.slotId === currentSlotId" class="slot-tag">当前</span>
            </div>

            <template v-if="editing && editing.slotId === slot.slotId && editing.mode === 'rename'">
              <input
                v-model="editing.value"
                class="slot-edit-input"
                maxlength="12"
                placeholder="输入名称"
                @keyup.enter="confirmRename"
              />
              <div class="slot-edit-actions">
                <button class="slot-btn mini primary" @click="confirmRename">确定</button>
                <button class="slot-btn mini" @click="cancelEdit">取消</button>
              </div>
            </template>
            <template v-else>
              <div class="slot-card-name">{{ slot.name || '未命名' }}</div>
              <div class="slot-card-meta">
                <span v-if="slot.summary.character" class="meta-item"><i class="fa-solid fa-user"></i>{{ slot.summary.character }}</span>
                <span v-if="slot.summary.level" class="meta-item"><i class="fa-solid fa-star"></i>Lv.{{ slot.summary.level }}</span>
                <span v-if="slot.summary.gold" class="meta-item"><i class="fa-solid fa-coins"></i>{{ formatGold(slot.summary.gold) }}</span>
                <span v-if="slot.summary.affection" class="meta-item"><i class="fa-solid fa-heart"></i>{{ slot.summary.affection }}</span>
              </div>
              <div class="slot-card-time">{{ formatTime(slot.updatedAt) }}</div>
            </template>

            <div class="slot-card-actions">
              <button class="slot-btn primary" :disabled="busy" @click="loadSlot(slot)">进入</button>
              <button class="slot-btn" :disabled="busy" @click="startRename(slot)">重命名</button>
              <button class="slot-btn danger" :disabled="busy" @click="confirmRemove(slot)">
                {{ confirmingId === slot.slotId ? '确认删除' : '删除' }}
              </button>
            </div>
          </template>

          <!-- 空槽位 -->
          <template v-else>
            <div class="slot-card-top">
              <span class="slot-no">存档 {{ slot.slotId }}</span>
            </div>

            <div class="slot-empty-body">
              <div class="slot-empty-icon"><i class="fa-solid fa-plus"></i></div>
              <div class="slot-empty-text">新建存档</div>

              <template v-if="editing && editing.slotId === slot.slotId && editing.mode === 'create'">
                <input
                  v-model="editing.value"
                  class="slot-edit-input"
                  maxlength="12"
                  placeholder="输入存档名称（可留空）"
                  @keyup.enter="confirmCreate"
                />
                <div class="slot-edit-actions">
                  <button class="slot-btn mini primary" :disabled="busy" @click="confirmCreate">创建</button>
                  <button class="slot-btn mini" @click="cancelEdit">取消</button>
                </div>
              </template>
              <template v-else>
                <button class="slot-btn primary" @click="startCreate(slot)">创建存档</button>
              </template>
            </div>
          </template>
        </div>
      </div>

      <div class="slot-select-footer">
        <button v-if="!firstRun" class="slot-btn ghost" @click="cancelAll">返回游戏</button>
        <button class="slot-btn ghost" @click="refresh">刷新</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSaveSlotsStore } from '@/config/saveSlots'

const props = defineProps({
  // 首次启动时没有「返回游戏」按钮（因为还没有可返回的档）
  firstRun: { type: Boolean, default: false },
})

const store = useSaveSlotsStore()
const slots = ref([])
const currentSlotId = ref(null)
const busy = ref(false)
const editing = ref(null)
const confirmingId = ref(null)

onMounted(async () => {
  await store.loadSlots()
  slots.value = store.slots
  currentSlotId.value = store.currentSlotId
})

async function refresh() {
  await store.loadSlots()
  slots.value = store.slots
  currentSlotId.value = store.currentSlotId
}

function startCreate(slot) {
  editing.value = { slotId: slot.slotId, mode: 'create', value: '' }
}

function startRename(slot) {
  editing.value = { slotId: slot.slotId, mode: 'rename', value: slot.name || '' }
}

function cancelEdit() {
  editing.value = null
}

async function confirmCreate() {
  const e = editing.value
  if (!e) return
  const name = (e.value || '').trim() || `存档 ${e.slotId}`
  busy.value = true
  try {
    await store.createSlot(e.slotId, name)
    store.closeSelector()
    reloadApp()
  } catch (err) {
    console.error('创建存档失败', err)
    busy.value = false
  }
}

async function confirmRename() {
  const e = editing.value
  if (!e) return
  const name = (e.value || '').trim()
  if (name) {
    busy.value = true
    await store.renameSlot(e.slotId, name)
    busy.value = false
  }
  editing.value = null
  await refresh()
}

async function loadSlot(slot) {
  busy.value = true
  try {
    await store.switchToSlot(slot.slotId)
    store.closeSelector()
    reloadApp()
  } catch (err) {
    console.error('切换存档失败', err)
    busy.value = false
  }
}

function confirmRemove(slot) {
  if (confirmingId.value !== slot.slotId) {
    confirmingId.value = slot.slotId
    setTimeout(() => { if (confirmingId.value === slot.slotId) confirmingId.value = null }, 3000)
    return
  }
  confirmingId.value = null
  doRemove(slot)
}

async function doRemove(slot) {
  busy.value = true
  await store.removeSlot(slot.slotId)
  busy.value = false
  await refresh()
}

function cancelAll() {
  store.closeSelector()
}

function reloadApp() {
  window.location.reload()
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function formatGold(n) {
  return Number(n || 0).toLocaleString('zh-CN')
}
</script>

<style scoped>
.slot-select-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background:
    radial-gradient(1200px 600px at 20% 10%, rgba(56, 168, 184, 0.35), transparent 60%),
    radial-gradient(1000px 600px at 80% 90%, rgba(232, 153, 73, 0.3), transparent 60%),
    linear-gradient(160deg, #0e1a24 0%, #10242c 45%, #1c2b20 100%);
  animation: slotFadeIn 0.3s ease;
}

@keyframes slotFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.slot-select-panel {
  width: 100%;
  max-width: 1080px;
  max-height: 92vh;
  overflow-y: auto;
  padding: 32px 28px;
  border-radius: 18px;
  background: rgba(16, 30, 38, 0.72);
  border: 1px solid rgba(63, 169, 138, 0.35);
  backdrop-filter: blur(18px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.slot-select-header {
  text-align: center;
  margin-bottom: 26px;
}
.slot-select-header i {
  color: #38a8b8;
  font-size: 26px;
  margin-right: 8px;
}
.slot-select-header h1 {
  display: inline-block;
  margin: 0;
  font-size: 26px;
  color: #f3e6c8;
  letter-spacing: 2px;
}
.slot-select-header p {
  margin: 8px 0 0;
  color: #9bb8bf;
  font-size: 13px;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 16px;
}

.slot-card {
  display: flex;
  flex-direction: column;
  min-height: 220px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.slot-card:hover {
  transform: translateY(-4px);
  border-color: rgba(63, 169, 138, 0.7);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.4);
}
.slot-card.empty {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.22);
}
.slot-card.current {
  border-color: rgba(56, 168, 184, 0.8);
  box-shadow: 0 0 0 1px rgba(56, 168, 184, 0.5);
}

.slot-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.slot-no {
  font-size: 12px;
  color: #9bb8bf;
}
.slot-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(56, 168, 184, 0.25);
  color: #8fe0ea;
}

.slot-card-name {
  font-size: 20px;
  font-weight: 600;
  color: #f3e6c8;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-card-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
  flex: 1;
}
.meta-item {
  font-size: 13px;
  color: #c9d6db;
}
.meta-item i {
  width: 18px;
  color: #e89949;
  margin-right: 4px;
}

.slot-card-time {
  font-size: 11px;
  color: #6f858c;
  margin-bottom: 12px;
}

.slot-card-actions {
  display: flex;
  gap: 8px;
}

.slot-empty-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.slot-empty-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(56, 168, 184, 0.16);
  color: #8fe0ea;
  font-size: 20px;
}
.slot-empty-text {
  color: #9bb8bf;
  font-size: 14px;
}

.slot-edit-input {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(63, 169, 138, 0.5);
  background: rgba(255, 255, 255, 0.08);
  color: #f3e6c8;
  font-size: 13px;
  outline: none;
}
.slot-edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.slot-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #d9e4e8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.slot-btn:hover:not(:disabled) {
  border-color: rgba(63, 169, 138, 0.8);
  color: #ffd27a;
  transform: translateY(-2px);
}
.slot-btn.primary {
  background: linear-gradient(135deg, #38a8b8, #2c7d8a);
  border-color: rgba(56, 168, 184, 0.6);
  color: #fff;
}
.slot-btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #45bccd, #3493a0);
  color: #fff;
}
.slot-btn.danger {
  border-color: rgba(214, 79, 34, 0.5);
  color: #e08a6a;
}
.slot-btn.danger:hover:not(:disabled) {
  border-color: #d64f22;
  color: #ff9a70;
}
.slot-btn.ghost {
  background: transparent;
}
.slot-btn.mini {
  padding: 6px 12px;
  font-size: 12px;
}
.slot-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.slot-select-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}

/* ====== 移动端：存档选择是全屏弹窗，窄屏要充分利用高度 ====== */
@media (max-width: 768px) {
  .slot-select-overlay {
    padding: 10px;
    align-items: stretch;
  }

  .slot-select-panel {
    /* 92vh 在地址栏伸缩时会跳动，且底部会被裁掉一截 */
    max-height: 94dvh;
    padding: 18px 14px;
    border-radius: 14px;
    /* 移动端已全局关闭毛玻璃，改不透明底避免深色背景下看不清文字 */
    background: rgba(16, 30, 38, 0.94);
  }

  .slot-select-header {
    margin-bottom: 16px;
  }

  .slot-select-header h1 {
    font-size: 19px;
  }

  .slot-select-header p {
    font-size: 12px;
    line-height: 1.5;
  }

  /* 原 minmax(190px) 在 336px 可用宽度下只能 1 列，收到 150px 可排 2 列 */
  .slot-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }

  .slot-select-footer {
    margin-top: 16px;
    gap: 10px;
  }

  .slot-select-footer .slot-btn {
    min-height: var(--tap-min, 44px);
  }
}
</style>
