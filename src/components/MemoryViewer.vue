<template>
  <Teleport to="body">
    <div v-if="modelValue" class="memory-mask" @click.self="close">
      <div class="memory-panel">
        <header class="memory-header">
          <div class="memory-title">
            <i class="fa-solid fa-book"></i>
            <span>流萤的记事本</span>
          </div>
          <div class="memory-header-right">
            <span class="memory-total">{{ totalActive }} 条记忆</span>
            <button class="memory-close" title="关闭" @click="close">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </header>

        <!-- 与开拓者的关系（读取实时好感度） -->
        <section class="relation-card">
          <div class="relation-top">
            <div class="relation-stage">
              <i class="fa-solid fa-heart" :style="{ color: relInfo.color }"></i>
              <span class="relation-title">{{ relInfo.title }}</span>
            </div>
            <span class="relation-aff">好感度 {{ affection }}</span>
          </div>
          <div class="relation-bar">
            <div
              class="relation-bar-fill"
              :style="{ width: (relProgress.ratio * 100) + '%', background: relInfo.color }"
            ></div>
          </div>
          <div class="relation-sub">
            <span>称呼：{{ relInfo.call }}</span>
            <span v-if="relProgress.next">距「{{ relProgress.next.title }}」还差 {{ relProgress.remain }}</span>
            <span v-else>已达最高阶段</span>
          </div>
          <div v-if="milestones.length > 1" class="relation-journey">
            <i class="fa-solid fa-route"></i>
            <span v-for="(m, i) in milestones" :key="m.key" class="journey-item">
              {{ m.title }}<em v-if="i < milestones.length - 1" class="journey-arrow">→</em>
            </span>
          </div>
        </section>

        <!-- 搜索 -->
        <div class="memory-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input v-model="search" type="text" placeholder="搜索流萤记住的事…" />
          <button v-if="search" class="memory-search-clear" title="清空" @click="search = ''">
            <i class="fa-solid fa-circle-xmark"></i>
          </button>
        </div>

        <div class="memory-body">
          <div v-if="isEmpty" class="memory-empty">
            <i class="fa-solid fa-feather"></i>
            <p>还没有留下任何记忆呢</p>
            <p class="memory-empty-sub">多和流萤聊聊天，她会把你们的故事一一记住</p>
          </div>

          <template v-else>
            <section v-for="group in groups" :key="group.tag" class="memory-group">
              <h4 class="memory-group-title">
                <i :class="group.icon"></i>
                <span>{{ group.label }}</span>
                <em class="memory-count">{{ group.items.length }}</em>
              </h4>
              <div class="memory-cards">
                <div
                  v-for="f in group.items"
                  :key="f.id"
                  class="memory-card"
                  :class="{ 'is-editing': editingId === f.id }"
                >
                  <template v-if="editingId === f.id">
                    <textarea
                      v-model="editText"
                      class="memory-edit-input"
                      rows="2"
                      @keydown.esc="cancelEdit"
                    ></textarea>
                    <div class="memory-card-actions">
                      <button class="m-act m-act-save" :disabled="!editText.trim()" @click="saveEdit(f)">保存</button>
                      <button class="m-act" @click="cancelEdit">取消</button>
                    </div>
                  </template>
                  <template v-else>
                    <div class="memory-card-main">
                      <span class="memory-card-text">{{ f.text }}</span>
                      <span class="memory-card-date">{{ formatDate(f.at) }}</span>
                    </div>
                    <div class="memory-card-actions">
                      <button class="m-act" title="编辑" @click="startEdit(f)">
                        <i class="fa-solid fa-pen"></i>
                      </button>
                      <button class="m-act" title="归档" @click="archive(f)">
                        <i class="fa-solid fa-box-archive"></i>
                      </button>
                      <button
                        v-if="confirmId !== f.id"
                        class="m-act m-act-del"
                        title="删除"
                        @click="askDelete(f)"
                      >
                        <i class="fa-solid fa-trash"></i>
                      </button>
                      <button v-else class="m-act m-act-del is-confirm" @click="doDelete(f)">确认删除</button>
                    </div>
                  </template>
                </div>
              </div>
            </section>

            <p v-if="noResult" class="memory-nohit">没有找到包含「{{ search }}」的记忆</p>

            <template v-if="!search.trim()">
              <section v-if="memory.chronicle" class="memory-group">
                <h4 class="memory-group-title">
                  <i class="fa-solid fa-scroll"></i>
                  <span>往事纪要</span>
                </h4>
                <p class="memory-text-block">{{ memory.chronicle }}</p>
              </section>

              <section v-if="memory.summary" class="memory-group">
                <h4 class="memory-group-title">
                  <i class="fa-solid fa-feather-pointed"></i>
                  <span>最近的相处</span>
                </h4>
                <p class="memory-text-block">{{ memory.summary }}</p>
              </section>

              <section v-if="archivedFacts.length" class="memory-group">
                <h4 class="memory-group-title memory-archived-title" @click="showArchived = !showArchived">
                  <i class="fa-solid fa-box-archive"></i>
                  <span>已归档</span>
                  <em class="memory-count">{{ archivedFacts.length }}</em>
                  <i class="fa-solid memory-archived-caret" :class="showArchived ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                </h4>
                <div v-show="showArchived" class="memory-cards">
                  <div v-for="f in archivedFacts" :key="f.id" class="memory-card is-archived">
                    <div class="memory-card-main">
                      <span class="memory-card-text">{{ f.text }}</span>
                      <span class="memory-card-date">{{ formatDate(f.at) }}</span>
                    </div>
                    <div class="memory-card-actions">
                      <button class="m-act" title="恢复" @click="unarchive(f)">
                        <i class="fa-solid fa-rotate-left"></i>
                      </button>
                      <button
                        v-if="confirmId !== f.id"
                        class="m-act m-act-del"
                        title="删除"
                        @click="askDelete(f)"
                      >
                        <i class="fa-solid fa-trash"></i>
                      </button>
                      <button v-else class="m-act m-act-del is-confirm" @click="doDelete(f)">确认删除</button>
                    </div>
                  </div>
                </div>
              </section>
            </template>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  loadMemory,
  saveMemory,
  updateFactText,
  removeFact,
  toggleFactArchived,
} from '@/services/chatHistory'
import { getCurrentAffection } from '@/config/inventory'
import { getAffectionStageInfo, getAffectionProgress } from '@/config/affectionStages'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const memory = ref(loadMemory())
const affection = ref(100)
const search = ref('')
const editingId = ref(null)
const editText = ref('')
const confirmId = ref(null)
const showArchived = ref(false)

