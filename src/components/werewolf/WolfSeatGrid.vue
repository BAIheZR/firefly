<template>
  <div class="ww-seats">
    <div
      v-for="p in list"
      :key="p.id"
      class="ww-seat"
      :class="cls(p)"
      @click="onPick(p)"
    >
      <span class="ww-seat-no">{{ p.seat }}</span>

      <div class="ww-seat-avatar" :class="{ 'is-empty': !avatarOf(p) }">
        <img v-if="avatarOf(p)" :src="avatarOf(p)" :alt="p.name" draggable="false" />
        <i v-else class="fa-solid fa-user"></i>
      </div>

      <div class="ww-seat-main">
        <span class="ww-seat-name">{{ p.name }}</span>
        <span class="ww-seat-role">{{ sub(p) }}</span>
        <div v-if="tags(p).length" class="ww-seat-tags">
          <span v-for="(t, i) in tags(p)" :key="i" class="ww-tag" :class="t.tone">
            <i v-if="t.icon" :class="t.icon"></i>{{ t.text }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 玩家席：只负责「显示座位 + 发出选择意图」，不含任何规则判断。
import { computed } from 'vue'
import { ROLES, isWolfRole } from '@/config/werewolf'

const props = defineProps({
  players: { type: Array, default: () => [] },
  alive: { type: Array, default: () => [] },
  selfId: { type: String, default: '' },
  myRole: { type: String, default: '' },
  // 仅银狼可见的同伴 id
  mateIds: { type: Array, default: () => [] },
  // 被萤火照亮的人（只有流萤本人会拿到，由父组件决定传不传）
  litId: { type: String, default: '' },
  // 结算时公开的身份 { id: roleKey }
  revealed: { type: Object, default: () => ({}) },
  // { targetId: 票数 }
  voteCounts: { type: Object, default: () => ({}) },
  pickable: { type: Boolean, default: false },
  pickedId: { type: String, default: '' },
  // 玩家自己设定的头像（本地 data URL）。快照里不下发真人头像，
  // 所以「自己那一张」要由父组件从本地补进来。
  selfAvatar: { type: String, default: '' },
})

const emit = defineEmits(['pick'])

// 头像优先级：自己 → 本地头像；AI → 快照里带的小图标；其余真人 → 空（走图标兜底）
function avatarOf(p) {
  if (!p) return ''
  if (p.id === props.selfId) return props.selfAvatar || p.avatar || ''
  return p.avatar || ''
}

const list = computed(() =>
  props.players
    .slice()
    .sort((a, b) => (a.seat || 0) - (b.seat || 0))
)

const isAliveId = (id) => props.alive.includes(id)

function sub(p) {
  const rev = props.revealed[p.id]
  if (rev) return roleLabel(rev)
  if (!isAliveId(p.id)) return '已离场'
  if (p.id === props.selfId) return '你'
  return '在场'
}

function roleLabel(key) {
  const r = ROLES[key]
  return r ? `${r.name}·${r.title}` : '未知'
}

function tags(p) {
  const out = []
  const rev = props.revealed[p.id]
  if (rev) {
    out.push({ text: ROLES[rev]?.name || '未知', tone: isWolfRole(rev) ? 'is-wolf' : 'is-good' })
  }
  if (props.mateIds.includes(p.id)) {
    out.push({ text: '同伴', tone: 'is-wolf', icon: 'fa-solid fa-user-ninja' })
  }
  if (props.litId && props.litId === p.id) {
    out.push({ text: '萤火', tone: 'is-lit', icon: 'fa-solid fa-fire-flame-simple' })
  }
  if (p.id === props.selfId && props.myRole && !rev) {
    out.push({ text: '你的身份', tone: 'is-plain' })
  }
  const n = props.voteCounts[p.id]
  if (n > 0) out.push({ text: `${n} 票`, tone: 'is-votecount', icon: 'fa-solid fa-gavel' })
  if (p.isAI && !rev) out.push({ text: 'AI', tone: 'is-plain' })
  return out
}

function cls(p) {
  return {
    'is-self': p.id === props.selfId,
    'is-dead': !isAliveId(p.id),
    'is-mate': props.mateIds.includes(p.id),
    'is-picked': props.pickedId === p.id,
    // 只有「还活着、不是自己」的座位才可点
    'is-clickable': canPick(p),
  }
}

function canPick(p) {
  if (!props.pickable) return false
  if (p.id === props.selfId) return false
  return isAliveId(p.id)
}

function onPick(p) {
  if (!canPick(p)) return
  emit('pick', p.id)
}
</script>
