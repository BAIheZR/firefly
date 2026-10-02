<template>
  <div class="ww-self">
    <!--  身份卡：素材是竖长方形（277×598 ≈ 1:2.16），卡面按这个比例走，不裁成正方形  -->
    <div class="ww-role-card" :class="{ 'is-firefly': isFirefly }">
      <template v-if="role">
        <div class="ww-role-face">
          <img v-if="cardSrc" class="ww-role-img" :src="cardSrc" :alt="role.name" draggable="false" />
          <!-- 兜底：万一哪天某个角色两张卡都没有，用「梦客车票」画一张同比例的卡面，
               别把小图标（60px）硬拉伸成卡面 -->
          <div v-else class="ww-role-img is-empty">
            <img v-if="role.avatar" :src="role.avatar" :alt="role.name" />
            <i v-else :class="role.icon"></i>
            <span>这张牌用「梦客车票」代替</span>
          </div>

          <!-- 遮罩：压在卡面上的一层渐变，角色牌信息全部落在里面 -->
          <div class="ww-role-mask">
            <div class="ww-role-job">
              <i :class="role.icon"></i>{{ role.job }}
            </div>
            <div class="ww-role-name">
              {{ role.name }}<small>{{ role.title }}</small>
            </div>
            <div class="ww-role-camp">
              <i class="fa-solid" :class="role.camp === CAMP.HUNT ? 'fa-crosshairs' : 'fa-train'"></i>
              {{ campName }}
            </div>
            <div class="ww-role-skill">{{ role.skill }}</div>
            <div v-if="role.motto" class="ww-role-motto">“{{ role.motto }}”</div>
          </div>
        </div>
      </template>

      <!-- 还没发牌 -->
      <div v-else class="ww-role-empty">
        <i class="fa-solid fa-hourglass-half"></i>
        <span>{{ hidden ? '正在接收你的身份牌…' : '本局你没有身份牌' }}</span>
      </div>
    </div>

    <!-- 卡以外的信息统一放这一列：宽屏时并排到卡的右侧 -->
    <div class="ww-role-side">
    <!--  私有信息回显（只有本人能看到的内容）  -->
    <div v-if="infoLines.length" class="ww-feed" style="margin-top: 0">
      <div class="ww-feed-title"><i class="fa-solid fa-lock"></i> 只有你知道</div>
      <div class="ww-feed-list">
        <div v-for="(l, i) in infoLines" :key="i" class="ww-line-item is-gold">{{ l }}</div>
      </div>
    </div>

    <!--  行动面板  -->
    <div v-if="pending" class="ww-action">
      <div class="ww-action-title">
        <i class="fa-solid fa-hand-pointer"></i>
        {{ actionTitle }}
      </div>
      <div class="ww-action-hint">{{ actionHint }}</div>

      <!-- 姬子：先决定用哪瓶药 -->
      <div v-if="pending === 'witch'" class="ww-action-choices">
        <button class="ww-btn is-primary is-sm" :disabled="!canSave" :title="saveTitle" @click="doSave">
          <i class="fa-solid fa-mug-hot"></i> {{ TERMS.witchSave }}
        </button>
        <button
          class="ww-btn is-danger is-sm"
          :disabled="!canPoison"
          @click="witchMode = witchMode === 'poison' ? '' : 'poison'"
        >
          <i class="fa-solid fa-flask-vial"></i> {{ TERMS.witchPoison }}
        </button>
      </div>

      <!-- 跳过出口：银狼 / 瓦尔特 / 姬子 / 流萤 四种夜间角色牌都有这一条
           （用户要求「无论是哪个角色牌，都要有可以选择跳过的按钮」）。
           点了就是「本夜不使用技能」——引擎会落一个明确的标记，
           夜间分步才会认为你这一步走完了；不落标记，这一步永远收不了。 -->
      <div v-if="passLabel" class="ww-action-choices">
        <button class="ww-btn is-ghost is-sm" @click="doPass">
          <i class="fa-solid fa-ban"></i> {{ passLabel }}
        </button>
        <span v-if="passHint" class="ww-action-hint">{{ passHint }}</span>
      </div>

      <div v-if="showTargets" class="ww-targets">
        <button
          v-for="t in targets"
          :key="t.id"
          class="ww-target"
          :class="{ 'is-active': pikedHint(t) }"
          :disabled="t.disabled"
          :title="t.reason || ''"
          @click="onTarget(t)"
        >
          {{ t.seat }} · {{ t.name }}
          <em v-if="t.mark" class="ww-target-mark">{{ t.mark }}</em>
        </button>
      </div>
      <div v-if="showTargets && !targets.length" class="ww-action-hint" style="margin-top: 8px">
        现在没有可选的乘客。
      </div>
    </div>

    <!-- 已经行动完毕 / 本夜无事 -->
    <div v-else-if="role && aliveSelf" class="ww-action" style="border-color: var(--ww-line); background: transparent">
      <div class="ww-action-title" style="color: var(--ww-text-dim)">
        <i class="fa-solid fa-check"></i>
        {{ doneText }}
      </div>
      <div class="ww-action-hint">{{ doneHint }}</div>
    </div>

    <!-- 列车广播：帕姆念的播报。
         原本挂在卡片外的 .ww-sidebar 里，页面窄于 1080px 时侧栏会掉到卡片下面，
         播报就跑到「游戏外面」去了 —— 现在搬回卡片内、并进这一列（用户要求）。
         每条前面挂帕姆头像；重点片段（时间 / 关键事件）按 parts 分段上色。 -->
    <div class="ww-feed ww-feed-cast">
      <div class="ww-feed-title">
        <i class="fa-solid fa-tower-broadcast"></i> {{ TERMS.publicChannel }}
        <span class="ww-cast-count">{{ feed.length }}</span>
      </div>
      <div class="ww-feed-list is-cast">
        <div v-if="!feed.length" class="ww-chat-empty">帕姆还没有开口。帕</div>
        <div
          v-for="f in feed"
          :key="f.id"
          class="ww-line-item has-face"
          :class="f.tone && f.tone !== 'info' ? 'is-' + f.tone : ''"
        >
          <img class="ww-feed-face" :src="PM_AVATAR" alt="帕姆" draggable="false" />
          <span class="ww-line-text">
            <span
              v-for="(seg, i) in partsOf(f)"
              :key="i"
              :class="seg.m ? 'ww-hl is-' + seg.m : ''"
            >{{ seg.t }}</span>
          </span>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
