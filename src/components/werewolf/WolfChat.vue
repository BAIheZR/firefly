<template>
  <div class="ww-channels">
    <div class="ww-tabs">
      <button
        v-for="c in channels"
        :key="c.key"
        class="ww-tab"
        :class="{ active: c.key === active, 'is-wolf': c.key === 'wolf' }"
        type="button"
        @click="active = c.key"
      >
        <i :class="c.icon"></i>{{ c.label }}
      </button>
    </div>

    <div ref="listEl" class="ww-chat-list">
      <div v-if="!shown.length" class="ww-chat-empty">{{ emptyText }}</div>
      <div v-for="m in shown" :key="m.id" class="ww-msg" :class="msgCls(m)">
        <div class="ww-msg-head">
          <b>{{ m.name }}</b>
          <span v-if="m.round">第 {{ m.round }} 轮</span>
        </div>
        <div class="ww-msg-body">{{ m.text }}</div>
      </div>
    </div>

    <div class="ww-chat-input">
      <input
        v-model="draft"
        class="ww-input"
        type="text"
        maxlength="200"
        :placeholder="inputPlaceholder"
        :disabled="!canSend"
        @keydown.enter="submit"
      />
      <button class="ww-btn is-primary" :disabled="!canSend || !draft.trim()" @click="submit">
        <i class="fa-solid fa-paper-plane"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
// 频道区：列车广播（公开）/ 暗网频道（银狼），判官固定帕姆，只负责显示与输入，不含任何规则
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  // [{ key, label, icon }]
  channels: { type: Array, default: () => [] },
  selfId: { type: String, default: '' },
  canSend: { type: Boolean, default: false },
  deadIds: { type: Array, default: () => [] },
  // 流萤的发言气泡会亮起来
  fireflyIds: { type: Array, default: () => [] },
  emptyText: { type: String, default: '还没有人说话' },
})

const emit = defineEmits(['send'])

const active = ref('day')
const draft = ref('')
const listEl = ref(null)

// 频道列表变化时（例如自己离场后失去暗网频道），把选中项拉回一个仍然存在的频道
watch(
  () => props.channels.map((c) => c.key).join(','),
  () => {
    if (!props.channels.some((c) => c.key === active.value)) {
      active.value = props.channels[0]?.key || 'day'
    }
  },
  { immediate: true }
)

const shown = computed(() => props.messages.filter((m) => (m.channel || 'day') === active.value))

const inputPlaceholder = computed(() => {
  if (!props.canSend) return '当前不能发言'
  if (active.value === 'wolf') return '只有银狼能看到这里…'
  return '说点什么，按 Enter 发送'
})

// 新消息进来后滚到底部：用 el.scrollTop 而非 scrollIntoView（后者会把所有可滚动祖先一起滚）
watch(
  () => props.messages.length,
  () => {
    nextTick(() => {
      const el = listEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
)

function msgCls(m) {
  return {
    'is-mine': m.fromId === props.selfId,
    'is-wolf': (m.channel || 'day') === 'wolf',
    'is-firefly': props.fireflyIds.includes(m.fromId),
  }
}

function submit() {
  const text = draft.value.trim()
  if (!props.canSend || !text) return
  // 把当前频道一起交给父组件 —— 父组件据此决定这条是公开还是狼人消息
  emit('send', text, active.value)
  draft.value = ''
}
</script>
