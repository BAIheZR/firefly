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
  WOLF_REVOTE_MAX,
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

// 对局内的自增 id
function bump(state, prefix = 'm') {
  state._seq = (state._seq || 0) + 1
  return `${prefix}${state._seq}`
}

const emptyNight = () => ({
  wolfVotes: {},      // { wolfId: targetId }
  wolfOrder: [],      // 投票先后，用于平票时取「先到」
  // 银狼本夜不杀的标记
  wolfPassed: {},
  wolfTallied: {},    // 本夜是否已为计分记过一笔，避免改来改去刷分
  wolfRevoteCount: 0, // 银狼本夜已重投几次（上限见 WOLF_REVOTE_MAX）
  seerTarget: null,
  seerPassed: false,  // 瓦尔特明确选择「本夜不感应」
  witchSave: false,   // 本夜是否用了咖啡
  witchPoison: null,  // 本夜是否用了毒咖啡
  witchPassed: false, // 女巫明确选择「本夜都不用」
  fireflyLit: null,
  fireflyPassed: false, // 流萤明确选择「本夜不照亮」
  // 卡芙卡（摄梦人）：本夜标记谁。连续两晚同一个人 → 该人次日梦醒离场
  kafkaMark: null,
  kafkaPassed: false,   // 卡芙卡明确选择「本夜不标记」
  resolved: false,
})

// 轮流发言 / 遗言阶段的载体，index 越界即表示这一阶段发完了
const emptySpeaking = () => ({ mode: '', order: [], index: 0, said: {} })

//  查询辅助 

export const playerOf = (state, id) => state.players.find((p) => p.id === id) || null
export const isAlive = (state, id) => state.alive.includes(id)
export const aliveIds = (state) => state.alive.slice()
export const roleOf = (state, id) => state.roleMap[id] || null

export const wolfIds = (state) => Object.keys(state.roleMap).filter((id) => isWolfRole(state.roleMap[id]))
export const aliveWolves = (state) => wolfIds(state).filter((id) => isAlive(state, id))
export const aliveTeammates = (state, id) => aliveWolves(state).filter((x) => x !== id)

// 参战玩家，判官帕姆不占座位
export const seatedPlayers = (state) => state.players

// 找某个角色当前的人
export function findRole(state, roleKey) {
  const id = Object.keys(state.roleMap).find((k) => state.roleMap[k] === roleKey)
  return id && isAlive(state, id) ? id : null
}

// 银狼的最终刀口：多数票，平票取先投出的
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

// 银狼视角的「当前刀口票况」：谁几票、现在谁领先、我自己这一票投去了哪。
// 只在 getSnapshot 确认看的人是「还活着的狼」时才调用 —— 好人/死狼/观战一律拿不到。
export function wolfTallyOf(state, viewerId = '') {
  const votes = state.night?.wolfVotes || {}
  const ids = Object.keys(votes)
  if (!ids.length) return { tally: {}, lead: '', myVote: '', voters: {} }
  const tally = {}
  ids.forEach((voter) => {
    const t = votes[voter]
    if (!t) return
    tally[t] = (tally[t] || 0) + 1
  })
  return {
    tally,
    // 按座位号排，界面上按这个顺序列，读起来跟座位一致
    voters: ids.reduce((acc, voter) => {
      acc[voter] = votes[voter]
      return acc
    }, {}),
    lead: wolfTarget(state),
    myVote: viewerId ? votes[viewerId] || '' : '',
  }
}

// 帕姆复盘用的夜间明细，对局中不下发
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
    // 瓦尔特昨夜验到的阵营
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
    kafka: n.kafkaMark,
    kafkaName: nameOf(n.kafkaMark),
    kafkaSeat: seatOf(n.kafkaMark),
    // 连标满两晚处决掉的人（本夜结算）
    kafkaKill: state.kafkaKills || 0,
  }
}

//  事件记录 

// 帕姆播报里需要加重的片段（time 重要时间 / event 关键事件），只产出分段数组
const MARK_RULES = [
  { m: 'time', re: /第\s*\d+\s*[夜天]|\d+\s*秒(?:内)?/g },
  {
    m: 'event',
    re: /昨夜离场[：:][^。]*|[^，。；]*平票[（(][^）)]*[）)]|[^，。；]*被(?:放逐|骇入|投出)[^，。；]*|与他一同离场|[^，。；]*(?:挡下了一次骇入|离开了梦境)/g,
  },
]

// 把一条播报切成 [{ t, m? }]，m 有值即为需要加重的片段
function markParts(text) {
  const hits = []
  for (const { m, re } of MARK_RULES) {
    re.lastIndex = 0
    let x
    while ((x = re.exec(text))) hits.push({ s: x.index, e: x.index + x[0].length, m })
  }
  if (!hits.length) return [{ t: text }]
  hits.sort((a, b) => a.s - b.s || b.e - a.e)
  const out = []
  let cur = 0
  for (const h of hits) {
    if (h.s < cur) continue
    if (h.s > cur) out.push({ t: text.slice(cur, h.s) })
    out.push({ t: text.slice(h.s, h.e), m: h.m })
    cur = h.e
  }
  if (cur < text.length) out.push({ t: text.slice(cur) })
  return out
}

// 全员可见的播报，帕姆口吻（统一在这里补尾音「帕」）
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

// 频道发言（只认 day / wolf 两个频道，其余值一律落到 day）
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

// 计分累计，结算时各客户端算自己的那份
export function bumpTally(state, playerId, key, n = 1) {
  if (!playerId) return
  if (!state.tally[playerId]) state.tally[playerId] = { nightActions: 0, voteHits: 0, fireflySaves: 0, kafkaKills: 0 }
  state.tally[playerId][key] = (state.tally[playerId][key] || 0) + n
}

//  建局 

// players: [{ id, name, isAI?, avatar? }]（判官帕姆不在其中）
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
    // 夜晚当前分步：'wolf' | 'seer' | 'witch' | 'firefly'（'done' / '' = 不在夜里）
    nightStep: '',
    // 上一阶段，夜里分步时具体哪一步看 prevNightStep
    prevPhase: '',
    prevNightStep: '',
    // 瓦尔特的历史验人结果：[{ round, targetId, team }]（night 会被下一夜清空，必须留档）
    seerHistory: [],
    // 丹恒的反击：进入 PHASE.HUNTER，由他指定一名乘客同去
    hunterId: '',
    hunterDone: false,
    hunterFired: '',
    // 反击的来源：'exile'（被放逐，打完后直接入夜）| 'night'（夜里被骇入，打完后梦醒流程继续）
    hunterFrom: '',
    // 流萤离场后「拖住星核猎手」的那一夜（该轮夜晚整步跳过狼的回合）。0 = 没有
    wolfFreezeRound: 0,
    // 白狼王自爆后置位：当天跳过投票，直接入夜 ——
    // 注意跳的不只是投票，当天剩下的遗言 / 发言阶段一并跳过（产品已拍板：亮牌即终局，
    // 不再给全场复盘身份的机会），由 useWerewolfMatch 的 runAutoAdvance 消费后直接 startNight
    skipVoteToNight: false,
    // 昔涟的绑定关系（双向）：{ [昔涟]: 对方, [对方]: 昔涟 }
    bonds: {},
    // 准备期的「确认身份」：{ [playerId]: true }。全员确认即提前入夜。
    // AI 在 startPrep 里直接预置为已确认，不用真人陪它等。
    prepConfirmed: {},
    // 本局累计的「公开发言后果」：[{ byId, round, kind, targetId }]。
    // kind: 'suspect'（单纯怀疑）/ 'claim-seer'（跳预言家并指认，分量更重）。
    // ★ 这是让 AI「会说话」的关键 —— 以前发言只是随机挑模板、不进入任何状态，
    //   于是「某人跳预言家指认了 X」这件事别人完全不知道，投票和发言是两条平行的随机流（2026-10-06）。
    claims: [],
    lastFireflyLit: null,
    // 卡芙卡：上一夜标记的人（留档跨夜），以及已处决人数（奖励判定 ≥2）
    kafkaLastMark: null,
    kafkaKills: 0,
    // 姬子的两瓶药整局各一次，必须跨夜保留用量
    witchSaveLeft: 1,
    witchPoisonLeft: 1,
    delayedDeaths: [],     // 萤火延后的离场，元素 { id, round }
    lastNightDeaths: [],
    lastNightSaved: false,
    lastNightSavedBy: '',  // '' | 'coffee' | 'firefly'
    votes: {},
    // 上一日投票的留档：入夜时把 votes 抄一份再清空（AI 银狼靠它判断谁针对过狼队）
    lastDayVotes: {},
    // 投票轮次：1 = 正常投票，2 = 平票后的加时重投
    voteRound: 1,
    voteTieIds: [],        // 上一轮平票的人
    // 轮流发言 / 遗言的统一载体（mode = 'lastwords' | 'speaking'）
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