// 每次打开刷新：记忆、实时好感度、以及重置临时编辑态
function refresh() {
  memory.value = loadMemory()
  try {
    affection.value = getCurrentAffection()
  } catch (e) {
    const raw = Number(localStorage.getItem('player_affection'))
    affection.value = Number.isFinite(raw) ? raw : 100
  }
  editingId.value = null
  editText.value = ''
  confirmId.value = null
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) refresh()
  }
)

function close() {
  emit('update:modelValue', false)
}

//  关系信息（实时派生，不落库） 
const relInfo = computed(() => getAffectionStageInfo(affection.value))
const relProgress = computed(() => getAffectionProgress(affection.value))
const milestones = computed(() => memory.value.milestones || [])

//  记忆卡分组（含 other；归档单独区） 
const FACT_DEFS = [
  { tag: 'profile', label: '关于开拓者', icon: 'fa-solid fa-id-card' },
  { tag: 'preference', label: '喜好', icon: 'fa-solid fa-heart' },
  { tag: 'promise', label: '约定', icon: 'fa-solid fa-handshake' },
  { tag: 'event', label: '一起经历的事', icon: 'fa-solid fa-star' },
  { tag: 'other', label: '其他', icon: 'fa-solid fa-bookmark' },
]

const activeFacts = computed(() => memory.value.facts.filter((f) => !f.archived))
const archivedFacts = computed(() => memory.value.facts.filter((f) => f.archived))
const totalActive = computed(() => activeFacts.value.length)

const groups = computed(() => {
  const kw = search.value.trim().toLowerCase()
  const hit = (f) => !kw || f.text.toLowerCase().includes(kw)
  return FACT_DEFS.map((d) => ({
    ...d,
    items: activeFacts.value
      .filter((f) => f.tag === d.tag && hit(f))
      .sort((a, b) => (d.tag === 'event' ? b.at - a.at : a.at - b.at)),
  })).filter((g) => g.items.length)
})

const isEmpty = computed(
  () => !totalActive.value && !memory.value.chronicle && !memory.value.summary && !archivedFacts.value.length
)
const noResult = computed(
  () => !!search.value.trim() && !groups.value.length && totalActive.value > 0
)

//  编辑记忆卡（纯函数改数组 → 整体写回，触发响应式） 
function commitFacts(facts) {
  memory.value = { ...memory.value, facts }
  saveMemory(memory.value)
}

