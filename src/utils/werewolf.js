//  萤火夜话 · 规则引擎（纯逻辑层）
import {
  ROLE,
  ROLES,
  CAMP,
  PHASE,
  PHASE_MS,
  SPEAK_MS,
  NIGHT_STEPS,
  NIGHT_STEP_LABEL,
  NIGHT_STEP_MS,
  TERMS,
  REWARDS,
  FIREFLY_DELAY_DEATH,
  isWolfRole,
  checkWin,
  huntWinReason,
  villagerStat,
  buildRolePool,
  assignRoles,
  pickAiNames,
  pickSeatAvatars,
} from '@/config/werewolf'

//  小工具 

// 对局内的自增 id（聊天消息去重、事件标识都靠它）
function bump(state, prefix = 'm') {
  state._seq = (state._seq || 0) + 1
  return `${prefix}${state._seq}`
}

const emptyNight = () => ({
  wolfVotes: {},      // { wolfId: targetId }
  wolfOrder: [],      // 投票先后，用于平票时取「先到」
  // 银狼明确选择「本夜不杀」。和 wolfVotes 一样是「已决策」标记，
  // 但不会产生目标 —— 全体狼都空刀时 wolfTarget() 返回 null，即空刀。
  wolfPassed: {},
  wolfTallied: {},    // 本夜是否已为计分记过一笔，避免改来改去刷分
  seerTarget: null,
  seerPassed: false,  // 瓦尔特明确选择「本夜不感应」
  witchSave: false,   // 本夜是否用了咖啡
  witchPoison: null,  // 本夜是否用了毒咖啡
  witchPassed: false, // 女巫明确选择「本夜都不用」
  fireflyLit: null,
  fireflyPassed: false, // 流萤明确选择「本夜不照亮」
  resolved: false,
})

// 轮流发言 / 遗言阶段的载体。order 是发言顺序，index 指向「轮到谁」。
// index 越界 = 这一阶段发完了，由调用方推进到下一阶段。
const emptySpeaking = () => ({ mode: '', order: [], index: 0, said: {} })

//  查询辅助 

export const playerOf = (state, id) => state.players.find((p) => p.id === id) || null
export const isAlive = (state, id) => state.alive.includes(id)
export const aliveIds = (state) => state.alive.slice()
export const roleOf = (state, id) => state.roleMap[id] || null

export const wolfIds = (state) => Object.keys(state.roleMap).filter((id) => isWolfRole(state.roleMap[id]))
export const aliveWolves = (state) => wolfIds(state).filter((id) => isAlive(state, id))
export const aliveTeammates = (state, id) => aliveWolves(state).filter((x) => x !== id)

// 参战玩家 —— 判官是帕姆，不占座位，所以就是全部人
export const seatedPlayers = (state) => state.players

// 找某个角色当前的人（每局每种角色最多一个）
export function findRole(state, roleKey) {
  const id = Object.keys(state.roleMap).find((k) => state.roleMap[k] === roleKey)
  return id && isAlive(state, id) ? id : null
}

// 银狼的最终目标：多数票；平票时取「先投出的那个」，保证同一份 state 反复计算结果一致
export function wolfTarget(state) {
  const votes = state.night.wolfVotes
  const ids = Object.keys(votes)
  if (ids.length === 0) return null
  const tally = {}
  ids.forEach((voter) => {
    const t = votes[voter]
    tally[t] = (tally[t] || 0) + 1
  })
  let best = null
  let bestCount = -1
  Object.keys(tally).forEach((target) => {
    const c = tally[target]
    if (c > bestCount) {
      bestCount = c
      best = target
    } else if (c === bestCount && best) {
      // 平票：谁先被投谁算数
      const a = state.night.wolfOrder.indexOf(target)
      const b = state.night.wolfOrder.indexOf(best)
      if (a >= 0 && (b < 0 || a < b)) best = target
    }
  })
  return best
}

// 帕姆复盘用的「谁在夜里做了什么」。
// ★ 对局进行中这一份不下发给任何人（见 getSnapshot 的 judgeInfo），
//   里面直接写着谁被骇入、瓦尔特验了谁、姬子救了谁、流萤照亮了谁。
//   只有 phase === OVER 那一刻才拿出来，当赛后复盘。
export function nightActionsOf(state) {
  const n = state.night
  const nameOf = (id) => (id ? playerOf(state, id)?.name || id : '')
  const seatOf = (id) => (id ? playerOf(state, id)?.seat ?? '' : '')
  const kill = wolfTarget(state)
  return {
    kill,
    killName: nameOf(kill),
    killSeat: seatOf(kill),
    seer: n.seerTarget,
    seerName: nameOf(n.seerTarget),
    seerSeat: seatOf(n.seerTarget),
    // 「瓦尔特昨晚验到的是好人还是坏人」—— 判官每次进入新一天都要看到这一条
    seerTeam: n.seerTarget ? seerTeamOf(state, n.seerTarget) : '',
    seerTeamLabel: n.seerTarget
      ? (isWolfRole(state.roleMap[n.seerTarget]) ? TERMS.teamHunt : TERMS.teamTrain)
      : '',
    witchSave: n.witchSave,
    witchPoison: n.witchPoison,
    witchPoisonName: nameOf(n.witchPoison),
    witchPoisonSeat: seatOf(n.witchPoison),
    firefly: n.fireflyLit,
    fireflyName: nameOf(n.fireflyLit),
    fireflySeat: seatOf(n.fireflyLit),
  }
}

//  事件记录 

// 帕姆播报里的「重点」。两种都做文字加重（用户要求「两者都要」）：
//   time  → 重要时间：第 3 夜 / 35 秒 / 25 秒内
//   event → 关键事件：昨夜离场：X / X 被放逐 / 平票（A、B）/ 挡下了一次骇入 …
// ★ 这里只产出「分段数组」，不生成任何 HTML；视图用 v-for 渲成 <span>，
//   免得为了加粗把整条播报丢进 v-html。
const MARK_RULES = [
  { m: 'time', re: /第\s*\d+\s*[夜天]|\d+\s*秒(?:内)?/g },
  {
    m: 'event',
    re: /昨夜离场[：:][^。]*|[^，。；]*平票[（(][^）)]*[）)]|[^，。；]*被(?:放逐|骇入|投出)[^，。；]*|与他一同离场|[^，。；]*(?:挡下了一次骇入|离开了梦境)/g,
  },
]

// 把一条播报切成 [{ t, m? }]。m 有值就是需要加重的片段，没值就是普通文本。
function markParts(text) {
  const hits = []
  for (const { m, re } of MARK_RULES) {
    re.lastIndex = 0 // 带 g 的正则是有状态的，每次重新扫之前必须复位
    let x
    while ((x = re.exec(text))) hits.push({ s: x.index, e: x.index + x[0].length, m })
  }
  if (!hits.length) return [{ t: text }]
  hits.sort((a, b) => a.s - b.s || b.e - a.e)
  const out = []
  let cur = 0
  for (const h of hits) {
    if (h.s < cur) continue // 与上一段重叠 → 丢掉，保证分段首尾相接
    if (h.s > cur) out.push({ t: text.slice(cur, h.s) })
    out.push({ t: text.slice(h.s, h.e), m: h.m })
    cur = h.e
  }
  if (cur < text.length) out.push({ t: text.slice(cur) })
  return out
}

// 全员可见的播报（帕姆口吻）
// ★ 帕姆说的每一句都带尾音「帕」，加在整句最末尾（用户要求）。
//   收在引擎这一个入口里 —— 视图与联机快照拿到的就都是带「帕」的版本，
//   别再往各个调用点各写一遍。
export function pushFeed(state, text, tone = 'info') {
  const full = text.endsWith('帕') ? text : `${text}帕`
  state.feed.push({
    id: bump(state, 'f'),
    text: full,
    parts: markParts(full),
    tone,
    ts: Date.now(),
    round: state.round,
  })
  if (state.feed.length > 200) state.feed.splice(0, state.feed.length - 200)
}