// 单人模式：1 名人类玩家 + N 名 AI 乘客，AI 头像随机且与身份无关
export function buildSoloPlayers(total, myName, myAvatar = '') {
  const names = pickAiNames(total - 1)
  const avatars = pickSeatAvatars(total - 1)
  const list = [{ id: 'me', name: myName || '开拓者', isAI: false, avatar: myAvatar || '' }]
  names.forEach((n, i) => list.push({ id: `ai${i + 1}`, name: n, isAI: true, avatar: avatars[i] || '' }))
  return list
}

//  阶段推进 

// 昔涟开局绑定情侣：随机选一个人，两人互相知道对方的角色（设定表「互知身份」）。
// 绑定是双向的，但不共享阵营胜负 —— 结算时任一方没活到最后，两人都判失败（见 computeRewards）。
// auto = true 时是「她自己没选，系统替她随机指定」，日志要写清是系统补的，
// 免得玩家以为是自己绑的（2026-10-02：准备期还没选就被系统占位，用户反馈很直接）
export function assignBonds(state, { auto = false } = {}) {
  state.bonds = {}
  const x = Object.keys(state.roleMap).find((id) => state.roleMap[id] === ROLE.XILIAN)
  if (!x) return null
  const all = Object.keys(state.roleMap).filter((id) => id !== x)
  // 优先从还活着的人里抽：开局全员存活没差别，第二夜之后补绑（人已经死了一半）就不该再拉死人进来
  const cand = all.filter((id) => state.alive.includes(id))
  if (!cand.length) return null
  const partner = cand[Math.floor(Math.random() * cand.length)]
  state.bonds[x] = partner
  state.bonds[partner] = x
  pushLog(
    state,
    auto
      ? `昔涟（${playerOf(state, x)?.name}）直到入夜都没有选定羁绊对象，系统随机指定了 ${playerOf(state, partner)?.name}`
      : `开局：昔涟（${playerOf(state, x)?.name}）与 ${playerOf(state, partner)?.name} 缔结羁绊`
  )
  return partner
}

// 入夜前的兜底：昔涟直到入夜都没自己选，才由系统随机指定一个。
// ★ 一定要留到这一步再补 —— 准备期必须让她自己点，提前绑等于把选择权抢走
//   （2026-10-02：先写成开场就绑，用户「我还没选上，系统就先给我选上了」）。
// 触发场景：准备期 10 秒没来得及点、她是 AI、她离线、中途进房拿到身份没人补发。
// 已有绑定（自己点过）则原样不动。
export function ensureBonds(state) {
  const x = Object.keys(state.roleMap).find((id) => state.roleMap[id] === ROLE.XILIAN)
  if (!x) return null
  if (state.bonds?.[x]) return state.bonds[x]
  return assignBonds(state, { auto: true })
}

// 真人中途离席 → 把这个座位交给 AI 代打。
// ★ 必须做这一步：引擎是按 isAI 决定「要不要替他行动 / 要不要等他」的，
//   人走了但 isAI 还是 false，那一步就永远等着他 —— 夜间动作、发言、投票全会卡住。
// 只有桌主（权威）能改，改完由 commit 广播给全桌（isAI 会跟着快照下发，
// 于是别人那边这个座位也会显示成 AI）。
export function convertToAI(state, playerId) {
  const p = playerOf(state, playerId)
  if (!p || p.isAI) return false
  p.isAI = true
  p.away = true   // 标记「离席代打」，视图可以据此显示得比普通 AI 更醒目
  // 他要是还没点「确认身份」就跑了，替他把这一票补上 ——
  // 否则全桌永远凑不齐「全员确认」，得干等到 30 秒兜底才入夜（2026-10-05）
  if (state.phase === PHASE.PREP && state.prepConfirmed && !state.prepConfirmed[playerId]) {
    state.prepConfirmed[playerId] = true
  }
  pushFeed(state, `${p.name} 已离开 —— 这个位置暂时交给 AI 代打。`, 'warn')
  pushLog(state, `${p.name} 离开了对局，席位交由 AI 接管`)
  return true
}

// 中途离席的人回来了 → 把席位交还给他（撤掉 AI 代打）。
// 只认「被 AI 代打过的那个座位」（away 标记）：真 AI、本来就是真人的都不动 ——
// 否则会把人手排的 AI 玩家误判成"回来的真人"。
export function restoreHuman(state, playerId) {
  const p = playerOf(state, playerId)
  if (!p || !p.isAI || !p.away) return false
  p.isAI = false
  p.away = false
  pushFeed(state, `${p.name} 回来了 —— 这一位重新由本人操控。`, 'good')
  pushLog(state, `${p.name} 回到对局，席位交还本人`)
  return true
}

// 开局准备期：发牌后的全员缓冲（设定表「开局 10s 准备期」）。倒计时结束即入第一夜
export function startPrep(state) {
  state.phase = PHASE.PREP
  state.deadline = Date.now() + (PHASE_MS[PHASE.PREP] || 30000)
  // ★ 准备期这里**不能**兜底绑羁绊 —— 昔涟的羁绊对象要她自己点座位选，
  //   提前绑上等于把选择权抢走（2026-10-02 反馈）。补绑只放在 startNight 的入夜前那一次。
  // 确认身份：每个拿到牌的人各点一次「确认」，全员确认就提前入夜；
  // AI 直接预置为已确认 —— 否则几个真人在那儿干等 AI 熬到兜底超时。
  state.prepConfirmed = {}
  Object.keys(state.roleMap).forEach((id) => {
    if (playerOf(state, id)?.isAI) state.prepConfirmed[id] = true
  })
  pushFeed(state, '列车即将发车 —— 看完自己的身份牌，点「确认身份」即可入梦。', 'info')
  pushLog(state, '开局：进入准备期')
  return state.phase
}

// 确认身份（准备期每人一次）。全桌确认完 → 立刻入第一夜，不必等满兜底倒计时。
export function confirmIdentity(state, playerId) {
  if (state.phase !== PHASE.PREP) return false
  if (!state.roleMap[playerId]) return false
  if (state.prepConfirmed?.[playerId]) return false
  state.prepConfirmed[playerId] = true
  pushLog(state, `准备期：${playerOf(state, playerId)?.name || playerId} 已确认身份`)
  return true
}

// 还没确认的人。AI 在 startPrep 就预置好了，所以这里通常只会剩下「还没点的真人」。
export function prepPendingIds(state) {
  if (!state.prepConfirmed) return []
  return Object.keys(state.roleMap).filter((id) => !state.prepConfirmed[id])
}

// 是不是全桌都确认完了
export function prepAllConfirmed(state) {
  const ids = Object.keys(state.roleMap)
  if (!ids.length) return false
  return ids.every((id) => !!state.prepConfirmed?.[id])
}

// 准备期界面要看的进度：总共几人、已确认几人、还差哪几个座位。
// 「还差谁」在联机里是公开信息（谁还没看完牌），只给座位号，不给身份。
export function prepConfirmOf(state) {
  if (state.phase !== PHASE.PREP) return null
  const total = Object.keys(state.roleMap).length
  const pending = prepPendingIds(state)
  return {
    total,
    done: total - pending.length,
    pendingSeats: pending.map((id) => playerOf(state, id)?.seat).filter((s) => s != null),
  }
}