// 自己那一块：身份卡 + 私有信息 + 行动面板；组件只管「能做什么」，规则判定一律回给父组件
import { computed, ref, watch } from 'vue'
import { ROLES, ROLE, CAMP, TERMS, PM_AVATAR, pickRoleCard } from '@/config/werewolf'

const props = defineProps({
  roleKey: { type: String, default: '' },
  hidden: { type: Boolean, default: false },
  privateInfo: { type: Object, default: () => ({}) },
  // 'wolf-kill' | 'seer-check' | 'witch' | 'firefly-light' | ''
  pending: { type: String, default: '' },
  // [{ id, name, seat, disabled, reason }]
  targets: { type: Array, default: () => [] },
  // 完整座位名单：只用来把「同伴 / 昨夜照亮过谁」这类 id 翻成人名，
  // 因为 targets 只含「此刻可选的人」，已离场的同伴不会出现在里面
  players: { type: Array, default: () => [] },
  pickedId: { type: String, default: '' },
  aliveSelf: { type: Boolean, default: true },
  phaseLabel: { type: String, default: '' },
  // 帕姆的播报（列车广播）。用户要求把它从卡片外的侧栏搬回卡片内，
  // 并进自我面板这一列 —— 所以数据从父组件灌进来，由这个面板负责渲染。
  feed: { type: Array, default: () => [] },
})

const emit = defineEmits(['act'])
const witchMode = ref('')

const role = computed(() => (props.roleKey ? ROLES[props.roleKey] : null))
const isFirefly = computed(() => props.roleKey === ROLE.FIREFLY)
const campName = computed(() => {
  const c = role.value?.camp
  if (c === CAMP.HUNT) return TERMS.teamHunt
  if (c === CAMP.TRAIN) return TERMS.teamTrain
  return ''
})

// 换夜之后把「毒咖啡模式」重置掉，否则会拿着上一夜的意图去点
watch(() => props.pending, () => { witchMode.value = '' })

// 卡面：开拓者有男、女两张，随机分一张。
// ★ 只在「换身份」时抽一次并存下来 —— 放进 computed 会让每次重渲染都换脸。
const cardSrc = ref('')
watch(() => props.roleKey, (k) => { cardSrc.value = pickRoleCard(k) }, { immediate: true })

// 先查完整座名单（含已离场的同伴），再退回 targets（只含此刻可选项）
const findP = (id) => props.players.find((x) => x.id === id) || props.targets.find((x) => x.id === id)
const nameOf = (id) => {
  if (!id) return ''
  const t = findP(id)
  return t ? `${t.seat} 号 ${t.name}` : id
}

// 播报分段：引擎 pushFeed 已经算好 parts；万一是旧快照（没带 parts）就退回整条纯文本
const partsOf = (f) => (f.parts?.length ? f.parts : [{ t: f.text }])

