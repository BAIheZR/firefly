<template>
  <Teleport to="body">
    <div v-if="modelValue" class="memory-mask" @click.self="close">
      <div class="memory-panel">
        <div class="memory-header">
          <div class="memory-title">
            <!-- <i class="fa-solid fa-brain"></i> -->
            <span>流萤的记事本</span>
          </div>
          <button class="memory-close" title="关闭" @click="close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="memory-body">
          <div v-if="isEmpty" class="memory-empty">
            <i class="fa-solid fa-feather"></i>
            <p>还没有留下任何记忆呢</p>
            <p class="memory-empty-sub">多和流萤聊聊天，她会把你们的故事一一记住</p>
          </div>

          <template v-else>
            <section
              v-for="group in groups"
              :key="group.tag"
              class="memory-group"
            >
              <h4 class="memory-group-title">
                <i :class="group.icon"></i>
                <span>{{ group.label }}</span>
                <em class="memory-count">{{ group.items.length }}</em>
              </h4>
              <div class="memory-cards">
                <div v-for="f in group.items" :key="f.id" class="memory-card">
                  <span class="memory-card-text">{{ f.text }}</span>
                  <span class="memory-card-date">{{ formatDate(f.at) }}</span>
                </div>
              </div>
            </section>

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
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { loadMemory } from '@/services/chatHistory'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const memory = ref(loadMemory())

watch(
  () => props.modelValue,
  (v) => {
    if (v) memory.value = loadMemory() // 每次打开刷新
  }
)

function close() {
  emit('update:modelValue', false)
}

// 只读展示：活跃记忆卡按分类分组（已归档事件已融入往事纪要，不重复展示）
const groups = computed(() => {
  const defs = [
    { tag: 'profile', label: '关于开拓者', icon: 'fa-solid fa-id-card' },
    { tag: 'preference', label: '喜好', icon: 'fa-solid fa-heart' },
    { tag: 'promise', label: '约定', icon: 'fa-solid fa-handshake' },
    { tag: 'event', label: '一起经历的事', icon: 'fa-solid fa-star' },
  ]
  return defs
    .map((d) => ({
      ...d,
      items: memory.value.facts
        .filter((f) => f.tag === d.tag && !f.archived)
        .sort((a, b) => (d.tag === 'event' ? b.at - a.at : a.at - b.at)),
    }))
    .filter((g) => g.items.length)
})

const isEmpty = computed(
  () => !groups.value.length && !memory.value.chronicle && !memory.value.summary
)

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
  width: 520px;
  max-width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(63, 169, 138, 0.4);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
}

.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(90deg, #3FA98A, #2E8B6F);
  color: #fff;
}

.memory-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
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

.memory-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px;
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

.memory-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  color: #2E8B6F;
}

.memory-group-title i {
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

.memory-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.memory-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: #f0fdfa;
  border: 1px solid rgba(63, 169, 138, 0.25);
  border-radius: 10px;
}

.memory-card-text {
  font-size: 14px;
  line-height: 1.55;
  color: #1f2937;
  word-break: break-word;
}

.memory-card-date {
  flex-shrink: 0;
  font-size: 12px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  padding-top: 2px;
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
</style>