export function startNight(state) {
  // 入夜前先兜一眼羁绊：准备期没点到座位的昔涟，由系统随机补一个，别让她空着手进夜
  ensureBonds(state)
  state.round += 1
  state.night = emptyNight()
  // 把上一日的票型留档再清空。AI 银狼靠它判断「谁投票针对过狼队」（2026-10-05 修：
  // 以前直接清掉，aiWolfKill 读到的永远是空票箱，那条策略等于不存在）
  state.lastDayVotes = { ...state.votes }
  state.votes = {}
  state.phase = PHASE.NIGHT
  // 夜晚从银狼先手开始：狼定刀口 → 瓦尔特感应 → 姬子用药 → 流萤照亮
  state.nightStep = NIGHT_STEPS[0]
  // 被流萤拖住的这一夜：银狼回合整步跳过（含白狼王 / 自爆狼），直接从瓦尔特开始
  if (state.wolfFreezeRound === state.round) {
    state.nightStep = NIGHT_STEPS[1]
    pushFeed(state, `萤火还未散去 —— 星核猎手这一夜无法行动。`, 'good')
    pushLog(state, `第 ${state.round} 夜：银狼回合被萤火拖住，跳过`)
  }
  state.deadline = Date.now() + (NIGHT_STEP_MS[state.nightStep] || PHASE_MS[PHASE.NIGHT])
  // 反击只在被放逐那一刻有效，进夜即清空
  state.hunterId = ''
  state.hunterDone = false
  state.hunterFired = ''
  state.hunterFrom = ''
  pushFeed(state, `第 ${state.round} 夜 · ${TERMS.night}。梦境沉了下来，能动的只有少数几个人。`, 'night')
  pushLog(state, `第 ${state.round} 夜：第一步 —— ${NIGHT_STEP_LABEL[state.nightStep]}`)
  return state.round
}

// 银狼本夜最多重投几次见 config 的 WOLF_REVOTE_MAX（引擎从配置层引入）：
// 第一次平票重投、第二次平票还重投，再平票就按 wolfTarget 的「取先到」定刀 —— 不许无限重投。

// 当前刀口票型里的并列最高票目标（null = 没平票）
function wolfVoteTied(state) {
  const votes = Object.values(state.night.wolfVotes).filter(Boolean)
  if (votes.length < 2) return null
  const tally = {}
  votes.forEach((t) => { tally[t] = (tally[t] || 0) + 1 })
  const top = Math.max(...Object.values(tally))
  const tied = Object.keys(tally).filter((t) => tally[t] === top)
  return tied.length >= 2 ? tied : null
}

// 平票 → 清空票箱，所有狼（含真人、含已投过的）重新投一轮，本步留在 wolf 不往下走。
// ★ 必须在「每一票落定后」就查一次（submitNightAction 里调），不能等到 advanceNightStep
//   那一刻 —— 否则票可能已经在推进后被结算掉，重投根本来不及发生。
export function checkWolfRevote(state) {
  const n = state.night
  if (n.wolfRevoteCount >= WOLF_REVOTE_MAX) return false
  if (aliveWolves(state).length < 2) return false
  const tied = wolfVoteTied(state)
  if (!tied) return false
  n.wolfVotes = {}
  n.wolfOrder = []
  n.wolfPassed = {}
  // ★ 不清 wolfTallied：它是「本夜这一票有没有已经为计分记过一笔」的标记，跟票箱没关系。
  //   清了它，重投后每只狼再投一次就会把 nightActions 再记一遍 —— 金币多算（2026-10-05 修）。
  n.wolfRevoteCount += 1
  state.deadline = Date.now() + (NIGHT_STEP_MS.wolf || PHASE_MS[PHASE.NIGHT])
  pushLog(
    state,
    `第 ${state.round} 夜：银狼票型平票（${tied.length} 人同票），本步重投第 ${n.wolfRevoteCount} 次`
  )
  return true
}

// 夜间分步推进：一夜拆成 银狼 → 瓦尔特 → 姬子 → 流萤 → 卡芙卡，'done' 表示可结算
export function advanceNightStep(state) {
  if (state.phase !== PHASE.NIGHT) return 'done'
  // 平票重投：留在 wolf 这一步，不往下走。
  // ★ 必须按「真的重投了」才 return —— 2026-10-02 这里写成无条件 return 'wolf'，
  //   重投之后 wolf 步就再也不往前进，整夜卡死在狼这里，倒计时走完也进不了下一阶段。
  if (state.nightStep === 'wolf' && checkWolfRevote(state)) return 'wolf'
  const i = NIGHT_STEPS.indexOf(state.nightStep)
  // 认不出的 nightStep（'' / 'done' / 脏值）一律收夜：以前回退到 NIGHT_STEPS[0]，
  // 会让整夜倒退回去重跑狼步、还会顺手触发一次平票重投，比直接结束危险得多（2026-10-05 修）
  const next = i < 0 ? 'done' : (NIGHT_STEPS[i + 1] || 'done')
  state.nightStep = next
  if (next === 'done') {
    state.deadline = 0
    return 'done'
  }
  state.deadline = Date.now() + (NIGHT_STEP_MS[next] || PHASE_MS[PHASE.NIGHT])
  pushLog(state, `第 ${state.round} 夜：下一步 —— ${NIGHT_STEP_LABEL[next] || next}`)
  return next
}

// 这一夜的四个步骤是否都走完了
export const nightStepsDone = (state) =>
  state.phase !== PHASE.NIGHT || state.nightStep === 'done'

// 分步文案（阶段条 / 判官面板共用）
export const nightStepLabel = (step) => NIGHT_STEP_LABEL[step] || ''

// 进入梦醒：先兑现萤火延后的离场，再公布本夜结果
export function startDay(state, nightResult = null) {
  state.phase = PHASE.DAY
  state.deadline = 0
  state.nightStep = ''

  const deaths = []
  // 1) 萤火延后的死：上一昼夜欠下的账
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

  // 3) 存活计分（活过一个昼夜计一分）
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

  // 5) 复盘素材：谁被骇入、瓦尔特验到谁、流萤照亮谁（只进 log，对局中不下发）
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

  // 瓦尔特昨晚的结论单独再列一条
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

// 遗言 / 轮流发言：两阶段共用同一套机制，区别只在 order 从哪来（离场者 / 存活者）

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
  // 按座位顺序，存活者全员
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

// 当前该谁发言，没有则返回 null
export function currentSpeaker(state) {
  if (state.phase !== PHASE.LAST_WORDS && state.phase !== PHASE.SPEAKING) return null
  const sp = state.speaking
  return sp.order[sp.index] || null
}

// 这一轮轮流发言/遗言是否已发完
export function speakingDone(state) {
  if (state.phase !== PHASE.LAST_WORDS && state.phase !== PHASE.SPEAKING) return true
  return state.speaking.index >= state.speaking.order.length
}

// 轮到下一位，返回 true 表示这一阶段发完了
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

// 发言（幂等）
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
  // 遗言同时进广播
  if (state.speaking.mode === 'lastwords') {
    pushFeed(state, `${playerOf(state, speakerId)?.name} 的遗言：${clean}`, 'warn')
    pushLog(state, `第 ${state.round} 天：${playerOf(state, speakerId)?.name} 遗言 —— ${clean}`)
  } else {
    pushLog(state, `第 ${state.round} 天：${playerOf(state, speakerId)?.name} 发言 —— ${clean}`)
  }
  advanceSpeaker(state)
  return { ok: true, text: clean }
}

// 不发言直接过掉这一位（幂等）
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

// 平票加时，清空票型重投一轮
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

// 丹恒反击：离场后可带走一名乘客，此时他已不在 alive 里，只认 state.hunterId。
// from：'exile'（被放逐，打完后直接入夜）| 'night'（夜里被骇入，打完后梦醒流程继续）
export function startHunter(state, hunterId, from = 'exile') {
  state.phase = PHASE.HUNTER
  state.hunterId = hunterId || ''
  state.hunterDone = false
  state.hunterFired = ''
  state.hunterFrom = from
  state.deadline = Date.now() + PHASE_MS[PHASE.HUNTER]
  const p = playerOf(state, hunterId)
  const why = from === 'night' ? `在夜里离场` : `被${TERMS.exile}`
  pushFeed(
    state,
    `${p?.name || '丹恒'} ${why} —— 他还有最后一件事要做：${TERMS.hunterShoot}。`,
    'warn'
  )
  pushLog(state, `第 ${state.round} 天：${p?.name} 是丹恒，进入「${TERMS.hunterShoot}」阶段（来源：${from}）`)
  return state.hunterId
}

// 猎人此刻是否还欠一个决定
export function hunterPending(state, playerId) {
  if (state.phase !== PHASE.HUNTER) return false
  if (!state.hunterId || state.hunterId !== playerId) return false
  return !state.hunterDone
}