// 上帝视角行动日志（只进赛后复盘，对局中不下发）
export function pushLog(state, text) {
  state.log.push({ id: bump(state, 'l'), text, ts: Date.now(), round: state.round, phase: state.phase })
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300)
}

// 频道发言
// ★ 只认 day / wolf 两个频道（判官固定是帕姆，没有判官频道了）。
//   任何别的值一律落到 day —— 客户端塞个 'judge' 进来也只会变成一条公开消息。
export function pushChat(state, { fromId, name, text, channel = 'day' }) {
  const clean = String(text || '').slice(0, 200).trim()
  if (!clean) return null
  const ch = channel === 'wolf' ? 'wolf' : 'day'
  const msg = {
    id: bump(state, 'c'),
    fromId,
    name: name || playerOf(state, fromId)?.name || '乘客',
    text: clean,
    channel: ch,
    round: state.round,
    ts: Date.now(),
  }
  state.chat.push(msg)
  if (state.chat.length > 400) state.chat.splice(0, state.chat.length - 400)
  return msg
}

// 计分（按玩家分别累计，结算时各客户端算自己的那份）
export function bumpTally(state, playerId, key, n = 1) {
  if (!playerId) return
  if (!state.tally[playerId]) state.tally[playerId] = { nightActions: 0, voteHits: 0, fireflySaves: 0 }
  state.tally[playerId][key] = (state.tally[playerId][key] || 0) + n
}

//  建局 

// players: [{ id, name, isAI?, avatar? }] —— 全部参战，判官不在其中（帕姆不占座位）
export function createState({ mode = 'solo', players = [], startedAt = Date.now() } = {}) {
  const seated = players.map((p, i) => ({ ...p, seat: p.seat ?? i + 1 }))
  const pool = buildRolePool(seated.length)
  const roleMap = assignRoles(seated, pool)

  return {
    mode,
    players: seated,
    roleMap,
    alive: seated.map((p) => p.id),
    round: 0,
    phase: PHASE.IDLE,
    deadline: 0,
    startedAt,
    night: emptyNight(),
    // 夜晚内部的当前分步：'wolf' | 'seer' | 'witch' | 'firefly'（'done' / '' = 不在夜里）
    // 顺序与限时都在 config 的 NIGHT_STEPS / NIGHT_STEP_MS 里，这里只存「现在走到哪」
    nightStep: '',
    // 上一阶段（用户要求：阶段条要显示「现在是哪个阶段、上一个阶段是谁」）。
    // 夜里分步时 prevPhase 仍是 'night'，具体是哪一步看 prevNightStep。
    prevPhase: '',
    prevNightStep: '',
    // 瓦尔特的历史验人结果：[{ round, targetId, team }]
    // ★ 单独存一份而不是只看 state.night —— 判官「进入新一天后要列出昨晚验到的是好人还是坏人」，
    //   夜晚结算完 night.seerTarget 会被清空，所以必须留档。
    seerHistory: [],
    // 丹恒的反击：被放逐时进入 PHASE.HUNTER，由他指定一名乘客同去
    hunterId: '',
    hunterDone: false,
    hunterFired: '',
    lastFireflyLit: null,
    // 姬子的两瓶药是「整局各一次」，不是「每夜一次」—— 必须跨夜保留用量
    witchSaveLeft: 1,
    witchPoisonLeft: 1,
    delayedDeaths: [],     // 萤火延后的离场，元素 { id, round }
    lastNightDeaths: [],
    lastNightSaved: false,
    lastNightSavedBy: '',  // '' | 'coffee' | 'firefly'
    votes: {},
    // 投票轮次：1 = 本轮正常投票；平票后进 2 = 加时重投一轮。
    // 第二轮仍平票才流局（见 resolveVote）。
    voteRound: 1,
    voteTieIds: [],        // 上一轮平票的人（仅用于 UI 提示）
    // 轮流发言 / 遗言的统一载体：{ mode, order[], index, said{} }
    // mode = 'lastwords'（昨夜离场者） | 'speaking'（存活者按座位）
    speaking: emptySpeaking(),
    survived: {},          // { playerId: 活过的昼夜数 }
    tally: {},             // 见 bumpTally
    feed: [],
    log: [],
    chat: [],
    winner: null,
    reveal: {},
    _seq: 0,
  }
}

// 单人模式：1 名人类玩家 + (total-1) 名 AI 乘客
// myAvatar = 玩家自己设定的头像（data URL）；AI 头像随机取自素材小图，与身份无关
export function buildSoloPlayers(total, myName, myAvatar = '') {
  const names = pickAiNames(total - 1)
  const avatars = pickSeatAvatars(total - 1)
  const list = [{ id: 'me', name: myName || '开拓者', isAI: false, avatar: myAvatar || '' }]
  names.forEach((n, i) => list.push({ id: `ai${i + 1}`, name: n, isAI: true, avatar: avatars[i] || '' }))
  return list
}

//  阶段推进 

export function startNight(state) {
  state.round += 1
  state.night = emptyNight()
  state.votes = {}
  state.phase = PHASE.NIGHT
  // 夜晚从第一步开始（银狼先手）：狼定刀口 → 瓦尔特感应 → 姬子知道刀口后决定用药 → 流萤照亮
  state.nightStep = NIGHT_STEPS[0]
  state.deadline = Date.now() + (NIGHT_STEP_MS[NIGHT_STEPS[0]] || PHASE_MS[PHASE.NIGHT])
  // 反击只在「被放逐」那一刻有效，进夜即清空
  state.hunterId = ''
  state.hunterDone = false
  state.hunterFired = ''
  pushFeed(state, `第 ${state.round} 夜 · ${TERMS.night}。梦境沉了下来，能动的只有少数几个人。`, 'night')
  pushLog(state, `第 ${state.round} 夜：第一步 —— ${NIGHT_STEP_LABEL[NIGHT_STEPS[0]]}`)
  return state.round
}

//  夜间分步推进 
//
// 一夜被拆成 银狼 → 瓦尔特 → 姬子 → 流萤 四步，每步单独限时（NIGHT_STEP_MS）。
// 返回推进后的步骤；走到最后一步之后再调一次会返回 'done'，表示这一夜可以结算了。
export function advanceNightStep(state) {
  if (state.phase !== PHASE.NIGHT) return 'done'
  const i = NIGHT_STEPS.indexOf(state.nightStep)
  const next = i < 0 ? NIGHT_STEPS[0] : (NIGHT_STEPS[i + 1] || 'done')
  state.nightStep = next
  if (next === 'done') {
    state.deadline = 0
    return 'done'
  }
  state.deadline = Date.now() + (NIGHT_STEP_MS[next] || PHASE_MS[PHASE.NIGHT])
  pushLog(state, `第 ${state.round} 夜：下一步 —— ${NIGHT_STEP_LABEL[next] || next}`)
  return next
}

// 这一夜的四个步骤都走完了吗（阶段不是夜晚时一律算「已走完」）
export const nightStepsDone = (state) =>
  state.phase !== PHASE.NIGHT || state.nightStep === 'done'

// 分步文案（阶段条 / 判官面板共用），别在视图里再抄一份
export const nightStepLabel = (step) => NIGHT_STEP_LABEL[step] || ''