function startEdit(f) {
  editingId.value = f.id
  editText.value = f.text
  confirmId.value = null
}
function cancelEdit() {
  editingId.value = null
  editText.value = ''
}
function saveEdit(f) {
  if (!editText.value.trim()) return
  commitFacts(updateFactText(memory.value.facts, f.id, editText.value))
  cancelEdit()
}
function archive(f) {
  commitFacts(toggleFactArchived(memory.value.facts, f.id))
  confirmId.value = null
}
function unarchive(f) {
  commitFacts(toggleFactArchived(memory.value.facts, f.id))
  confirmId.value = null
}
function askDelete(f) {
  confirmId.value = f.id
  editingId.value = null
}
function doDelete(f) {
  commitFacts(removeFact(memory.value.facts, f.id))
  confirmId.value = null
}

function formatDate(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style scoped>
.memory-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 24px;
}

.memory-panel {
  width: 560px;
  max-width: 100%;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: #fbfefd;
  border: 1px solid rgba(63, 169, 138, 0.4);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
}

/*  头部  */
.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(90deg, #3FA98A, #2E8B6F);
  color: #fff;
  flex-shrink: 0;
}
.memory-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
}
.memory-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.memory-total {
  font-size: 12px;
  opacity: 0.9;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 2px 10px;
}
.memory-close {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}
.memory-close:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

/*  关系卡  */
.relation-card {
  margin: 14px 16px 0;
  padding: 13px 15px;
  border-radius: 13px;
  background: linear-gradient(135deg, rgba(63, 169, 138, 0.1), rgba(63, 169, 138, 0.03));
  border: 1px solid rgba(63, 169, 138, 0.25);
  flex-shrink: 0;
}
.relation-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.relation-stage {
  display: flex;
  align-items: center;
  gap: 7px;
}
.relation-title {
  font-size: 16px;
  font-weight: 800;
  color: #22564a;
  letter-spacing: 1px;
}
.relation-aff {
  font-size: 12px;
  font-weight: 700;
  color: #2E8B6F;
  background: rgba(63, 169, 138, 0.14);
  border-radius: 999px;
  padding: 2px 10px;
  font-variant-numeric: tabular-nums;
}
.relation-bar {
  height: 7px;
  margin: 11px 0 7px;
  border-radius: 999px;
  background: rgba(63, 169, 138, 0.16);
  overflow: hidden;
}
.relation-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}
.relation-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: #5b6b66;
}
.relation-journey {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed rgba(63, 169, 138, 0.3);
  font-size: 12px;
  color: #2E8B6F;
}
.relation-journey > i {
  margin-right: 4px;
  opacity: 0.8;
}
.journey-item {
  font-weight: 600;
}
.journey-arrow {
  font-style: normal;
  margin: 0 3px;
  opacity: 0.55;
}

/*  搜索  */
.memory-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px 0;
  padding: 0 12px;
  height: 36px;
  border: 1px solid rgba(63, 169, 138, 0.3);
  border-radius: 999px;
  background: #fff;
  flex-shrink: 0;
}
.memory-search > i {
  font-size: 13px;
  color: #9ca3af;
}
.memory-search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: #1f2937;
}
.memory-search-clear {
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.memory-search-clear:hover {
  color: #6b7280;
}

/*  内容区  */
.memory-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.memory-empty {
  padding: 48px 16px;
  text-align: center;
  color: #6b7280;
}
.memory-empty i {
  font-size: 38px;
  color: #3FA98A;
}
.memory-empty p {
  margin: 12px 0 0;
  font-size: 15px;
  font-weight: 600;
}
.memory-empty-sub {
  font-size: 13px !important;
  font-weight: 400 !important;
  opacity: 0.75;
}
.memory-nohit {
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
  padding: 10px 0;
  margin: 0;
}

.memory-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  color: #2E8B6F;
}
.memory-group-title > i {
  color: #3FA98A;
  width: 18px;
  text-align: center;
}
.memory-count {
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
  color: #3FA98A;
  background: rgba(63, 169, 138, 0.12);
  border-radius: 999px;
  padding: 1px 8px;
}
.memory-archived-title {
  cursor: pointer;
  user-select: none;
}
.memory-archived-caret {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.7;
}

.memory-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.memory-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: #f0fdfa;
  border: 1px solid rgba(63, 169, 138, 0.25);
  border-radius: 10px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.memory-card:hover {
  border-color: rgba(63, 169, 138, 0.5);
  box-shadow: 0 2px 8px rgba(63, 169, 138, 0.1);
}
.memory-card.is-editing {
  flex-direction: column;
  align-items: stretch;
  border-color: #3FA98A;
}
.memory-card.is-archived {
  background: #f6f7f9;
  border-color: rgba(148, 163, 184, 0.4);
}
.memory-card-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.memory-card-text {
  font-size: 14px;
  line-height: 1.55;
  color: #1f2937;
  word-break: break-word;
}
.memory-card.is-archived .memory-card-text {
  color: #64748b;
}
.memory-card-date {
  flex-shrink: 0;
  font-size: 12px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  padding-top: 2px;
}