// 现在还在等谁，AI 判官据此判断能否收阶段
export const hunterActorsPending = (state) =>
  state.phase === PHASE.HUNTER && state.hunterId && !state.hunterDone ? [state.hunterId] : []

// 开枪带走一名存活乘客
export function submitHunterShoot(state, actorId, targetId) {
  if (state.phase !== PHASE.HUNTER) return { ok: false, msg: '现在不是反击的时间' }
  if (state.hunterId !== actorId) return { ok: false, msg: '只有丹恒能发动反击' }
  if (state.hunterDone) return { ok: true, duplicate: true }
  if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
  state.hunterDone = true
  state.hunterFired = targetId
  killPlayer(state, targetId)
  // 设定表：反击计入「夜间技能 +50」（放弃开枪不计）
  bumpTally(state, actorId, 'nightActions')
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

// 放弃开枪
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

// AI 丹恒开枪：优先带走投过自己的人，否则随机
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
  // 结算文案要说清靠哪条赢的
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

// 只判胜负、不推进阶段（null = 继续）
export function evaluateWin(state) {
  return checkWin(state.roleMap, state.alive)
}

// 离场（唯一的死亡收口）。流萤走时萤火燃尽，星核猎手下一夜无法行动（含白狼王 / 自爆狼）
function killPlayer(state, id) {
  if (!isAlive(state, id)) return false
  state.alive = state.alive.filter((x) => x !== id)
  if (state.roleMap[id] === ROLE.FIREFLY) {
    state.wolfFreezeRound = state.round + 1
    pushLog(state, `第 ${state.round} 天：流萤离场 —— 星核猎手下一夜无法行动`)
  }
  // 离场收口：绑定关系必须跟着断开（谁死都断，不只断昔涟自己）。
  // 否则 bonds 会留下一条指向死人的反向引用 —— 活着的那一侧在「只有你知道」
  // 里还会念出一个已经不在局里的人，而死者那侧也白挂着「绑定者」标签。
  if (state.bonds?.[id]) {
    const partner = state.bonds[id]
    delete state.bonds[id]
    if (partner) delete state.bonds[partner]
    pushLog(state, `第 ${state.round} 天：${playerOf(state, id)?.name || id} 离场，绑定关系断开`)
  }
  return true
}

//  夜间动作（幂等） 

// 每个动作属于夜间哪一步；每个角色都必须有一个 -pass 的明确决定
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
  'kafka-mark': 'kafka',
  'kafka-pass': 'kafka',
}

// action: 'wolf-kill' | 'seer-check' | 'witch-save' | 'witch-poison' | 'firefly-light'
export function submitNightAction(state, actorId, action, targetId = null) {
  if (state.phase !== PHASE.NIGHT) return { ok: false, msg: '现在不是入梦时间' }
  const role = state.roleMap[actorId]
  if (!role) return { ok: false, msg: '你不在本局中' }
  if (!isAlive(state, actorId)) return { ok: false, msg: '你已经离场了' }
  const n = state.night

  // 分步守卫：一夜只按 银狼 → 瓦尔特 → 姬子 → 流萤 的顺序走，提前出手一律拒绝
  const needStep = ACTION_STEP[action]
  if (needStep && state.nightStep !== needStep) {
    return { ok: false, msg: `现在不是「${NIGHT_STEP_LABEL[needStep] || needStep}」的时间` }
  }

  switch (action) {
    case 'wolf-kill': {
      if (!isWolfRole(role)) return { ok: false, msg: '只有银狼能骇入' }
      if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
      // 可以骇入同伴，但不含自己
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
      // 一票落定就查平票：撞车（投了不同的人）立刻清空重投，别等到这一步被推走才发现
      const revoted = checkWolfRevote(state)
      return { ok: true, killTarget: wolfTarget(state), revoted }
    }
    // 空刀：银狼本夜不杀，必须留这个标记
    case 'wolf-pass': {
      if (!isWolfRole(role)) return { ok: false, msg: '只有银狼能决定是否骇入' }
      if (n.wolfPassed[actorId] && n.wolfVotes[actorId] === undefined) return { ok: true, duplicate: true }
      const prev = n.wolfVotes[actorId]
      if (prev !== undefined) {
        delete n.wolfVotes[actorId]
        n.wolfOrder = n.wolfOrder.filter((t) => t !== prev)
        // 改主意不算用了一次技能，把记分收回
        const t = state.tally[actorId]
        if (t && t.nightActions > 0) t.nightActions -= 1
        delete n.wolfTallied[actorId]
      }
      n.wolfPassed[actorId] = true
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（银狼）选择本夜不动手`)
      const revoted = checkWolfRevote(state)
      return { ok: true, killTarget: wolfTarget(state), revoted }
    }
    case 'seer-check': {
      if (role !== ROLE.SEER) return { ok: false, msg: '只有瓦尔特能感应' }
      if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
      if (targetId === actorId) return { ok: false, msg: '不能感应自己' }
      if (n.seerTarget) return { ok: true, duplicate: true, targetId: n.seerTarget }
      n.seerTarget = targetId
      // 留档供判官复盘（state.night 会被下一夜清空）
      state.seerHistory.push({ round: state.round, targetId, team: seerTeamOf(state, targetId) })
      bumpTally(state, actorId, 'nightActions')
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（瓦尔特）感应 → ${playerOf(state, targetId)?.name}（${isWolfRole(state.roleMap[targetId]) ? '星核猎手' : '列车组'}）`)
      return { ok: true, targetId, team: seerTeamOf(state, targetId) }
    }
    // 瓦尔特本夜不感应，必须留标记
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
    // 女巫本夜两瓶都不用，必须留标记
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
    // 流萤本夜不照亮，必须留标记
    case 'firefly-pass': {
      if (role !== ROLE.FIREFLY) return { ok: false, msg: '只有流萤能照亮' }
      if (n.fireflyLit) return { ok: true, duplicate: true }
      if (n.fireflyPassed) return { ok: true, duplicate: true }
      n.fireflyPassed = true
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（流萤）选择本夜不照亮`)
      return { ok: true }
    }
    case 'kafka-mark': {
      if (role !== ROLE.KAFKA) return { ok: false, msg: '只有卡芙卡能摄梦' }
      if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
      if (targetId === actorId) return { ok: false, msg: '不能标记自己' }
      if (n.kafkaMark) return { ok: true, duplicate: true, targetId: n.kafkaMark }
      n.kafkaMark = targetId
      delete n.kafkaPassed
      bumpTally(state, actorId, 'nightActions')
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（卡芙卡）摄梦 → ${playerOf(state, targetId)?.name}`)
      return { ok: true, targetId }
    }
    // 卡芙卡本夜不标记，必须留标记
    case 'kafka-pass': {
      if (role !== ROLE.KAFKA) return { ok: false, msg: '只有卡芙卡能是否摄梦' }
      if (n.kafkaMark) return { ok: true, duplicate: true }
      if (n.kafkaPassed) return { ok: true, duplicate: true }
      n.kafkaPassed = true
      pushLog(state, `第 ${state.round} 夜：${playerOf(state, actorId)?.name}（卡芙卡）选择本夜不摄梦`)
      return { ok: true }
    }
    default:
      return { ok: false, msg: '未知的夜间动作' }
  }
}

export function seerTeamOf(state, targetId) {
  return isWolfRole(state.roleMap[targetId]) ? CAMP.HUNT : CAMP.TRAIN
}

//  夜间结算（幂等） 

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

  // 姬子的咖啡：完全救下，优先级最高
  if (killed && n.witchSave && witchAlive) {
    savedBy = 'coffee'
  }

  // 萤火：延迟一死或完全救下
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

  // 毒咖啡：无法被任何手段拦下
  const poison = n.witchPoison
  if (poison && witchAlive && isAlive(state, poison) && !deaths.includes(poison)) deaths.push(poison)

  // 卡芙卡摄梦：连续两晚标记同一人 → 处决（无法被任何手段拦下，次日梦醒公布）
  const kafkaKill =
    n.kafkaMark && state.kafkaLastMark === n.kafkaMark && isAlive(state, n.kafkaMark)
  if (kafkaKill && !deaths.includes(n.kafkaMark)) {
    deaths.push(n.kafkaMark)
    state.kafkaKills += 1
    bumpTally(state, findRole(state, ROLE.KAFKA), 'kafkaKills')
    pushLog(state, `第 ${state.round} 夜：卡芙卡摄梦满两晚 → ${playerOf(state, n.kafkaMark)?.name} 被处决`)
  }
  // 留档本夜标记供下一夜比较；已处决则清空，避免连着处决同一人
  state.kafkaLastMark = n.kafkaMark && !deaths.includes(n.kafkaMark) ? n.kafkaMark : null

  state.lastNightDeaths = deaths
  state.lastNightSaved = !!savedBy
  state.lastNightSavedBy = savedBy
  return { deaths, saved: !!savedBy, savedBy }
}