// 进入梦醒：先兑现萤火延后的离场，再公布本夜结果
export function startDay(state, nightResult = null) {
  state.phase = PHASE.DAY
  state.deadline = 0
  state.nightStep = ''

  const deaths = []
  // 1) 萤火延后的死：上一个昼夜欠下的账，本日兑现
  const due = state.delayedDeaths.filter((d) => d.round < state.round)
  due.forEach((d) => {
    if (isAlive(state, d.id)) deaths.push({ id: d.id, why: 'firefly-delay' })
  })
  state.delayedDeaths = state.delayedDeaths.filter((d) => d.round >= state.round)

  // 2) 本夜正常结算的死者
  ;(nightResult?.deaths || []).forEach((id) => {
    if (!deaths.some((d) => d.id === id)) deaths.push({ id, why: 'night' })
  })

  deaths.forEach((d) => killPlayer(state, d.id))
  state.lastNightDeaths = deaths.map((d) => d.id)
  state.lastNightSaved = !!nightResult?.saved
  state.lastNightSavedBy = nightResult?.savedBy || ''

  // 3) 存活计分（活过这个梦醒就算活过一个昼夜）
  state.alive.forEach((id) => {
    state.survived[id] = (state.survived[id] || 0) + 1
  })

  // 4) 播报
  if (deaths.length === 0) {
    pushFeed(state, `天亮了 · 第 ${state.round} 天。${TERMS.peaceNight} —— 昨夜没有人离开梦境。`, 'good')
  } else {
    const names = deaths.map((d) => playerOf(state, d.id)?.name || d.id).join('、')
    pushFeed(state, `天亮了 · 第 ${state.round} 天。昨夜离场：${names}。`, 'bad')
  }
  if (state.lastNightSaved) {
    const how = state.lastNightSavedBy === 'firefly' ? '一束萤火' : TERMS.witchSave
    pushFeed(state, `${how}挡下了一次骇入。`, 'good')
  }

  // 5) 复盘素材：谁被骇入、瓦尔特验到的是好人还是坏人、流萤照亮了谁。
  //    这几条只进 log，而 getSnapshot 只在 phase === OVER 时才下发 log，
  //    所以对局进行中不会泄露给任何玩家。结算后再拿出来看，就是一份完整交代。
  const info = nightActionsOf(state)
  const lines = []
  if (info.killName) lines.push(`银狼骇入 → ${info.killSeat} 号 ${info.killName}`)
  if (info.seerName) {
    lines.push(`瓦尔特感应 → ${info.seerSeat} 号 ${info.seerName} 是「${info.seerTeamLabel}」`)
  }
  if (info.witchSave) lines.push('姬子动用了姬子的咖啡')
  if (info.witchPoisonName) {
    lines.push(`姬子动用毒咖啡 → ${info.witchPoisonSeat} 号 ${info.witchPoisonName}`)
  }
  if (info.fireflyName) lines.push(`流萤照亮 → ${info.fireflySeat} 号 ${info.fireflyName}`)
  pushLog(state, `第 ${state.round} 天 · 昨夜复盘：${lines.length ? lines.join('；') : '这一夜没有任何动作'}`)

  // 瓦尔特昨晚的结论单独再列一条 —— 用户要求的「进入新一天后，判官要列出验到的是好人还是坏人」
  const lastSeer = state.seerHistory.filter((h) => h.round === state.round).slice(-1)[0]
  if (lastSeer) {
    const t = playerOf(state, lastSeer.targetId)
    const which = lastSeer.team === CAMP.HUNT
      ? `${TERMS.teamHunt}（坏人）`
      : `${TERMS.teamTrain}（好人）`
    pushLog(
      state,
      `第 ${state.round} 天 · 预言结果：${t?.seat ?? ''} 号 ${t?.name || lastSeer.targetId} 是 ${which}`
    )
  }
  return { deaths: state.lastNightDeaths, saved: state.lastNightSaved }
}

//  遗言 / 轮流发言 
//
// 两个阶段共用同一套「轮流发言」机制，区别只在 order 从哪来：
//   LAST_WORDS → 昨夜离场的人（先说遗言）
//   SPEAKING   → 还活着的所有人，按座位顺序
// index 越界即表示「发完了」，由调用方（composable / AI 驱动）推进阶段。

export function startLastWords(state) {
  const dead = state.lastNightDeaths.slice()
  state.phase = PHASE.LAST_WORDS
  state.speaking = { mode: 'lastwords', order: dead, index: 0, said: {} }
  state.deadline = dead.length ? Date.now() + SPEAK_MS : 0
  if (dead.length) {
    const names = dead.map((id) => playerOf(state, id)?.name || id).join('、')
    pushFeed(state, `${names} 还有话要说 —— 先听离场的人把判断讲完。`, 'warn')
  }
  return dead
}

export function startSpeaking(state) {
  // 按座位顺序，全员参战
  const order = seatedPlayers(state)
    .filter((p) => isAlive(state, p.id))
    .sort((a, b) => (a.seat || 0) - (b.seat || 0))
    .map((p) => p.id)
  state.phase = PHASE.SPEAKING
  state.speaking = { mode: 'speaking', order, index: 0, said: {} }
  state.deadline = order.length ? Date.now() + SPEAK_MS : 0
  if (order.length) {
    pushFeed(state, `轮流发言开始，每人 ${Math.round(SPEAK_MS / 1000)} 秒，按座位顺序来。`, 'info')
  }
  return order
}

// 当前该谁发言；没有（阶段不对 / 已发完）返回 null
export function currentSpeaker(state) {
  if (state.phase !== PHASE.LAST_WORDS && state.phase !== PHASE.SPEAKING) return null
  const sp = state.speaking
  return sp.order[sp.index] || null
}

// 这一轮轮流发言/遗言是否已经全部发完
export function speakingDone(state) {
  if (state.phase !== PHASE.LAST_WORDS && state.phase !== PHASE.SPEAKING) return true
  return state.speaking.index >= state.speaking.order.length
}

// 轮到下一位；返回 true 表示这一阶段发完了
export function advanceSpeaker(state) {
  const sp = state.speaking
  sp.index += 1
  if (sp.index >= sp.order.length) {
    state.deadline = 0
    return true
  }
  state.deadline = Date.now() + SPEAK_MS
  return false
}

// 发言（幂等：轮不到你 / 你已经说过就原样返回）
export function submitSpeak(state, speakerId, text) {
  if (state.phase !== PHASE.LAST_WORDS && state.phase !== PHASE.SPEAKING) {
    return { ok: false, msg: '现在不是发言时间' }
  }
  if (currentSpeaker(state) !== speakerId) return { ok: false, msg: '还没轮到你发言' }
  const clean = String(text || '').slice(0, 200).trim()
  if (!clean) return { ok: false, msg: '说点什么吧' }
  if (state.speaking.said[speakerId]) return { ok: true, duplicate: true }
  state.speaking.said[speakerId] = clean
  pushChat(state, { fromId: speakerId, text: clean, channel: 'day' })
  // 遗言同时进广播，避免只有盯着频道才看得见
  if (state.speaking.mode === 'lastwords') {
    pushFeed(state, `${playerOf(state, speakerId)?.name} 的遗言：${clean}`, 'warn')
    pushLog(state, `第 ${state.round} 天：${playerOf(state, speakerId)?.name} 遗言 —— ${clean}`)
  } else {
    pushLog(state, `第 ${state.round} 天：${playerOf(state, speakerId)?.name} 发言 —— ${clean}`)
  }
  advanceSpeaker(state)
  return { ok: true, text: clean }
}

// 「我说完了」/ 挂机超时：不发言直接过掉这一位（幂等）
export function skipSpeak(state, speakerId) {
  if (state.phase !== PHASE.LAST_WORDS && state.phase !== PHASE.SPEAKING) {
    return { ok: false, msg: '现在不是发言时间' }
  }
  if (currentSpeaker(state) !== speakerId) return { ok: false, msg: '还没轮到你发言' }
  const wasLast = state.speaking.index >= state.speaking.order.length - 1
  advanceSpeaker(state)
  return { ok: true, last: wasLast }
}

export function startDiscuss(state) {
  state.phase = PHASE.DISCUSS
  state.speaking = emptySpeaking()
  state.deadline = Date.now() + PHASE_MS[PHASE.DISCUSS]
  pushFeed(state, `自由发言开始，${Math.round(PHASE_MS[PHASE.DISCUSS] / 1000)} 秒。谁都可以说，说说你的判断吧。`, 'info')
}

export function startVote(state) {
  state.phase = PHASE.VOTE
  state.votes = {}
  state.voteRound = 1
  state.voteTieIds = []
  state.speaking = emptySpeaking()
  state.deadline = Date.now() + PHASE_MS[PHASE.VOTE]
  pushFeed(state, `${TERMS.vote}开始，${Math.round(PHASE_MS[PHASE.VOTE] / 1000)} 秒内选出你要${TERMS.exile}的人（可以弃票）。`, 'info')
}