/* 卡片操作按钮 */
.memory-card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.memory-card.is-editing .memory-card-actions {
  justify-content: flex-end;
  margin-top: 8px;
}
.m-act {
  height: 26px;
  min-width: 26px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(63, 169, 138, 0.35);
  border-radius: 7px;
  background: #fff;
  color: #2E8B6F;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.m-act:hover {
  background: rgba(63, 169, 138, 0.1);
}
.m-act-del {
  border-color: rgba(220, 38, 38, 0.3);
  color: #dc2626;
}
.m-act-del:hover {
  background: rgba(220, 38, 38, 0.08);
}
.m-act-del.is-confirm {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
  font-weight: 600;
  padding: 0 10px;
}
.m-act-del.is-confirm:hover {
  background: #b91c1c;
}
.m-act-save {
  background: #3FA98A;
  border-color: #3FA98A;
  color: #fff;
  font-weight: 600;
  padding: 0 12px;
}
.m-act-save:hover {
  background: #2E8B6F;
}
.m-act-save:disabled {
  background: #cbd5e1;
  border-color: #cbd5e1;
  cursor: not-allowed;
}

.memory-edit-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid rgba(63, 169, 138, 0.5);
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  font-family: inherit;
  color: #1f2937;
  resize: vertical;
  outline: none;
}
.memory-edit-input:focus {
  border-color: #3FA98A;
  box-shadow: 0 0 0 3px rgba(63, 169, 138, 0.12);
}

.memory-text-block {
  margin: 0;
  padding: 12px 14px;
  background: #f8fafc;
  border-left: 3px solid #3FA98A;
  border-radius: 0 10px 10px 0;
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
}

/*  移动端  */
@media (max-width: 768px) {
  .memory-mask {
    padding: 0;
    align-items: flex-end;
  }
  .memory-panel {
    width: 100%;
    max-height: 92vh;
    border-radius: 16px 16px 0 0;
  }
  .relation-card {
    margin: 12px 12px 0;
  }
  .memory-search {
    margin: 10px 12px 0;
  }
  .memory-body {
    padding: 12px 12px max(16px, env(safe-area-inset-bottom));
    gap: 16px;
  }
  /* iOS 聚焦输入框小于 16px 会强制放大页面 */
  .memory-search input,
  .memory-edit-input {
    font-size: 16px;
  }
}

/*  深色模式  */
:global(html.dark) .memory-panel {
  background: #171a19;
  border-color: rgba(63, 169, 138, 0.35);
}
:global(html.dark) .relation-card {
  background: linear-gradient(135deg, rgba(63, 169, 138, 0.16), rgba(63, 169, 138, 0.06));
  border-color: rgba(63, 169, 138, 0.3);
}
:global(html.dark) .relation-title {
  color: #d7f0e7;
}
:global(html.dark) .relation-aff {
  color: #7fd6b8;
  background: rgba(63, 169, 138, 0.2);
}
:global(html.dark) .relation-sub {
  color: #9fb0aa;
}
:global(html.dark) .relation-journey {
  color: #7fd6b8;
  border-top-color: rgba(63, 169, 138, 0.3);
}
:global(html.dark) .memory-search {
  background: #1f2422;
  border-color: rgba(63, 169, 138, 0.3);
}
:global(html.dark) .memory-search input {
  color: #e5e7eb;
}
:global(html.dark) .memory-card {
  background: #1f2422;
  border-color: rgba(63, 169, 138, 0.22);
}
:global(html.dark) .memory-card.is-archived {
  background: #1b1f1e;
  border-color: rgba(148, 163, 184, 0.25);
}
:global(html.dark) .memory-card-text {
  color: #e5e7eb;
}
:global(html.dark) .memory-card.is-archived .memory-card-text {
  color: #94a3b8;
}
:global(html.dark) .m-act {
  background: #262c2a;
  border-color: rgba(63, 169, 138, 0.35);
  color: #7fd6b8;
}
:global(html.dark) .m-act-del {
  color: #f87171;
  border-color: rgba(220, 38, 38, 0.4);
}
:global(html.dark) .memory-edit-input {
  background: #262c2a;
  color: #e5e7eb;
  border-color: rgba(63, 169, 138, 0.4);
}
:global(html.dark) .memory-text-block {
  background: #1b1f1e;
  color: #cbd5e1;
}
:global(html.dark) .memory-empty {
  color: #94a3b8;
}
:global(html.dark) .memory-group-title {
  color: #7fd6b8;
}
</style>