//  投票（幂等） 

// 投票阶段允许改票，后一次覆盖前一次
export function submitVote(state, voterId, targetId) {
  if (state.phase !== PHASE.VOTE) return { ok: false, msg: '现在不是投票时间' }
  if (!isAlive(state, voterId)) return { ok: false, msg: '你已经离场了，不能投票' }
  if (targetId && !isAlive(state, targetId)) return { ok: false, msg: '该乘客已经离场了' }
  if (targetId === voterId) return { ok: false, msg: '不能投自己' }
  if (targetId === undefined) return { ok: false, msg: '无效的投票目标' }
  if (state.votes[voterId] === targetId) return { ok: true, duplicate: true }
  state.votes[voterId] = targetId || ''   // '' 表示弃票
  // 刻意**不**在这里记「投票命中」—— 口径见 applyExile：
  // 只有「投给了最终被投出的那只狼」才算；提前记会把「投了狼但没投出」「中途改票」也算进去。
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

// 结算投票，返回 { votes, outId, tie, outIds, revote, round }
// 并列最高 → 全场加时重投一轮，加时轮仍平票才流局
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
    // 第一轮平票则加时重投，已是加时轮则流局
    if (state.voteRound < 2) {
      state.voteRound = 2
      return { votes, outId: null, tie: true, outIds: top, revote: true, round: 2 }
    }
    return { votes, outId: null, tie: true, outIds: top, revote: false, round: state.voteRound }
  }

  return { votes, outId: top[0], tie: false, outIds: top, revote: false, round: state.voteRound }
}

// 放逐（幂等）
export function applyExile(state, outId) {
  if (!outId) return { ok: false, msg: '无人出局' }
  if (!isAlive(state, outId)) return { ok: true, duplicate: true }
  // 投票命中口径：只有把票投给「这只被投出的狼」的人才各记一笔。
  // 投了别的狼、投了没被投出的人、弃票 —— 都不算（见设定表「投票命中」条）。
  if (isWolfRole(state.roleMap[outId])) {
    Object.keys(state.votes).forEach((voter) => {
      if (state.votes[voter] === outId) bumpTally(state, voter, 'voteHits')
    })
  }
  killPlayer(state, outId)
  const p = playerOf(state, outId)
  // 离场不公开身份：只公布「谁走了」，真实角色留到赛后复盘才揭晓
  pushFeed(state, `${p?.name} 被${TERMS.exile}，离开了梦境。`, 'bad')
  pushLog(state, `第 ${state.round} 天：${p?.name} 被放逐（真实身份：${roleLabelOf(state, outId)}）`)
  // 自爆狼被投出 → 爆炸带走一人（系统随机，不可指定；发生在放逐结算里）
  if (state.roleMap[outId] === ROLE.BOMB_WOLF) {
    const cand = state.alive.filter((id) => id !== outId)
    if (cand.length) {
      const t = cand[Math.floor(Math.random() * cand.length)]
      killPlayer(state, t)
      pushFeed(state, `${p?.name} 被放逐时爆炸，${playerOf(state, t)?.name || t} 被一同带走。`, 'bad')
      pushLog(state, `第 ${state.round} 天：${p?.name}（自爆狼）爆炸 → ${playerOf(state, t)?.name}`)
    }
  }
  return { ok: true, outId }
}

//  自爆：白狼王 / 自爆狼 
// 白狼王 'white'：亮牌带走一人 → 自己出局 → 当天跳过投票直接入夜
// 自爆狼 'bomb' ：带走一人 → 自己出局 → 流程继续（投票照常进行）
// 两者都是白天动作（设定表：夜间不带走任何人）
export function canWolfBlast(state, playerId) {
  if (!isAlive(state, playerId)) return null
  const role = state.roleMap[playerId]
  if (role === ROLE.WHITE_WOLF) return 'white'
  if (role === ROLE.BOMB_WOLF) return 'bomb'
  return null
}

const BLAST_PHASES = [PHASE.DAY, PHASE.LAST_WORDS, PHASE.SPEAKING, PHASE.DISCUSS, PHASE.VOTE]

export function submitWolfBlast(state, actorId, targetId) {
  const kind = canWolfBlast(state, actorId)
  if (!kind) return { ok: false, msg: '你没有自爆的能力' }
  if (!BLAST_PHASES.includes(state.phase)) return { ok: false, msg: '自爆只发生在白天' }
  if (!targetId || !isAlive(state, targetId)) return { ok: false, msg: '请选择一个还在梦境里的乘客' }
  if (targetId === actorId) return { ok: false, msg: '不能带走自己' }
  const self = playerOf(state, actorId)
  const victim = playerOf(state, targetId)
  killPlayer(state, targetId)
  killPlayer(state, actorId)
  const who = kind === 'white' ? '白狼王' : '自爆狼'
  pushFeed(
    state,
    kind === 'white'
      ? `「银狼 Lv.999 自爆」—— ${self?.name || actorId} 公开亮牌，带走 ${victim?.name || targetId} 后自己出局。`
      : `${self?.name || actorId} 自爆，带走 ${victim?.name || targetId}，自己也随即出局。`,
    'bad'
  )
  pushLog(state, `第 ${state.round} 天：${self?.name}（${who}）自爆 → ${victim?.name}`)
  if (kind === 'white') state.skipVoteToNight = true
  return { ok: true, kind, targetId, selfOut: actorId }
}

// AI 自爆决策：只在「今天大概率活不过去」时才发动 —— 白狼王的自爆是一次性的，早用就亏了。
// 目标优先级：瓦尔特（信息位最值钱）> 当前得票最高的人 > 随机。
export function aiWolfBlast(state, actorId) {
  if (!canWolfBlast(state, actorId)) return null
  const votes = tallyVotes(state)
  const againstMe = (votes[actorId] || []).length
  const aliveCount = state.alive.length
  // 危险线：指向自己的票数达到存活人数的三分之一，基本会被投出去
  if (againstMe < Math.max(2, Math.floor(aliveCount / 3))) return null
  const cand = state.alive.filter((id) => id !== actorId)
  if (!cand.length) return null
  const seer = findRole(state, ROLE.SEER)
  if (seer && cand.includes(seer)) return seer
  let best = null
  let bestN = 0
  Object.keys(votes).forEach((t) => {
    if (t === 'abstain' || t === actorId || !cand.includes(t)) return
    if (votes[t].length > bestN) { bestN = votes[t].length; best = t }
  })
  return best || cand[Math.floor(Math.random() * cand.length)]
}

// 昔涟指定绑定对象（真人自主选择时用），返回是否成功
export function setBond(state, xilianId, partnerId) {
  if (state.roleMap[xilianId] !== ROLE.XILIAN) return false
  if (!partnerId || partnerId === xilianId) return false
  if (!state.roleMap[partnerId]) return false
  Object.keys(state.bonds).forEach((k) => delete state.bonds[k])
  state.bonds[xilianId] = partnerId
  state.bonds[partnerId] = xilianId
  pushLog(state, `开局：昔涟（${playerOf(state, xilianId)?.name}）改与 ${playerOf(state, partnerId)?.name} 缔结羁绊`)
  return true
}

export function roleLabelOf(state, id) {
  const r = ROLES[state.roleMap[id]]
  return r ? `${r.name}·${r.title}` : '未知'
}

//  某个玩家此刻还欠什么动作 