// 平票加时：清空票型重投一轮，但不清 voteRound（靠它区分第 1 / 第 2 轮）
export function startRevote(state) {
  state.votes = {}
  state.deadline = Date.now() + PHASE_MS[PHASE.VOTE]
  const names = state.voteTieIds.map((id) => playerOf(state, id)?.name || id).join('、')
  pushFeed(
    state,
    `平票（${names}）—— 加时重投一轮，全场重新投，可以改投也可以弃票。再平票才流局。`,
    'warn'
  )
}

//  丹恒 · 反击 
//
// 被投票放逐之后，丹恒可以指定一名乘客与他一同离场。
// ★ 这一刻丹恒自己已经离场了（applyExile 先把他杀了），所以这个阶段**不能**用
//   isAlive 判断他还在不在场 —— 判「谁欠一个决定」靠的是 state.hunterId。
export function startHunter(state, hunterId) {
  state.phase = PHASE.HUNTER
  state.hunterId = hunterId || ''
  state.hunterDone = false
  state.hunterFired = ''
  state.deadline = Date.now() + PHASE_MS[PHASE.HUNTER]
  const p = playerOf(state, hunterId)
  pushFeed(
    state,
    `${p?.name || '丹恒'} 被${TERMS.exile} —— 他还有最后一件事要做：${TERMS.hunterShoot}。`,
    'warn'
  )
  pushLog(state, `第 ${state.round} 天：${p?.name} 是丹恒，进入「${TERMS.hunterShoot}」阶段`)
  return state.hunterId
}

// 猎人此刻是否还欠一个决定（只对丹恒本人返回 true）
export function hunterPending(state, playerId) {
  if (state.phase !== PHASE.HUNTER) return false
  if (!state.hunterId || state.hunterId !== playerId) return false
  return !state.hunterDone
}

// 「现在还在等谁」——AI 判官据此判断这一阶段能不能收
export const hunterActorsPending = (state) =>
  state.phase === PHASE.HUNTER && state.hunterId && !state.hunterDone ? [state.hunterId] : []

// 开枪：带走一名还在梦境里的乘客
export function submitHunterShoot(state, actorId, targetId) {
  if (state.phase !== PHASE.HUNTER) return { ok: false, msg: '现在不是反击的时间' }
  if (state.hunterId !== actorId) return { ok: false, msg: '只有丹恒能发动反击' }
  if (state.hunterDone) return { ok: true, duplicate: true }
  if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
  state.hunterDone = true
  state.hunterFired = targetId
  killPlayer(state, targetId)
  const shooter = playerOf(state, actorId)
  const victim = playerOf(state, targetId)
  pushFeed(
    state,
    `${shooter?.name || '丹恒'} 发动「${TERMS.hunterShoot}」，${victim?.name || targetId} 与他一同离场。`,
    'bad'
  )
  pushLog(
    state,
    `第 ${state.round} 天：丹恒（${shooter?.name}）${TERMS.hunterShoot} → ${victim?.name}`
    + `（真实身份：${roleLabelOf(state, targetId)}）`
  )
  return { ok: true, targetId }
}

// 放弃开枪（超时也走这里）
export function skipHunter(state, actorId) {
  if (state.phase !== PHASE.HUNTER) return { ok: false, msg: '现在不是反击的时间' }
  if (state.hunterId !== actorId) return { ok: false, msg: '只有丹恒能发动反击' }
  if (state.hunterDone) return { ok: true, duplicate: true }
  state.hunterDone = true
  const p = playerOf(state, actorId)
  pushFeed(state, `${p?.name || '丹恒'} 没有发动${TERMS.hunterShoot}，梦境重新安静下来。`, 'info')
  pushLog(state, `第 ${state.round} 天：丹恒（${p?.name}）放弃${TERMS.hunterShoot}`)
  return { ok: true }
}

// AI 丹恒开枪：优先带走「把票投给自己」的人，没有就随机（与 AI 投票同一套简化策略）
export function aiHunterShoot(state, actorId) {
  const cand = state.alive.filter((id) => id !== actorId)
  if (cand.length === 0) return null
  const voters = Object.keys(state.votes).filter(
    (v) => state.votes[v] === actorId && isAlive(state, v)
  )
  const pool = voters.length ? voters : cand
  return pool[Math.floor(Math.random() * pool.length)]
}

export function finish(state, winner) {
  state.phase = PHASE.OVER
  state.deadline = 0
  state.winner = winner
  state.reveal = { ...state.roleMap }
  // 结算文案要说清「靠哪条赢的」：抓走全部开拓者，还是拿了人数优势
  const huntWon = winner === CAMP.HUNT
  const how = huntWon && huntWinReason(state.roleMap, state.alive) === 'villagers'
    ? '抓走了全部开拓者'
    : '取得了人数优势'
  pushFeed(
    state,
    huntWon
      ? `${TERMS.teamHunt}${how} —— 星核猎手获胜。`
      : `${TERMS.teamTrain}清除了所有星核猎手 —— 列车组获胜。`,
    huntWon ? 'bad' : 'good'
  )
  return winner
}

// 只判胜负、不推进阶段（返回 null 表示继续）
export function evaluateWin(state) {
  return checkWin(state.roleMap, state.alive)
}

function killPlayer(state, id) {
  if (!isAlive(state, id)) return false
  state.alive = state.alive.filter((x) => x !== id)
  return true
}

//  夜间动作（幂等） 

// 每个动作属于夜间哪一步 —— 分步守卫靠它把「顺序」收在一处，
// 而不是在六个 case 里各写一遍。改顺序只改 config 的 NIGHT_STEPS。
// ★ 每个角色都配一个「-pass」：不用技能也必须留下一个明确的决定，
//   否则 pendingNightAction 会一直认为他还没行动，AI 判官就永远收不了夜，
//   玩家自己也会被卡在「轮到你」上等超时（用户要求：每种角色牌都要有跳过按钮）。
const ACTION_STEP = {
  'wolf-kill': 'wolf',
  'wolf-pass': 'wolf',
  'seer-check': 'seer',
  'seer-pass': 'seer',
  'witch-save': 'witch',
  'witch-poison': 'witch',
  'witch-pass': 'witch',
  'firefly-light': 'firefly',
  'firefly-pass': 'firefly',
}