//  私有信息 
const infoLines = computed(() => {
  const info = props.privateInfo || {}
  const out = []
  if (info.mates?.length) {
    const mates = info.mates.map((id) => nameOf(id)).join('、')
    out.push(`同伴（${TERMS.wolfChannel}）：${mates}`)
  }
  if (info.seerResult) {
    const t = info.seerResult
    out.push(`感应结果：${nameOf(t.targetId) || '（未选）'} —— ${t.team === CAMP.HUNT ? '星核猎手' : '列车组'}`)
  }
  if (info.fireflyInfo) {
    const f = info.fireflyInfo
    if (f.litId) out.push(`本夜已照亮：${nameOf(f.litId)}`)
    if (f.lastLitId) out.push(`昨夜照亮过：${nameOf(f.lastLitId)}（今夜不能重复）`)
  }
  if (info.witchInfo) {
    const w = info.witchInfo
    out.push(`${TERMS.witchSave} 剩余：${w.saveLeft ?? 0} 瓶 · ${TERMS.witchPoison} 剩余：${w.poisonLeft ?? 0} 瓶`)
    out.push(`今晚被${TERMS.kill}：${w.killedId ? nameOf(w.killedId) : '（银狼还没决定）'}`)
  }
  return out
})

//  行动面板文案 
const actionTitle = computed(() => {
  switch (props.pending) {
    case 'wolf-kill': return `${TERMS.kill}一名乘客`
    case 'seer-check': return `${TERMS.seerCheck}一名乘客`
    case 'witch': return '决定要不要动用咖啡'
    case 'firefly-light': return `${TERMS.fireflyLight}一名乘客`
    default: return '本夜行动'
  }
})

const actionHint = computed(() => {
  switch (props.pending) {
    case 'wolf-kill':
      return `你和同伴共同选一个目标，两人都选定后以多数票为准。同伴也能点（会标出来），但一般不划算。`
    case 'seer-check':
      return `只能得到「${TERMS.teamHunt} / ${TERMS.teamTrain}」这个结论，看不到具体身份。每晚一次。`
    case 'witch':
      return witchMode.value === 'poison'
        ? `再点一次「${TERMS.witchPoison}」可取消。毒下去的人无法被任何方式救回。`
        : `你知道今晚谁被${TERMS.kill}。咖啡可以完全救下他；毒咖啡则可以直接带走一个人。两瓶各只有一次。`
    case 'firefly-light':
      return `被照亮的人当晚若被${TERMS.kill}，不会立刻离场（推迟到下一个${TERMS.day}公布）。不能照自己，也不能连续两晚照同一人。`
    default:
      return ''
  }
})

const doneText = computed(() => (props.phaseLabel ? `${props.phaseLabel}你没有需要做的事` : '本阶段你没有需要做的事'))
const doneHint = computed(() => {
  if (!props.aliveSelf) return '你已经离场了，接下来的时间里只能旁观。'
  if (props.roleKey === ROLE.VILLAGER) return `作为${TERMS.survivor}，你的武器只有推理和票。`
  return '等着看结果吧，萤火会替你照亮的。'
})

//  可选目标 
const witch = computed(() => props.privateInfo?.witchInfo || {})
const canSave = computed(() => props.pending === 'witch' && (witch.value.saveLeft || 0) > 0 && !!witch.value.killedId)
const canPoison = computed(() => props.pending === 'witch' && (witch.value.poisonLeft || 0) > 0)
const saveTitle = computed(() =>
  !witch.value.killedId ? '银狼还没决定目标，再等等' : `救下 ${nameOf(witch.value.killedId)}`
)

// 女巫只有进入「毒咖啡」模式才需要点名单
const showTargets = computed(() => {
  if (!props.pending) return false
  if (props.pending === 'witch') return witchMode.value === 'poison'
  return true
})

function pikedHint(t) {
  return props.pickedId === t.id
}

function onTarget(t) {
  if (t.disabled) return
  const action = props.pending === 'witch' ? 'witch-poison' : props.pending
  emit('act', { action, targetId: t.id })
}

function doSave() {
  if (!canSave.value) return
  emit('act', { action: 'witch-save', targetId: witch.value.killedId })
}

//  跳过（不使用技能）：把引擎给的 pending 映射到对应的 -pass 动作，四种夜间角色各一条
const PASSES = {
  'wolf-kill': { action: 'wolf-pass', label: '本夜不动手', hint: '选择空刀的话，今晚不会有人离开梦境。' },
  'seer-check': { action: 'seer-pass', label: '本夜不感应', hint: '感应不消耗次数，但这一夜你不会拿到任何结论。' },
  witch: { action: 'witch-pass', label: '本夜都不用', hint: '两瓶药都留着，往后的夜晚依然可以用。' },
  'firefly-light': { action: 'firefly-pass', label: '本夜不照亮', hint: '这一夜的光不会落在任何人身上。' },
}
const passAction = computed(() => PASSES[props.pending]?.action || '')
const passLabel = computed(() => PASSES[props.pending]?.label || '')
const passHint = computed(() => PASSES[props.pending]?.hint || '')

function doPass() {
  if (!passAction.value) return
  emit('act', { action: passAction.value })
}
</script>