export function pendingNightAction(state, playerId) {
  if (state.phase !== PHASE.NIGHT) return null
  if (!isAlive(state, playerId)) return null
  const step = state.nightStep
  // 还没轮到这一步的人一律算不欠动作
  if (!step || step === 'done') return null
  const role = state.roleMap[playerId]
  const n = state.night
  if (isWolfRole(role)) {
    if (step !== 'wolf') return null
    return n.wolfVotes[playerId] || n.wolfPassed[playerId] ? null : 'wolf-kill'
  }
  if (role === ROLE.SEER) {
    if (step !== 'seer') return null
    return n.seerTarget || n.seerPassed ? null : 'seer-check'
  }
  if (role === ROLE.WITCH) {
    if (step !== 'witch') return null
    // 本夜已做过决定就没事了
    if (n.witchSave || n.witchPoison || n.witchPassed) return null
    // 两瓶都用光后与平民无异
    if (state.witchSaveLeft > 0 || state.witchPoisonLeft > 0) return 'witch'
    return null
  }
  if (role === ROLE.FIREFLY) {
    if (step !== 'firefly') return null
    return n.fireflyLit || n.fireflyPassed ? null : 'firefly-light'
  }
  if (role === ROLE.KAFKA) {
    if (step !== 'kafka') return null
    return n.kafkaMark || n.kafkaPassed ? null : 'kafka-mark'
  }
  return null
}

// 所有还需要行动的存活玩家，已按当前分步过滤
export function actorsPending(state) {
  return state.alive.filter((id) => pendingNightAction(state, id))
}

//  单人：AI 决策 