// action: 'wolf-kill' | 'seer-check' | 'witch-save' | 'witch-poison' | 'firefly-light'
export function submitNightAction(state, actorId, action, targetId = null) {
  if (state.phase !== PHASE.NIGHT) return { ok: false, msg: '现在不是入梦时间' }
  const role = state.roleMap[actorId]
  if (!role) return { ok: false, msg: '你不在本局中' }
  if (!isAlive(state, actorId)) return { ok: false, msg: '你已经离场了' }
  const n = state.night

  // 分步守卫：一夜只按 银狼 → 瓦尔特 → 姬子 → 流萤 的顺序走，提前出手一律拒绝。
  // 这也保证了姬子出手时狼的刀口已经定了 —— 不然「今晚救谁」根本无从谈起。
  const needStep = ACTION_STEP[action]
  if (needStep && state.nightStep !== needStep) {
    return { ok: false, msg: `现在不是「${NIGHT_STEP_LABEL[needStep] || needStep}」的时间` }
  }

  switch (action) {
    case 'wolf-kill': {
      if (!isWolfRole(role)) return { ok: false, msg: '只有银狼能骇入' }
      if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
      // 可以骇入同伴（同类），但不含自己 —— 自刀会让狼阵营当场全灭，属于误点即输，
      // 所以留一道硬边界。要放开的话把下面这行删掉即可。
      if (targetId === actorId) return { ok: false, msg: '不能骇入自己' }
      if (n.wolfVotes[actorId] === targetId && !n.wolfPassed[actorId]) return { ok: true, duplicate: true }
      const first = n.wolfVotes[actorId] === undefined
      delete n.wolfPassed[actorId]   // 从「不杀」改回「杀」
      n.wolfVotes[actorId] = targetId
      if (first) n.wolfOrder.push(targetId)
      if (!n.wolfTallied[actorId]) {
        n.wolfTallied[actorId] = true
        bumpTally(state, actorId, 'nightActions')
      }
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（银狼）骇入 → ${playerOf(state, targetId)?.name}`)
      return { ok: true, killTarget: wolfTarget(state) }
    }
    // 空刀：银狼也可以选择「本夜不杀」。必须留下这个标记，
    // 否则 pendingNightAction 会一直认为它还没行动，AI 判官就永远收不了夜。
    case 'wolf-pass': {
      if (!isWolfRole(role)) return { ok: false, msg: '只有银狼能决定是否骇入' }
      if (n.wolfPassed[actorId] && n.wolfVotes[actorId] === undefined) return { ok: true, duplicate: true }
      const prev = n.wolfVotes[actorId]
      if (prev !== undefined) {
        delete n.wolfVotes[actorId]
        n.wolfOrder = n.wolfOrder.filter((t) => t !== prev)
        // 改主意不算「用了一次技能」，把交出去的记分收回
        const t = state.tally[actorId]
        if (t && t.nightActions > 0) t.nightActions -= 1
        delete n.wolfTallied[actorId]
      }
      n.wolfPassed[actorId] = true
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（银狼）选择本夜不动手`)
      return { ok: true, killTarget: wolfTarget(state) }
    }
    case 'seer-check': {
      if (role !== ROLE.SEER) return { ok: false, msg: '只有瓦尔特能感应' }
      if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
      if (targetId === actorId) return { ok: false, msg: '不能感应自己' }
      if (n.seerTarget) return { ok: true, duplicate: true, targetId: n.seerTarget }
      n.seerTarget = targetId
      // 留档：判官「进入新一天后要列出昨晚验到的是好人还是坏人」，
      // 而 state.night 会被下一夜清空，所以必须单独存一份历史。
      state.seerHistory.push({ round: state.round, targetId, team: seerTeamOf(state, targetId) })
      bumpTally(state, actorId, 'nightActions')
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（瓦尔特）感应 → ${playerOf(state, targetId)?.name}（${isWolfRole(state.roleMap[targetId]) ? '星核猎手' : '列车组'}）`)
      return { ok: true, targetId, team: seerTeamOf(state, targetId) }
    }
    // 瓦尔特「本夜不感应」：感应不消耗次数，但玩家有权这一夜不看。
    // 必须留标记，否则会被当成「还没行动」而卡住整个夜晚。
    case 'seer-pass': {
      if (role !== ROLE.SEER) return { ok: false, msg: '只有瓦尔特能感应' }
      if (n.seerTarget) return { ok: true, duplicate: true }
      if (n.seerPassed) return { ok: true, duplicate: true }
      n.seerPassed = true
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（瓦尔特）选择本夜不感应`)
      return { ok: true }
    }
    case 'witch-save': {
      if (role !== ROLE.WITCH) return { ok: false, msg: '只有姬子能调饮' }
      if (n.witchSave) return { ok: true, duplicate: true }
      if (state.witchSaveLeft <= 0) return { ok: false, msg: `${TERMS.witchSave}已经用过了` }
      const saved = wolfTarget(state)
      if (!saved) return { ok: false, msg: '银狼还没决定目标，再等等' }
      n.witchSave = true
      state.witchSaveLeft -= 1
      bumpTally(state, actorId, 'nightActions')
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（姬子）使用${TERMS.witchSave}救下 ${playerOf(state, saved)?.name}`)
      return { ok: true }
    }
    case 'witch-poison': {
      if (role !== ROLE.WITCH) return { ok: false, msg: '只有姬子能调饮' }
      if (n.witchPoison) return { ok: true, duplicate: true }
      if (state.witchPoisonLeft <= 0) return { ok: false, msg: `${TERMS.witchPoison}已经用过了` }
      if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
      if (targetId === actorId) return { ok: false, msg: '不能毒自己' }
      n.witchPoison = targetId
      state.witchPoisonLeft -= 1
      bumpTally(state, actorId, 'nightActions')
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（姬子）使用${TERMS.witchPoison} → ${playerOf(state, targetId)?.name}`)
      return { ok: true }
    }
    // 女巫「本夜都不用」：不设这个动作的话，她会一直挂在「待行动」里，
    // AI 判官就永远等不到收夜条件（玩家自己当姬子时也会被卡住）
    case 'witch-pass': {
      if (role !== ROLE.WITCH) return { ok: false, msg: '只有姬子能调饮' }
      if (n.witchSave || n.witchPoison) return { ok: true, duplicate: true }
      if (n.witchPassed) return { ok: true, duplicate: true }
      n.witchPassed = true
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（姬子）选择本夜不动用咖啡`)
      return { ok: true }
    }
    case 'firefly-light': {
      if (role !== ROLE.FIREFLY) return { ok: false, msg: '只有流萤能照亮' }
      if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
      if (targetId === actorId) return { ok: false, msg: '不能照亮自己' }
      if (state.lastFireflyLit === targetId) return { ok: false, msg: '不能连续两晚照亮同一个人' }
      if (n.fireflyLit) return { ok: true, duplicate: true, targetId: n.fireflyLit }
      n.fireflyLit = targetId
      state.lastFireflyLit = targetId
      bumpTally(state, actorId, 'nightActions')
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（流萤）照亮 → ${playerOf(state, targetId)?.name}`)
      return { ok: true, targetId }
    }
    // 流萤「本夜不照亮」：同样要留标记，不然整夜都收不了
    case 'firefly-pass': {
      if (role !== ROLE.FIREFLY) return { ok: false, msg: '只有流萤能照亮' }
      if (n.fireflyLit) return { ok: true, duplicate: true }
      if (n.fireflyPassed) return { ok: true, duplicate: true }
      n.fireflyPassed = true
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（流萤）选择本夜不照亮`)
      return { ok: true }
    }
    default:
      return { ok: false, msg: '未知的夜间动作' }
  }
}

export function seerTeamOf(state, targetId) {
  return isWolfRole(state.roleMap[targetId]) ? CAMP.HUNT : CAMP.TRAIN
}

//  夜间结算（幂等：resolved 后直接返回上一轮结果） 

export function resolveNight(state) {
  if (state.night.resolved) {
    return { deaths: state.lastNightDeaths, saved: state.lastNightSaved, savedBy: state.lastNightSavedBy, duplicate: true }
  }
  state.night.resolved = true
  const n = state.night
  const deaths = []
  const killed = wolfTarget(state)
  const witchAlive = !!findRole(state, ROLE.WITCH)
  let savedBy = ''

  // 姬子的咖啡：完全救下（优先级最高，救下了萤火就白照了）
  if (killed && n.witchSave && witchAlive) {
    savedBy = 'coffee'
  }

  // 萤火：延迟一死（默认）或完全救下
  if (killed && !savedBy && n.fireflyLit === killed) {
    savedBy = 'firefly'
    bumpTally(state, findRole(state, ROLE.FIREFLY), 'fireflySaves')
    if (FIREFLY_DELAY_DEATH) {
      state.delayedDeaths.push({ id: killed, round: state.round })
      pushLog(state, `第 ${state.round} 夜：萤火护住了 ${playerOf(state, killed)?.name}，离场推迟到下一个梦醒`)
    } else {
      pushLog(state, `第 ${state.round} 夜：萤火完全救下了 ${playerOf(state, killed)?.name}`)
    }
  }

  if (killed && !savedBy) deaths.push(killed)

  // 毒咖啡：无法被任何手段拦下（和刀同一个人时只算一次）
  const poison = n.witchPoison
  if (poison && witchAlive && isAlive(state, poison) && !deaths.includes(poison)) deaths.push(poison)

  state.lastNightDeaths = deaths
  state.lastNightSaved = !!savedBy
  state.lastNightSavedBy = savedBy
  return { deaths, saved: !!savedBy, savedBy }
}

//  投票（幂等） 

// 投票阶段允许改票：后一次覆盖前一次，这正是狼人杀的常规玩法
export function submitVote(state, voterId, targetId) {
  if (state.phase !== PHASE.VOTE) return { ok: false, msg: '现在不是投票时间' }
  if (!isAlive(state, voterId)) return { ok: false, msg: '你已经离场了，不能投票' }
  if (targetId && !isAlive(state, targetId)) return { ok: false, msg: '该乘客已经离场了' }
  if (targetId === voterId) return { ok: false, msg: '不能投自己' }
  if (targetId === undefined) return { ok: false, msg: '无效的投票目标' }
  if (state.votes[voterId] === targetId) return { ok: true, duplicate: true }
  state.votes[voterId] = targetId || ''   // '' 表示弃票
  // 投中的是星核猎手 → 记一笔（弃票不算）
  if (targetId && isWolfRole(state.roleMap[targetId])) bumpTally(state, voterId, 'voteHits')
  return { ok: true }
}

// 票型统计：{ targetId|'abstain': [voterId] }
export function tallyVotes(state) {
  const out = {}
  Object.keys(state.votes).forEach((voter) => {
    const t = state.votes[voter] || 'abstain'
    if (!out[t]) out[t] = []
    out[t].push(voter)
  })
  return out
}

// 结算投票：返回 { votes, outId, tie, outIds, revote, round }
// 平票规则：并列最高 → 全场加时重投一轮（不限候选人，可弃票）；
//          加时那一轮仍然平票才流局。这样玩家在平票时依然「可以选择投与不投」。
export function resolveVote(state) {
  const votes = tallyVotes(state)
  let max = 0
  const top = []
  Object.keys(votes).forEach((t) => {
    if (t === 'abstain') return
    if (votes[t].length > max) {
      max = votes[t].length
      top.length = 0
      top.push(t)
    } else if (votes[t].length === max) {
      top.push(t)
    }
  })
  if (max === 0) return { votes, outId: null, tie: false, outIds: [], revote: false, round: state.voteRound }

  if (top.length > 1) {
    state.voteTieIds = top.slice()
    // 第一轮平票 → 加时重投；已经是加时轮 → 流局
    if (state.voteRound < 2) {
      state.voteRound = 2
      return { votes, outId: null, tie: true, outIds: top, revote: true, round: 2 }
    }
    return { votes, outId: null, tie: true, outIds: top, revote: false, round: state.voteRound }
  }

  return { votes, outId: top[0], tie: false, outIds: top, revote: false, round: state.voteRound }
}

// 放逐（幂等：已经离场的人不会二次结算）
export function applyExile(state, outId) {
  if (!outId) return { ok: false, msg: '无人出局' }
  if (!isAlive(state, outId)) return { ok: true, duplicate: true }
  killPlayer(state, outId)
  const p = playerOf(state, outId)
  pushFeed(state, `${p?.name} 被${TERMS.exile}，${roleLabelOf(state, outId)}的身份随之公开。`, 'bad')
  pushLog(state, `第 ${state.round} 天：${p?.name} 被放逐（真实身份：${roleLabelOf(state, outId)}）`)
  return { ok: true, outId }
}

export function roleLabelOf(state, id) {
  const r = ROLES[state.roleMap[id]]
  return r ? `${r.name}·${r.title}` : '未知'
}

//  某个玩家此刻「还欠什么动作」 

export function pendingNightAction(state, playerId) {
  if (state.phase !== PHASE.NIGHT) return null
  if (!isAlive(state, playerId)) return null
  const step = state.nightStep
  // 还没轮到这一步的人一律算「不欠动作」—— 这是分步的关键：
  // 狼没定刀口之前，姬子那边就不该显示「待行动」，AI 判官也不会为她空等。
  if (!step || step === 'done') return null
  const role = state.roleMap[playerId]
  const n = state.night
  // 已经决定杀谁、或已经明确选择不杀，都算「行动完毕」
  if (isWolfRole(role)) {
    if (step !== 'wolf') return null
    return n.wolfVotes[playerId] || n.wolfPassed[playerId] ? null : 'wolf-kill'
  }
  if (role === ROLE.SEER) {
    if (step !== 'seer') return null
    // 验过了、或明确选择这一夜不验，都算「行动完毕」
    return n.seerTarget || n.seerPassed ? null : 'seer-check'
  }
  if (role === ROLE.WITCH) {
    if (step !== 'witch') return null
    // 本夜已经做过决定（用药 / 明确不用）就没事了
    if (n.witchSave || n.witchPoison || n.witchPassed) return null
    // 两瓶都用光后，女巫剩下的夜晚与平民无异
    if (state.witchSaveLeft > 0 || state.witchPoisonLeft > 0) return 'witch'
    return null
  }
  if (role === ROLE.FIREFLY) {
    if (step !== 'firefly') return null
    // 照过了、或明确选择这一夜不照，都算「行动完毕」
    return n.fireflyLit || n.fireflyPassed ? null : 'firefly-light'
  }
  return null
}

// 所有「还需要行动」的存活玩家 —— 已经按当前分步过滤过了，
// 所以它同时是「这一步做完了没有」的判据（AI 判官据此提前收夜 / 推进下一步）。
export function actorsPending(state) {
  return state.alive.filter((id) => pendingNightAction(state, id))
}

//  单人：AI 决策 

// 银狼选目标：优先「被自己同伴投过 / 上一轮把银狼放逐出去」的乘客，第一夜无信息时纯随机。
// 现在也允许把刀指向同伴（同类）—— 只有在场上除了自己和同伴再没别人时才会发生。
// AI 不会主动空刀：空刀是留给「玩家自己当银狼」时的自由选项，AI 用不着。
export function aiWolfKill(state, actorId) {
  const mates = wolfIds(state).filter((id) => id !== actorId)
  const mateSet = new Set(mates)
  const others = state.alive.filter((id) => id !== actorId && !mateSet.has(id))
  const cand = others.length ? others : state.alive.filter((id) => id !== actorId)
  if (cand.length === 0) return null
  const scored = cand.map((id) => {
    let score = Math.random() * 2
    // 上一轮投过银狼同伴的人，优先带走
    const votedMate = mates.some((w) => state.votes[w] === id)
    if (votedMate) score += 0.6
    return { id, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].id
}

// 瓦尔特选目标：优先未感应过的人
export function aiSeerCheck(state, actorId) {
  const cand = state.alive.filter((id) => id !== actorId)
  if (cand.length === 0) return null
  return cand[Math.floor(Math.random() * cand.length)]
}

// 姬子：要不要用咖啡 / 毒咖啡
// 策略保守 —— 只救自己人，越早越愿意救；毒只在低概率随机下（Phase 1 不做精细推理）
export function aiWitchDecide(state, actorId) {
  const killed = wolfTarget(state)
  const out = { save: false, poison: null }
  if (killed && state.witchSaveLeft > 0 && !isWolfRole(state.roleMap[killed])) {
    const p = state.round <= 2 ? 0.75 : 0.5
    if (Math.random() < p) out.save = true
  }
  if (state.witchPoisonLeft > 0 && Math.random() < 0.25) {
    const cand = state.alive.filter((id) => id !== actorId && id !== killed)
    if (cand.length) out.poison = cand[Math.floor(Math.random() * cand.length)]
  }
  // 什么都不做时必须显式「过」，否则会被当成还没行动
  out.pass = !out.save && !out.poison
  return out
}

// 流萤照亮：优先照亮"玩家"（这是设计里明确的情感触发）
//   - 玩家是好人 → 80% 照亮玩家
//   - 玩家是银狼 且 是第一夜 → 70% 照亮玩家（"她还信任着你"）
//   - 其余情况随机，但不会照自己、不会连照同一人
export function aiFireflyLight(state, actorId, humanId = null) {
  const cand = state.alive.filter((id) => id !== actorId && id !== state.lastFireflyLit)
  if (cand.length === 0) return null

  if (humanId && cand.includes(humanId)) {
    const humanIsWolf = isWolfRole(state.roleMap[humanId])
    const p = humanIsWolf ? (state.round === 1 ? 0.7 : 0.4) : 0.8
    if (Math.random() < p) return humanId
  }
  // 偏好好人：让萤火更像"在保护人"
  const friends = cand.filter((id) => !isWolfRole(state.roleMap[id]))
  const pool = friends.length ? friends : cand
  return pool[Math.floor(Math.random() * pool.length)]
}

// 统一入口：给 AI 玩家算一个夜间动作并返回 { action, targetId }
export function aiNightAction(state, actorId, humanId = null) {
  const role = state.roleMap[actorId]
  if (isWolfRole(role)) return { action: 'wolf-kill', targetId: aiWolfKill(state, actorId) }
  if (role === ROLE.SEER) return { action: 'seer-check', targetId: aiSeerCheck(state, actorId) }
  if (role === ROLE.WITCH) {
    const d = aiWitchDecide(state, actorId)
    return { action: 'witch', targetId: null, save: d.save, poison: d.poison, pass: d.pass }
  }
  if (role === ROLE.FIREFLY) return { action: 'firefly-light', targetId: aiFireflyLight(state, actorId, humanId) }
  return null
}

// AI 投票：跟票 30% + 随机 70%（按设计要求保持简单可预测）
export function aiVote(state, actorId) {
  const cand = state.alive.filter((id) => id !== actorId)
  if (cand.length === 0) return ''
  if (Math.random() < 0.3) {
    // 跟票：跟随当前得票最高的人（但避开自己）
    const votes = tallyVotes(state)
    let best = null
    let bestN = 0
    Object.keys(votes).forEach((t) => {
      if (t === 'abstain' || t === actorId) return
      if (votes[t].length > bestN) {
        bestN = votes[t].length
        best = t
      }
    })
    if (best && Math.random() < 0.75) return best
  }
  return cand[Math.floor(Math.random() * cand.length)]
}

// AI 发言：模板池 + 简单策略，Phase 1 不走 LLM
const AI_SPEAK = {
  generic: ['我先过，听大家的。', '我是列车组，没有别的信息。', '这轮票型有点奇怪，我记一下。', '我暂时保留意见。', '昨晚很安静，我倾向再听一轮。'],
  suspect: ['我怀疑 {seat} 号，他刚才那句话站不住脚。', '{seat} 号的发言太急了，我先记一票。', '我投 {seat} 号，理由是他的立场变来变去。'],
  defend: ['我不是星核猎手，别投我。', '我真的是列车组，投我就是在帮他们。', '你们要想清楚，我走了对列车组没好处。'],
  claim: ['我是瓦尔特，昨晚感应到 {seat} 号是星核猎手。', '我是流萤，昨晚我照亮了 {seat} 号。'],
}

export function aiSpeak(state, actorId) {
  const me = playerOf(state, actorId)
  const others = state.alive.filter((id) => id !== actorId)
  const role = state.roleMap[actorId]
  const seatOf = (id) => playerOf(state, id)?.seat ?? '?'
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

  // 被票到高位的人会为自己辩护
  const votes = tallyVotes(state)
  const myVotes = votes[actorId]?.length || 0
  if (myVotes >= 2) return pick(AI_SPEAK.defend)

  // 瓦尔特有狼信息时，有一定概率直接报出来（否则一直闷着太假）
  if (role === ROLE.SEER && state.night.seerTarget && Math.random() < 0.5) {
    const t = state.night.seerTarget
    if (isWolfRole(state.roleMap[t])) {
      return `我是瓦尔特，昨晚感应到 ${seatOf(t)} 号是星核猎手。`
    }
    return `我是瓦尔特，${seatOf(t)} 号是列车组，可以信。`
  }
  // 流萤偶尔暗示自己照亮了谁
  if (role === ROLE.FIREFLY && state.night.fireflyLit && Math.random() < 0.4) {
    return `昨晚我把光留在 ${seatOf(state.night.fireflyLit)} 号那里了。`
  }
  if (others.length && Math.random() < 0.55) {
    const t = others[Math.floor(Math.random() * others.length)]
    return pick(AI_SPEAK.suspect).replace('{seat}', String(seatOf(t)))
  }
  return pick(AI_SPEAK.generic)
}

// 遗言：离场的人要先「说出自己的判断」，所以文案比普通发言更确定、更像交代后事。
// 有信息的角色（瓦尔特 / 姬子 / 流萤）会把情报带出来，银狼死了也要继续装好人。
const AI_LAST_WORDS = {
  generic: [
    '我走了，{suspect} 号最可疑，你们盯住他。',
    '我是列车组，遗言就一句：{suspect} 号有问题，别放过。',
    '我没什么好藏的了，{suspect} 号刚才一直在带节奏。',
    '我怀疑 {suspect} 号，剩下的交给你们了。',
  ],
  wolfDead: [
    '我不是星核猎手，你们投错人了……{suspect} 号才是。',
    '我真的只是乘客，{suspect} 号急着推我，你们自己想想。',
  ],
}

export function aiLastWords(state, actorId) {
  const role = state.roleMap[actorId]
  const alive = state.alive.slice()
  const seatOf = (id) => playerOf(state, id)?.seat ?? '?'
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
  const suspect = alive.length ? alive[Math.floor(Math.random() * alive.length)] : null

  // 银狼就算离场也要继续装好人
  if (isWolfRole(role)) {
    return suspect
      ? pick(AI_LAST_WORDS.wolfDead).replace('{suspect}', String(seatOf(suspect)))
      : '你们会后悔的。'
  }
  if (role === ROLE.SEER && state.night.seerTarget) {
    const t = state.night.seerTarget
    return isWolfRole(state.roleMap[t])
      ? `我是瓦尔特！昨晚我感应到 ${seatOf(t)} 号是星核猎手，一定要把他投出去！`
      : `我是瓦尔特，${seatOf(t)} 号是列车组，可以信；再往后我就不确定了。`
  }
  if (role === ROLE.WITCH) {
    const left = []
    if (state.witchSaveLeft > 0) left.push('咖啡一直没舍得用')
    if (state.witchPoisonLeft > 0) left.push('毒咖啡还在我手上')
    const tail = left.length ? `我是姬子，${left.join('，')}，现在都用不上了。` : '我是姬子，两瓶药都用完了。'
    return suspect ? `${tail}我怀疑 ${seatOf(suspect)} 号。` : tail
  }
  if (role === ROLE.FIREFLY && state.lastFireflyLit) {
    return `我是流萤……我的光落在 ${seatOf(state.lastFireflyLit)} 号。你们要好好活下去。`
  }
  if (!suspect) return '我是乘客，没什么能说的了。'
  return pick(AI_LAST_WORDS.generic).replace('{suspect}', String(seatOf(suspect)))
}

//  私有信息（只发给本人，联机时靠定向消息） 

export function privateInfoOf(state, viewerId) {
  const role = state.roleMap[viewerId]
  if (!role) return null
  const out = { roleKey: role, mates: [] }
  // 「本夜还欠什么动作」也放进私有信息里 —— 联机时非房主客户端手上没有引擎 state，
  // 只能靠这个字段决定行动面板要显示什么、座位能不能点
  out.pending = pendingNightAction(state, viewerId)
  // 反击：丹恒被放逐的那一刻自己已经不在 alive 里了，所以不能复用夜间 pending，
  // 单独给一个标记让客户端知道「轮到你开枪了」。
  out.hunterPending = hunterPending(state, viewerId)
  if (isWolfRole(role)) out.mates = wolfIds(state).filter((id) => id !== viewerId)
  if (role === ROLE.SEER && state.night.seerTarget) {
    out.seerResult = { targetId: state.night.seerTarget, team: seerTeamOf(state, state.night.seerTarget) }
  }
  if (role === ROLE.WITCH) {
    out.witchInfo = {
      killedId: wolfTarget(state),
      saveLeft: state.witchSaveLeft,
      poisonLeft: state.witchPoisonLeft,
      decided: !!(state.night.witchSave || state.night.witchPoison || state.night.witchPassed),
      usedSaveThisNight: state.night.witchSave,
      usedPoisonThisNight: state.night.witchPoison,
    }
  }
  if (role === ROLE.FIREFLY) out.fireflyInfo = { litId: state.night.fireflyLit, lastLitId: state.lastFireflyLit }
  return out
}

//  快照（中途进房 / 重连时补发） 
// ★ 安全边界：对局进行中，任何人只能看到自己的身份 + 公开信息（存活、票型、频道），
//   别人的 roleMap 一律不下发 —— 否则玩家翻一下网络日志就赢定了。
//   唯一的例外是 phase === OVER：身份已揭晓，这些字段变成「赛后复盘」。
export function getSnapshot(state, viewerId) {
  //  赛后复盘的放行条件 
  // ★ 对局进行中，上帝视角信息（全部身份 / 昨夜明细 / 验人记录 / 行动日志）
  //   一律不下发 —— 任何一条漏出去这一局立刻没得玩。
  //   唯一的放行时机是 phase === OVER：身份已经全部揭晓，
  //   这些字段此刻就是给所有人看的「赛后复盘」。
  const canReveal = state.phase === PHASE.OVER
  return {
    mode: state.mode,
    players: state.players.map(({ id, name, seat, isAI, avatar }) => ({
      id, name, seat, isAI,
      // 只有 AI 的头像随快照下发（本来就是一张小图标）。
      // 真人的头像是本地 data URL：不下发，一来避免把几十 KB 的 base64
      // 广播给全房间，二来也没必要让房主拿到别人的头像。
      // 自己那一个由视图层用本地 avatarData 补上。
      avatar: isAI ? avatar || '' : '',
    })),
    alive: state.alive.slice(),
    round: state.round,
    phase: state.phase,
    deadline: state.deadline,
    startedAt: state.startedAt,
    // 夜晚内部的分步：'wolf' | 'seer' | 'witch' | 'firefly' | 'done' | ''
    nightStep: state.nightStep || '',
    // 上一阶段 —— 用户要求阶段条要同时显示「现在是什么阶段、上一个阶段是谁」
    prevPhase: state.prevPhase || '',
    prevNightStep: state.prevNightStep || '',
    // 反击：此刻在等谁开枪（他已经被放逐，属于公开信息）
    hunterId: state.hunterId || '',
    hunterDone: !!state.hunterDone,
    votes: state.phase === PHASE.VOTE || state.phase === PHASE.OVER ? { ...state.votes } : {},
    // 投票轮次：2 表示这是平票后的加时重投，UI 要提示
    voteRound: state.voteRound,
    voteTieIds: state.voteTieIds.slice(),
    // 昨夜离场者（公开信息，遗言阶段要用）
    lastNightDeaths: state.lastNightDeaths.slice(),
    // 开拓者进度（聚合数量，公开）：狼人的胜利条件就挂在这上面
    villagers: villagerStat(state.roleMap, state.alive),
    // 狼胜的原因：'villagers' | 'advantage'（仅用于结算文案）
    huntReason: state.phase === PHASE.OVER && state.winner === CAMP.HUNT
      ? huntWinReason(state.roleMap, state.alive)
      : '',
    // 轮流发言 / 遗言进度：全场可见（谁在说、下一个是谁）
    speaking:
      state.phase === PHASE.LAST_WORDS || state.phase === PHASE.SPEAKING
        ? {
            mode: state.speaking.mode,
            order: state.speaking.order.slice(),
            index: state.speaking.index,
            current: currentSpeaker(state),
            said: { ...state.speaking.said },
          }
        : null,
    feed: state.feed.slice(-40),
    chat: state.chat.slice(-60),
    survived: { ...state.survived },
    winner: state.winner,
    reveal: state.phase === PHASE.OVER ? { ...state.reveal } : {},
    me: viewerId ? privateInfoOf(state, viewerId) : null,
    // 计分只下发给本人那一份 —— 既够他算自己的奖励，也不暴露别人的行动次数
    myTally: viewerId ? { ...(state.tally[viewerId] || {}) } : null,
    // 结算那一刻把所有人的计数一并公开：此时身份都已揭晓，且能避免
    // 「ww:game-over 先到、定向的私有快照后到」导致客户端少算奖励的时序问题
    tallies: state.phase === PHASE.OVER ? JSON.parse(JSON.stringify(state.tally)) : null,
    //  赛后复盘（phase === OVER 才对所有人开放） 
    // ★ 这四项在对局进行中一律为 null —— 里面写着谁被骇入、瓦尔特验了谁、
    //   流萤照亮了谁，任何一条漏出去这一局立刻没得玩。
    //   放行时机只有一个：结算那一刻，身份已经全部揭晓，它们就是「复盘材料」。
    allRoles: canReveal ? { ...state.roleMap } : null,
    // 复盘要看整局的夜间接力，40 条不够，放宽到 120
    nightLog: canReveal ? state.log.slice(-120) : null,
    // 昨夜到底发生了什么（结构化）
    judgeInfo: canReveal
      ? { ...nightActionsOf(state), lastNightDeaths: state.lastNightDeaths.slice() }
      : null,
    // 瓦尔特的历次验人结果：[{ round, targetId, team }]
    // 复盘时列出来，就能回答「到底哪一晚验错了人」。
    seerHistory: canReveal ? state.seerHistory.slice(-24) : null,
  }
}

//  结算奖励 
//
// ★ 入参刻意设计成「纯数据」而不是整个 state：
//   联机时非房主客户端手上没有 state（那里面是全部人的身份），
//   只有房主广播过来的公开快照 + 自己的私有信息。两边用同一个函数算各自的奖励，
//   才不会出现「房主算得对、客人算得错」这种最难查的差异。
//
// 返回 { items:[{label, amount}], total, pairEnding }
export function computeRewards({
  myRole = '',
  winner = '',
  endedNormally = true,
  tally = {},
  survivedRounds = 0,
  aliveIds = [],
  revealed = {},
}) {
  const items = []

  if (endedNormally && winner) {
    const win = ROLES[myRole]?.camp === winner
    items.push({ label: win ? '列车到站 · 获胜' : '梦醒之后 · 落败', amount: win ? REWARDS.WIN : REWARDS.LOSE })
  } else {
    items.push({ label: '中途退出 · 参与奖励', amount: REWARDS.QUIT_AFTER_3MIN })
  }

  if (tally.nightActions > 0) {
    items.push({ label: `夜间技能 ×${tally.nightActions}`, amount: tally.nightActions * REWARDS.NIGHT_ACTION })
  }
  if (tally.voteHits > 0) {
    items.push({ label: `投票命中${TERMS.teamHunt} ×${tally.voteHits}`, amount: tally.voteHits * REWARDS.VOTE_HIT_WOLF })
  }
  if (tally.fireflySaves > 0) {
    items.push({ label: `萤火护住被${TERMS.kill}者 ×${tally.fireflySaves}`, amount: tally.fireflySaves * REWARDS.FIREFLY_SAVE })
  }
  if (survivedRounds > 0) {
    items.push({ label: `存活 ${survivedRounds} 个昼夜`, amount: survivedRounds * REWARDS.SURVIVE_ROUND })
  }

  // 双人结局：流萤 与 开拓者 同时活到最后 → 额外一大笔
  const aliveSet = new Set(aliveIds)
  const fireflyAlive = Object.keys(revealed).some((id) => revealed[id] === ROLE.FIREFLY && aliveSet.has(id))
  const villagerAlive = Object.keys(revealed).some((id) => revealed[id] === ROLE.VILLAGER && aliveSet.has(id))
  const pairEnding = fireflyAlive && villagerAlive
  if (pairEnding) {
    items.push({ label: '双人结局 · 萤火与开拓者同行到最后', amount: REWARDS.PAIR_BONUS })
  }

  return { items, total: items.reduce((s, x) => s + x.amount, 0), pairEnding }
}

// 单纯的「时长是否够 3 分钟」判定（中途退出用）
export function passGracePeriod(startedAt, now = Date.now()) {
  return startedAt > 0 && now - startedAt >= REWARDS.QUIT_GRACE_MS
}