// 银狼选目标：优先被自己同伴投过的人，第一夜纯随机
export function aiWolfKill(state, actorId) {
  const mates = wolfIds(state).filter((id) => id !== actorId)
  const mateSet = new Set(mates)
  const others = state.alive.filter((id) => id !== actorId && !mateSet.has(id))
  const cand = others.length ? others : state.alive.filter((id) => id !== actorId)
  if (cand.length === 0) return null
  // 上一日把票投给过狼队的人，优先带走。
  // ★ lastDayVotes 的结构是 { 投票者: 目标 }，必须**反着扫** —— 目标落在狼身上的人，
  //   才是「针对过我们」的人。原写法 `mates.some((w) => votes[w] === id)` 看的是
  //   「狼投给了谁」，语义整个是反的；再加上 state.votes 入夜就被清空，
  //   这条策略从头到尾就没生效过一次（2026-10-05 修）。
  const wolves = new Set([actorId, ...mates])
  const votedUs = new Set()
  Object.entries(state.lastDayVotes || {}).forEach(([voter, target]) => {
    if (target && wolves.has(target)) votedUs.add(voter)
  })
  const scored = cand.map((id) => {
    let score = Math.random() * 2
    if (votedUs.has(id)) score += 0.6
    return { id, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].id
}

// 瓦尔特选目标：优先没验过的人（验过的不再浪费次数），全员验完后退回随机
export function aiSeerCheck(state, actorId) {
  const cand = state.alive.filter((id) => id !== actorId)
  if (cand.length === 0) return null
  const checked = new Set(state.seerHistory.map((h) => h.targetId))
  const fresh = cand.filter((id) => !checked.has(id))
  const pool = fresh.length ? fresh : cand
  return pool[Math.floor(Math.random() * pool.length)]
}

// 姬子：要不要用咖啡 / 毒咖啡，策略保守
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
  // 什么都不做时必须显式过，否则会被当成还没行动
  out.pass = !out.save && !out.poison
  return out
}

// 流萤照亮：优先照亮玩家（玩家是好人 80%，玩家是银狼且第一夜 70%）
export function aiFireflyLight(state, actorId, humanId = null) {
  const cand = state.alive.filter((id) => id !== actorId && id !== state.lastFireflyLit)
  if (cand.length === 0) return null

  if (humanId && cand.includes(humanId)) {
    const humanIsWolf = isWolfRole(state.roleMap[humanId])
    const p = humanIsWolf ? (state.round === 1 ? 0.7 : 0.4) : 0.8
    if (Math.random() < p) return humanId
  }
  // 偏好好人
  const friends = cand.filter((id) => !isWolfRole(state.roleMap[id]))
  const pool = friends.length ? friends : cand
  return pool[Math.floor(Math.random() * pool.length)]
}

// 卡芙卡选目标：已标过一次的人还在场就补第二晚（凑满处决），否则随机
export function aiKafkaMark(state, actorId) {
  const cand = state.alive.filter((id) => id !== actorId)
  if (cand.length === 0) return null
  if (state.kafkaLastMark && cand.includes(state.kafkaLastMark)) return state.kafkaLastMark
  return cand[Math.floor(Math.random() * cand.length)]
}

// 统一入口：给 AI 玩家算一个夜间动作
export function aiNightAction(state, actorId, humanId = null) {
  const role = state.roleMap[actorId]
  if (isWolfRole(role)) return { action: 'wolf-kill', targetId: aiWolfKill(state, actorId) }
  if (role === ROLE.SEER) return { action: 'seer-check', targetId: aiSeerCheck(state, actorId) }
  if (role === ROLE.WITCH) {
    const d = aiWitchDecide(state, actorId)
    return { action: 'witch', targetId: null, save: d.save, poison: d.poison, pass: d.pass }
  }
  if (role === ROLE.FIREFLY) return { action: 'firefly-light', targetId: aiFireflyLight(state, actorId, humanId) }
  if (role === ROLE.KAFKA) return { action: 'kafka-mark', targetId: aiKafkaMark(state, actorId) }
  return null
}

//  公开发言的「后果」 
// 记下一条公开指认。AI 发言后由调用方登记；玩家手打的发言不做文本解析（不猜人心思）。
export function recordClaim(state, byId, claim) {
  if (!claim || !claim.targetId || !byId) return false
  if (!Array.isArray(state.claims)) state.claims = []
  state.claims.push({
    byId,
    round: state.round,
    kind: claim.kind === 'claim-seer' ? 'claim-seer' : 'suspect',
    targetId: claim.targetId,
  })
  return true
}

// 汇总「现在谁最可疑」：被指认次数最多的人。跳预言家的指认算双份 —— 它是桌上最硬的公开信息。
// 刻意不统计自己的指认，否则 AI 会一直踩自己刚说过的那个人。
function claimFocusedTarget(state, actorId) {
  const score = {}
  ;(state.claims || []).forEach((c) => {
    if (!c.targetId || c.byId === actorId) return
    if (!state.alive.includes(c.targetId)) return
    score[c.targetId] = (score[c.targetId] || 0) + (c.kind === 'claim-seer' ? 2 : 1)
  })
  let best = ''
  let bestN = 0
  Object.keys(score).forEach((id) => {
    if (score[id] > bestN) {
      bestN = score[id]
      best = id
    }
  })
  return best
}

// 狼投票时最想报复的人：公开发言里指认过狼队的人（跳预言家的权重更高）
function claimAccuserOfWolves(state, actorId) {
  const wolves = new Set(wolfIds(state))
  const score = {}
  ;(state.claims || []).forEach((c) => {
    if (!c.targetId || !wolves.has(c.targetId)) return
    if (c.byId === actorId) return
    if (!state.alive.includes(c.byId)) return
    score[c.byId] = (score[c.byId] || 0) + (c.kind === 'claim-seer' ? 2 : 1)
  })
  let best = ''
  let bestN = 0
  Object.keys(score).forEach((id) => {
    if (score[id] > bestN) {
      bestN = score[id]
      best = id
    }
  })
  return best
}

// AI 投票：会读「公开发言」了 —— 好人跟着集火、狼避开同伴并报复指认过狼队的人。
//   瓦尔特：优先投自己验出的狼（最确定的票）
//   狼    ：绝不投同伴；同伴已被推到高位时顺势投他洗白；否则带走指认过狼队的人
//   其他人：优先跟公开指认（75%），其次跟票（30%），最后随机
export function aiVote(state, actorId) {
  const cand = state.alive.filter((id) => id !== actorId)
  if (cand.length === 0) return ''
  const role = state.roleMap[actorId]

  // 只有瓦尔特能用这条 —— 验人结论是它独有的私有信息，别人不该有
  if (role === ROLE.SEER) {
    const hit = state.seerHistory.find((h) => h.team === CAMP.HUNT && cand.includes(h.targetId))
    if (hit) return hit.targetId
  }

  const focused = claimFocusedTarget(state, actorId)

  //  狼 
  if (isWolfRole(role)) {
    const mates = new Set(wolfIds(state).filter((id) => id !== actorId))
    // 同伴已经被推到高位：顺势投他一票洗白自己（狼队内部的「割席」）
    if (focused && mates.has(focused) && (tallyVotes(state)[focused]?.length || 0) >= 2) {
      return focused
    }
    // 报复：优先带走公开发言里指认过狼队的人
    const accuser = claimAccuserOfWolves(state, actorId)
    if (accuser && cand.includes(accuser) && Math.random() < 0.7) return accuser
    // 集火：跟着公开指认走，但那个人不能是自己同伴
    if (focused && !mates.has(focused) && Math.random() < 0.8) return focused
    // 兜底：只在非同伴里挑 —— 这一条保证狼不会再误投同伴
    const safe = cand.filter((id) => !mates.has(id))
    const pool = safe.length ? safe : cand
    return pool[Math.floor(Math.random() * pool.length)]
  }

  //  好人 
  if (focused && Math.random() < 0.75) return focused
  if (Math.random() < 0.3) {
    // 跟票：跟随当前得票最高的人
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

// AI 发言：模板池 + 简单策略
const AI_SPEAK = {
  generic: ['我先过，听大家的。', '我是列车组，没有别的信息。', '这轮票型有点奇怪，我记一下。', '我暂时保留意见。', '昨晚很安静，我倾向再听一轮。'],
  suspect: ['我怀疑 {seat} 号，他刚才那句话站不住脚。', '{seat} 号的发言太急了，我先记一票。', '我投 {seat} 号，理由是他的立场变来变去。'],
  defend: ['我不是星核猎手，别投我。', '我真的是列车组，投我就是在帮他们。', '你们要想清楚，我走了对列车组没好处。'],
  claim: ['我是瓦尔特，昨晚感应到 {seat} 号是星核猎手。', '我是流萤，昨晚我照亮了 {seat} 号。'],
}

// AI 发言：返回 { text, claim } —— claim 是这次发言的**公开后果**，由调用方登记进 state.claims。
// 以前只返回文本、说了什么都不进状态，AI 之间等于互相听不见，投票用不上发言（2026-10-06 修）。
export function aiSpeakPlan(state, actorId) {
  const others = state.alive.filter((id) => id !== actorId)
  const role = state.roleMap[actorId]
  const seatOf = (id) => playerOf(state, id)?.seat ?? '?'
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
  const focused = claimFocusedTarget(state, actorId)

  // ① 被票到高位 → 反水：不再干巴巴辩护，而是反手指认一个更可疑的人
  const votes = tallyVotes(state)
  const myVotes = votes[actorId]?.length || 0
  if (myVotes >= 2) {
    const target = focused || (others.length ? others[Math.floor(Math.random() * others.length)] : '')
    if (target) {
      return {
        text: `我被票得莫名其妙。真要说可疑，${seatOf(target)} 号比我可疑得多，票他。`,
        claim: { kind: 'suspect', targetId: target },
      }
    }
    return { text: pick(AI_SPEAK.defend), claim: null }
  }

  // ② 狼的悍跳：冒充瓦尔特指认一个好人。优先挑「已经在风口上的人」，
  //    这样假指认看起来是顺水推舟，更容易被信 —— 它是狼唯一能主动制造舆论的手段。
  if (isWolfRole(role) && Math.random() < 0.25) {
    const goods = others.filter((id) => !isWolfRole(state.roleMap[id]))
    const pool = goods.length ? goods : others
    const prefer = focused && pool.includes(focused) ? focused : null
    const target = prefer || (pool.length ? pool[Math.floor(Math.random() * pool.length)] : null)
    if (target) {
      return {
        text: `我是瓦尔特，昨晚感应到 ${seatOf(target)} 号是星核猎手。`,
        claim: { kind: 'claim-seer', targetId: target },
      }
    }
  }

  // ③ 瓦尔特有狼信息时有一定概率直接报出来（这条是真信息，权重高于悍跳）
  if (role === ROLE.SEER && state.night.seerTarget && Math.random() < 0.5) {
    const t = state.night.seerTarget
    if (isWolfRole(state.roleMap[t])) {
      return {
        text: `我是瓦尔特，昨晚感应到 ${seatOf(t)} 号是星核猎手。`,
        claim: { kind: 'claim-seer', targetId: t },
      }
    }
    return { text: `我是瓦尔特，${seatOf(t)} 号是列车组，可以信。`, claim: null }
  }
  // ④ 流萤偶尔暗示自己照亮了谁。这是保护性声明、不是指认，所以不记 claim
  if (role === ROLE.FIREFLY && state.night.fireflyLit && Math.random() < 0.4) {
    return { text: `昨晚我把光留在 ${seatOf(state.night.fireflyLit)} 号那里了。`, claim: null }
  }
  // ⑤ 跟着已有的公开指认集火 —— 比纯随机更容易形成真正的「票型」
  if (focused && Math.random() < 0.5) {
    return {
      text: pick(AI_SPEAK.suspect).replace('{seat}', String(seatOf(focused))),
      claim: { kind: 'suspect', targetId: focused },
    }
  }
  if (others.length && Math.random() < 0.55) {
    const t = others[Math.floor(Math.random() * others.length)]
    return {
      text: pick(AI_SPEAK.suspect).replace('{seat}', String(seatOf(t))),
      claim: { kind: 'suspect', targetId: t },
    }
  }
  return { text: pick(AI_SPEAK.generic), claim: null }
}

// 兼容旧签名：只要文本的调用方（既有断言、遗言等）继续用它
export function aiSpeak(state, actorId) {
  return aiSpeakPlan(state, actorId).text
}

// 遗言比普通发言更确定，有信息的角色会把情报带出来
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

//  私有信息（只发给本人） 

export function privateInfoOf(state, viewerId) {
  const role = state.roleMap[viewerId]
  if (!role) return null
  const out = { roleKey: role, mates: [] }
  // 准备期用：本人是否已点过「确认身份」（AI 由引擎预置为 true，压根不需要点）
  out.prepConfirmed = !!state.prepConfirmed?.[viewerId]
  // 我能不能自爆：'white'（白狼王）/ 'bomb'（自爆狼）/ ''（不能）。
  // ★ 必须放在私有信息里：非桌主的本地 state 是 null，算不出这个值，
  //   他们的自爆按钮就永远不渲染（2026-10-05 修）。
  out.blastKind = canWolfBlast(state, viewerId) || ''
  // 本夜还欠什么动作（联机客户端靠它决定行动面板显示什么）
  out.pending = pendingNightAction(state, viewerId)
  // 反击由单独标记驱动（丹恒被放逐时已不在 alive 里）
  out.hunterPending = hunterPending(state, viewerId)
  if (isWolfRole(role)) {
    out.mates = wolfIds(state).filter((id) => id !== viewerId)
    // 本夜已经重投过几次 —— 只有狼需要知道，好让界面明说「平票了，重投第 N 次」
    out.wolfRevote = state.night.wolfRevoteCount || 0
  }
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
  // 昔涟绑定：双方互知对方的角色（对方也会在自己那份私有信息里看到昔涟）
  if (state.bonds?.[viewerId]) {
    const partnerId = state.bonds[viewerId]
    out.bondInfo = {
      partnerId,
      partnerRole: state.roleMap[partnerId] || '',
      partnerName: playerOf(state, partnerId)?.name || '',
    }
  }
  if (role === ROLE.KAFKA) {
    out.kafkaInfo = {
      markedId: state.night.kafkaMark,
      lastMarkedId: state.kafkaLastMark,
      kills: state.kafkaKills || 0,
      pending: !(state.night.kafkaMark || state.night.kafkaPassed),
    }
  }
  return out
}

//  快照（中途进房 / 重连时补发） 
// 安全边界：对局中只下发自己的身份 + 公开信息，phase === OVER 时才放行全部身份
export function getSnapshot(state, viewerId) {
  const canReveal = state.phase === PHASE.OVER
  return {
    mode: state.mode,
    players: state.players.map(({ id, name, seat, isAI, avatar, away }) => ({
      id, name, seat, isAI,
      // 头像一律下发。真人的那份是联机开局时从房间成员表里带进来的、已经压过尺寸的小图
      // （本地原图是 200×200 PNG，直接发会把联机打爆 —— 压缩见 utils/avatar.js）。
      avatar: avatar || '',
      // 中途离席、由 AI 代打的座位：界面上要能一眼看出来，不然只剩一句会消失的提示
      away: !!away,
    })),
    alive: state.alive.slice(),
    round: state.round,
    phase: state.phase,
    deadline: state.deadline,
    startedAt: state.startedAt,
    // 夜晚当前分步：'wolf' | 'seer' | 'witch' | 'firefly' | 'done' | ''
    nightStep: state.nightStep || '',
    // 上一阶段（夜里分步时具体哪一步看 prevNightStep）
    prevPhase: state.prevPhase || '',
    prevNightStep: state.prevNightStep || '',
    // 此刻在等谁开枪（公开信息）
    hunterId: state.hunterId || '',
    hunterDone: !!state.hunterDone,
    votes: state.phase === PHASE.VOTE || state.phase === PHASE.OVER ? { ...state.votes } : {},
    // 2 表示平票后的加时重投
    voteRound: state.voteRound,
    voteTieIds: state.voteTieIds.slice(),
    // 昨夜离场者
    lastNightDeaths: state.lastNightDeaths.slice(),
    // 准备期的「确认身份」进度（只在准备期有值，其余阶段为 null）
    prepConfirm: prepConfirmOf(state),
    // 开拓者进度（狼人的胜利条件）
    villagers: villagerStat(state.roleMap, state.alive),
    // 狼胜原因：'villagers' | 'advantage'
    huntReason: state.phase === PHASE.OVER && state.winner === CAMP.HUNT
      ? huntWinReason(state.roleMap, state.alive)
      : '',
    // 轮流发言 / 遗言进度（全场可见）
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
    // 狼队「暗网」频道只发给还是狼的人，公开快照（viewerId 为空）一律滤掉。
    // ★ 以前是原样 slice 下发 —— 好人界面上看不到（WolfChat 自己按 channel 过滤），
    //   但暗网内容就躺在内存和 WS 包里，抓包直接能读（2026-10-05 修）。
    //   结算后（canReveal）放行，方便复盘全程聊了什么。
    chat: state.chat
      .filter(
        (m) =>
          (m.channel || 'day') !== 'wolf' ||
          canReveal ||
          (!!viewerId && isWolfRole(state.roleMap[viewerId]))
      )
      .slice(-60),
    survived: { ...state.survived },
    winner: state.winner,
    reveal: state.phase === PHASE.OVER ? { ...state.reveal } : {},
    me: viewerId ? privateInfoOf(state, viewerId) : null,
    // 计分只下发本人那一份
    myTally: viewerId ? { ...(state.tally[viewerId] || {}) } : null,
    // ★ 看的人必须是「还活着的狼」，否则一律 null —— 好人拿票况等于侧写身份
    wolfTally:
      viewerId && isWolfRole(state.roleMap[viewerId]) && state.alive.includes(viewerId)
        ? wolfTallyOf(state, viewerId)
        : null,
    // 结算时公开所有人的计数，避免定向快照迟到导致少算奖励
    tallies: state.phase === PHASE.OVER ? JSON.parse(JSON.stringify(state.tally)) : null,
    // 赛后复盘：以下四项对局中一律为 null，只在 phase === OVER 放行
    allRoles: canReveal ? { ...state.roleMap } : null,
    // 复盘要看整局的夜间接力，放宽到 120 条
    nightLog: canReveal ? state.log.slice(-120) : null,
    // 昨夜的结构化明细
    judgeInfo: canReveal
      ? { ...nightActionsOf(state), lastNightDeaths: state.lastNightDeaths.slice() }
      : null,
    // 瓦尔特的历次验人结果
    seerHistory: canReveal ? state.seerHistory.slice(-24) : null,
  }
}

// 结算奖励：入参是纯数据而非整个 state，联机时两边用同一函数各算自己的奖励
export function computeRewards({
  myRole = '',
  winner = '',
  endedNormally = true,
  tally = {},
  survivedRounds = 0,
  aliveIds = [],
  revealed = {},
  isWatcher = false,
  myId = '',        // 本人 id（昔涟判断「自己是否活到最后」用）
  bondRole = '',    // 羁绊对象的角色（搭档那侧靠它认出「我绑的是昔涟」）
  bondId = '',      // 羁绊对象 id（空 = 无羁绊）
}) {
  const items = []
  // 观战不属于任何阵营，不享受任何金币奖励（设定表「观战」条）
  if (isWatcher) return { items, total: 0, pairEnding: false, won: false }
  const camp = ROLES[myRole]?.camp
  const isNeutral = camp === CAMP.NEUTRAL
  const aliveSet = new Set(aliveIds)

  // 双人结局：流萤与开拓者同时活到最后
  const fireflyAlive = Object.keys(revealed).some((id) => revealed[id] === ROLE.FIREFLY && aliveSet.has(id))
  const villagerAlive = Object.keys(revealed).some((id) => revealed[id] === ROLE.VILLAGER && aliveSet.has(id))
  const pairEnding = fireflyAlive && villagerAlive

  // 昔涟羁绊成立条件：两人都活到最后。昔涟本人看「对方还活着」，搭档看「对方是昔涟且还活着」。
  const bondAlive = !!bondId && aliveSet.has(bondId)
  const selfAlive = !myId || aliveSet.has(myId)
  const xilianBondOk =
    (myRole === ROLE.XILIAN || bondRole === ROLE.XILIAN) && bondAlive && selfAlive

  // 中立派的「自身胜利条件」是否满足 —— 决定它要不要吃「落败」那一份
  const neutralWon = !isNeutral
    ? false
    : myRole === ROLE.FIREFLY ? pairEnding
    : myRole === ROLE.KAFKA ? (tally.kafkaKills || 0) >= 2
    : myRole === ROLE.XILIAN ? xilianBondOk
    : false

  if (!endedNormally) {
    // 中途退出：任何阵营都只拿参与奖励
    items.push({ label: '中途退出 · 参与奖励', amount: REWARDS.QUIT_AFTER_3MIN })
  } else if (winner) {
    if (isNeutral) {
      // 结算铁律：中立派以自身条件为准。达成 → 不吃落败；未达成 → 按落败结算。
      if (!neutralWon) items.push({ label: '梦醒之后 · 落败', amount: REWARDS.LOSE })
    } else {
      const win = camp === winner
      items.push({ label: win ? '列车到站 · 获胜' : '梦醒之后 · 落败', amount: win ? REWARDS.WIN : REWARDS.LOSE })
    }
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
  // 卡芙卡的自身条件：处决满 2 人才发（中立派只按自身条件结算，不叠加阵营奖励）
  if (myRole === ROLE.KAFKA && tally.kafkaKills >= 2) {
    items.push({ label: `摄梦处决 ×${tally.kafkaKills}`, amount: REWARDS.KAFKA_EXECUTE })
  }
  if (survivedRounds > 0) {
    items.push({ label: `存活 ${survivedRounds} 个昼夜`, amount: survivedRounds * REWARDS.SURVIVE_ROUND })
  }

  // 口径只发给「拿流萤 / 开拓者这两张牌」的人，其余人不加 —— 原先按全局条件发给全场每人，是个 bug。
  if (pairEnding && (myRole === ROLE.FIREFLY || myRole === ROLE.VILLAGER)) {
    items.push({ label: '双人结局 · 萤火与开拓者同行到最后', amount: REWARDS.PAIR_BONUS })
  }

  // 昔涟羁绊：双方都活到最后 → 昔涟与搭档各拿一份（设定表「绑定者同享」）。
  // ★ 这条以前只写在 config 的 REWARDS 里、从来没被消费过 —— 昔涟达成条件也只是「不吃落败」，
  //   那 1500 一次都没发出去过（2026-10-05 修）。
  if (xilianBondOk) {
    items.push({ label: '羁绊同行 · 你与羁绊对象都活到最后', amount: REWARDS.XILIAN_BOND })
  }

  // won：这一局算不算「我赢了」—— 外面给好感度加分要用（曾经只能靠 total 反推，不可靠）。
  // 口径与上面的金币结算严格一致：中途退出不算赢；中立派只看自身条件达成没；
  // 其余阵营看自己的阵营是否就是胜方（2026-10-08 补）
  const won = endedNormally && !!winner && (isNeutral ? neutralWon : camp === winner)
  return { items, total: items.reduce((s, x) => s + x.amount, 0), pairEnding, won }
}

// 中途退出用：时长是否够 3 分钟
export function passGracePeriod(startedAt, now = Date.now()) {
  return startedAt > 0 && now - startedAt >= REWARDS.QUIT_GRACE_MS
}
