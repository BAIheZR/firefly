// 萤火夜话 · 对局编排（composable）：权威端（单人 = 本机 / 联机 = 房主）持有非响应式引擎 state
// 所有端只渲染 reactive 的 `view`，内容永远来自全量快照（天然幂等）；金币每个客户端只算自己那一份，结算只吃纯数据

import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMultiplayerStore } from '@/config/multiplayer'
import { useGoldStore } from '@/config/gold'
import { useInventoryStore } from '@/config/inventory'
import { useUserStore } from '@/config/user'
import { getWerewolfGreeting, getFireflyGreeting } from '@/config/greetings'
import {
  ROLE, ROLES, PHASE, PHASE_MS, TERMS, BASE_TOTAL, isWolfRole, buildRolePool,
  pickAiNames, pickSeatAvatars,
} from '@/config/werewolf'
import {
  createState, buildSoloPlayers, startNight, startDay, startDiscuss, startVote,
  startLastWords, startSpeaking, startRevote, advanceNightStep, nightStepsDone,
  startHunter, submitHunterShoot, skipHunter, aiHunterShoot, hunterPending,
  currentSpeaker, speakingDone,
  submitSpeak, skipSpeak, submitNightAction, resolveNight, submitVote, resolveVote,
  applyExile, evaluateWin,
  pendingNightAction, actorsPending, aiNightAction, aiVote, aiSpeak, aiLastWords,
  pushChat, pushFeed,
  getSnapshot, playerOf, computeRewards, passGracePeriod, finish,
} from '@/utils/werewolf'

// 玩家自己设定的头像（设置页写入的 avatarData），单人局拿它当"我"的座位头像
function readSelfAvatar() {
  try { return localStorage.getItem('avatarData') || '' } catch (e) { return '' }
}

export function useWerewolfMatch() {
  const route = useRoute()
  const router = useRouter()
  const mp = useMultiplayerStore()
  const goldStore = useGoldStore()
  const inventoryStore = useInventoryStore()
  const userStore = useUserStore()

  const isMp = computed(() => route.query.mp === '1')
  // ?watch=1 = 联机观战：跟着看这一桌的进程，但不参与（不能发言、投票、行动）
  const isWatcher = computed(() => isMp.value && route.query.watch === '1')
  // 权威端 = 单人本机，或联机时「这一桌的桌主」（不能用「房间房主」，房间可同时开多桌）
  const authority = computed(() => !isMp.value || mp.amTableOwner)
  const myId = computed(() => (isMp.value ? mp.selfId : 'me'))

  //  渲染视图（所有端共用） 
  const view = reactive({
    players: [], alive: [], round: 0, phase: '', deadline: 0,
    feed: [], chat: [], votes: {}, survived: {},
    winner: '', reveal: {},
    me: null, myTally: null, tallies: null,
    allRoles: null, nightLog: null,
    speaking: null, voteRound: 1, voteTieIds: [], lastNightDeaths: [],
    villagers: { left: 0, total: 0 }, huntReason: '',
    // 夜晚内部的分步 + 上一阶段（阶段条要显示「现在哪一步 / 上一步是谁」）
    nightStep: '', prevPhase: '', prevNightStep: '',
    // 反击：此刻在等谁开枪
    hunterId: '', hunterDone: false,
    // 赛后复盘：昨夜明细 + 瓦尔特历次验人结果。
    // ★ 对局进行中永远是 null，只有 phase === OVER 时引擎才会下发。
    judgeInfo: null, seerHistory: null,
  })

  // 权威端的引擎 state：刻意不放进 reactive（里面有全部人身份，也不该被 Vue 深度代理）
  let state = null
  let startedAt = 0
  let settled = false
  let offGame = null
  let fireflyFadeTimer = null

  const started = ref(false)
  const overlay = ref('')
  const fillWithAI = ref(true)
  const nowTs = ref(Date.now())
  const rewardResult = ref(null)
  const fireflyFade = ref(false)
  const pickedId = ref('')
  const bubbleText = ref(getWerewolfGreeting('hello'))

  //  快照 
  function applySnap(snap) {
    if (!snap) return
    view.players = snap.players || []
    view.alive = snap.alive || []
    view.round = snap.round || 0
    view.phase = snap.phase || ''
    view.deadline = snap.deadline || 0
    view.feed = snap.feed || []
    view.chat = snap.chat || []
    view.votes = snap.votes || {}
    view.survived = snap.survived || {}
    view.winner = snap.winner || ''
    view.reveal = snap.reveal || {}
    view.speaking = snap.speaking || null
    view.voteRound = snap.voteRound || 1
    view.voteTieIds = snap.voteTieIds || []
    view.lastNightDeaths = snap.lastNightDeaths || []
    view.villagers = snap.villagers || { left: 0, total: 0 }
    view.huntReason = snap.huntReason || ''
    view.nightStep = snap.nightStep || ''
    view.prevPhase = snap.prevPhase || ''
    view.prevNightStep = snap.prevNightStep || ''
    view.hunterId = snap.hunterId || ''
    view.hunterDone = !!snap.hunterDone
    if ('me' in snap) view.me = snap.me
    if (snap.myTally) view.myTally = snap.myTally
    if (snap.tallies) view.tallies = snap.tallies
    if ('allRoles' in snap) view.allRoles = snap.allRoles
    if ('nightLog' in snap) view.nightLog = snap.nightLog
    // 赛后复盘两项：对局中引擎一律填 null，只在结算那一帧才有内容。
    // 用 'in' 判断是为了让「复盘内容被清空」也能落到视图上
    if ('judgeInfo' in snap) view.judgeInfo = snap.judgeInfo
    if ('seerHistory' in snap) view.seerHistory = snap.seerHistory
    if (snap.startedAt) startedAt = snap.startedAt
    if (!started.value && view.phase && view.phase !== PHASE.IDLE) started.value = true
  }

  const pubSnap = () => getSnapshot(state, '')
  const refreshLocal = () => applySnap(getSnapshot(state, myId.value))

  //  联机下发 
  // 只发给「这一桌的人」（座位上 + 观战），群发会把身份相关的私有快照泄漏给别桌
  function tableAudience() {
    const t = mp.mySession
    if (!t) return []
    const ids = new Set()
    ;(t.seats || []).forEach((p) => p.id && ids.add(p.id))
    ;(t.watchers || []).forEach((p) => p.id && ids.add(p.id))
    ids.delete(mp.selfId)
    return [...ids]
  }

  function syncPrivateAll() {
    if (!isMp.value || !authority.value || !state) return
    tableAudience().forEach((id) => {
      mp.sendGame({ kind: 'ww:sync', snap: getSnapshot(state, id) }, id)
    })
  }

  // 协议里的「定向私有消息」：内容与 ww:sync 相同，但带上语义化 kind，
  // 既满足协议表，也让排障时一眼看出这条是给谁的什么信息
  function sendPrivate(toId, kind, extra = {}) {
    if (!isMp.value || !authority.value || !state || !toId) return
    mp.sendGame({ kind, ...extra, snap: getSnapshot(state, toId) }, toId)
  }

  // 一次状态提交：本地刷新 → 广播公开快照 → 定向补发私有快照
  function commit(kind = 'ww:sync', extra = {}, opts = {}) {
    refreshLocal()
    if (!authority.value || !isMp.value) return
    const ok = mp.sendGame({ kind, ...extra, snap: pubSnap() })
    if (ok === false) ElMessage.warning('与房间的连接已断开，本局无法继续同步')
    if (opts.private !== false) syncPrivateAll()
  }

  // 一次性把「谁该收到什么私有信息」发准（开局 / 夜间行动后 / 阶段切换时调用）
  function pushPrivateEvents() {
    if (!authority.value || !state) return
    Object.keys(state.roleMap).forEach((id) => {
      if (id === mp.selfId && isMp.value) return
      const role = state.roleMap[id]
      const info = getSnapshot(state, id).me
      if (!info) return
      if (isWolfRole(role)) sendPrivate(id, 'ww:role', { roleKey: role, mates: info.mates })
      else if (role === ROLE.SEER && info.seerResult) sendPrivate(id, 'ww:seer-result', info.seerResult)
      else if (role === ROLE.WITCH) sendPrivate(id, 'ww:witch-info', info.witchInfo || {})
      else if (role === ROLE.FIREFLY) sendPrivate(id, 'ww:firefly-info', info.fireflyInfo || {})
      else sendPrivate(id, 'ww:sync', {})
    })
  }

  // 夜间动作落地后，只把「发生了变化的那些私有信息」定向推出去
  function pushNightPrivate(actorId, action) {
    if (!isMp.value || !authority.value) return
    if (action === 'wolf-kill') {
      // 刀口一变，女巫那边的「今晚被骇入」就要跟着变
      const witchId = Object.keys(state.roleMap).find((id) => state.roleMap[id] === ROLE.WITCH)
      if (witchId) sendPrivate(witchId, 'ww:witch-info', getSnapshot(state, witchId).me?.witchInfo || {})
    }
    if (action === 'seer-check') {
      sendPrivate(actorId, 'ww:seer-result', getSnapshot(state, actorId).me?.seerResult || {})
    }
    if (action === 'firefly-light') {
      sendPrivate(actorId, 'ww:firefly-info', getSnapshot(state, actorId).me?.fireflyInfo || {})
    }
  }

  //  开场选项 
  // 座位容量：联机时看这一桌坐了几个人（一桌最多 6 个座位，判官帕姆不占座）
  const seatCapacity = computed(() =>
    isMp.value ? (mp.mySession?.seats?.length || 0) : BASE_TOTAL
  )

  const shortBy = computed(() => Math.max(0, BASE_TOTAL - seatCapacity.value))

  const canStart = computed(() => {
    if (!isMp.value) return true
    if (!authority.value) return false
    if (shortBy.value > 0) return fillWithAI.value
    // 这一桌坐满 6 人才能开（房间里可能有好几桌，不能拿整个房间的人数来判）
    return seatCapacity.value >= BASE_TOTAL
  })

  const startBtnText = computed(() => {
    if (!authority.value) return '等待房主开始'
    if (shortBy.value > 0 && !fillWithAI.value) return `还差 ${shortBy.value} 人`
    return '开始这局梦境'
  })

  // 开场「人数配置」那一行：直接摊开本局的牌面，别再手写一份会过期的文案
  // （改 SETUPS_AI 时这里会自动跟着变）
  const setupLine = computed(() => {
    const pool = buildRolePool(BASE_TOTAL)
    const count = {}
    pool.forEach((k) => { count[k] = (count[k] || 0) + 1 })
    const parts = Object.keys(count).map((k) => `${count[k]} ${ROLES[k]?.name || k}`)
    return `${BASE_TOTAL} 人 = ${parts.join(' + ')}`
  })

  //  开局 
  function startGame() {
    if (!canStart.value) return
    if (isMp.value) {
      // 参战名单 = 这一桌的座位。房间无上限后「房间里的所有人」已经不能拿来凑座位了
      // —— 房间里可能有好几桌，还有人在观战。
      const seats = mp.mySession?.seats || []
      const players = seats.map((p) => ({ id: p.id, name: p.name, isAI: false }))
      // 座位上限之外的人只能旁观
      players.splice(BASE_TOTAL)
      const need = BASE_TOTAL - players.length
      if (need > 0) {
        const names = pickAiNames(need, players.map((p) => p.name))
        const avatars = pickSeatAvatars(need)
        names.forEach((n, i) => players.push({ id: `ai${i + 1}`, name: n, isAI: true, avatar: avatars[i] || '' }))
      }
      state = createState({ mode: 'mp', players })
    } else {
      // 单人：判官由帕姆担任，剩下的座位由 AI 乘客补上
      const r = inventoryStore.spendActionPoint(10)
      if (!r.success) {
        ElMessage.warning(r.msg || '行动点不足')
        return
      }
      state = createState({
        mode: 'solo',
        players: buildSoloPlayers(BASE_TOTAL, userStore.currentUser, readSelfAvatar()),
      })
    }

    startedAt = state.startedAt
    settled = false
    rewardResult.value = null
    overlay.value = ''
    started.value = true
    pickedId.value = ''
    aiPlan.length = 0
    aiVotes.length = 0
    spokeRound.clear()
    nextAiChatAt = 0
    discussSpoke = false
    waitingMe.value = false

    startNight(state)
    refreshLocal()
    if (isMp.value) {
      mp.sendGame({
        kind: 'ww:start',
        players: state.players.map(({ id, name, seat, isAI, avatar }) => ({
          id, name, seat, isAI, avatar: isAI ? avatar || '' : '',
        })),
        round: 0,
        snap: pubSnap(),
      })
    }
    pushPrivateEvents()
    syncPrivateAll()
    startDriver()
    onRoleAssigned()
  }

  // 开局的情感层：玩家自己拿到流萤 / 场上有 AI 流萤
  function onRoleAssigned() {
    const role = state?.roleMap?.[myId.value]
    if (role === ROLE.FIREFLY) {
      bubbleText.value = getFireflyGreeting('opening')
      ElMessage.success('宝宝，这局你来当我的萤火。')
      return
    }
    const hasAiFirefly = Object.keys(state.roleMap).some(
      (id) => state.roleMap[id] === ROLE.FIREFLY && id !== myId.value
    )
    bubbleText.value = hasAiFirefly ? getFireflyGreeting('opening') : getWerewolfGreeting('start')
  }

  //  阶段驱动 
  const tickTimer = { id: null }
  // 用「下次行动时间戳」而不是 setTimeout：卸载时不需要逐个清理，天然不会泄漏
  const aiPlan = []
  const aiVotes = []
  const spokeRound = new Set()
  let nextAiChatAt = 0
  // 「防挂机」用：本阶段玩家是否已经做过一次推进动作。
  // 讨论阶段玩家说过一句话就算推进过（发言面板已删，所有话都从频道出去）。
  let discussSpoke = false
  // 视图据此显示「梦境暂停中，正在等你」——不提示的话玩家只会以为卡住了
  const waitingMe = ref(false)
  // 轮流发言/遗言：记录「当前这位是什么时候轮到他的」，
  // 用来给 AI 一点准备时间，也避免同一位被反复触发
  const speakCursor = { forId: '', at: 0 }
  const resetSpeakCursor = () => { speakCursor.forId = ''; speakCursor.at = 0 }

  function startDriver() {
    stopDriver()
    tickTimer.id = setInterval(tick, 500)
  }
  function stopDriver() {
    if (tickTimer.id) {
      clearInterval(tickTimer.id)
      tickTimer.id = null
    }
  }

  function tick() {
    nowTs.value = Date.now()
    if (!authority.value || !state || view.phase === PHASE.OVER) return
    runAiPlans()
    runAutoAdvance()
    // AI 判官该推的都推完之后如果还停着，那一定是「在等你」。
    // 把这个判断交给视图，界面才能明确写出「梦境暂停中」而不是让人干瞪着倒计时。
    waitingMe.value = humanBlocking()
  }

  // 把一个 AI 的夜间动作落到 state 上；「自动出手」与「玩家点跳过时补完 AI」两处必须一致
  function applyAiNightAction(id) {
    if (!state) return null
    const act = aiNightAction(state, id, myId.value)
    if (!act) return null
    if (act.action === 'witch') {
      if (act.save) submitNightAction(state, id, 'witch-save')
      if (act.poison) submitNightAction(state, id, 'witch-poison', act.poison)
      if (act.pass) submitNightAction(state, id, 'witch-pass')
      return act
    }
    if (act.targetId) {
      submitNightAction(state, id, act.action, act.targetId)
      return act
    }
    const passOf = {
      'wolf-kill': 'wolf-pass',
      'seer-check': 'seer-pass',
      'firefly-light': 'firefly-pass',
    }
    if (passOf[act.action]) submitNightAction(state, id, passOf[act.action])
    return act
  }

  // AI 行动：夜里依次出手、讨论时陆续发言、投票时陆续投票。
  // 不一次性算完，是为了让玩家看得清「谁做了什么」——这也是狼人杀的观赏性来源。
  function runAiPlans() {
    const now = Date.now()
    if (view.phase === PHASE.NIGHT) {
      state.alive.forEach((id) => {
        if (!playerOf(state, id)?.isAI) return
        if (!pendingNightAction(state, id)) return
        if (!aiPlan.some((x) => x.id === id)) aiPlan.push({ id, at: now + 800 + Math.random() * 2200 })
      })
      aiPlan.slice().forEach((entry) => {
        if (entry.at > now) return
        aiPlan.splice(aiPlan.indexOf(entry), 1)
        if (!pendingNightAction(state, entry.id)) return
        const act = applyAiNightAction(entry.id)
        if (!act) return
        pushNightPrivate(entry.id, act.action)
        commit('ww:sync', {}, { private: false })
      })
      return
    }

    if (view.phase === PHASE.LAST_WORDS || view.phase === PHASE.SPEAKING) {
      const cur = currentSpeaker(state)
      if (!cur) return   // 已经发完，交给 runAutoAdvance 推进
      const isAi = !!playerOf(state, cur)?.isAI
      if (speakCursor.forId !== cur) {
        speakCursor.forId = cur
        // AI 隔一会儿再开口，看起来像在思考；真人则一直等到他自己说或超时
        speakCursor.at = now + (isAi ? 1000 + Math.random() * 1800 : 0)
      }
      if (!isAi) return
      if (now < speakCursor.at) return
      const lastWords = state.speaking.mode === 'lastwords'
      const text = lastWords ? aiLastWords(state, cur) : aiSpeak(state, cur)
      const r = text ? submitSpeak(state, cur, text) : null
      // 文案为空或因为任何原因没成功，都直接过掉这一位，绝不让流程卡住
      if (!r || !r.ok) skipSpeak(state, cur)
      resetSpeakCursor()
      commit('ww:sync', { spokenBy: cur }, { private: false })
      return
    }

    if (view.phase === PHASE.DISCUSS) {
      if (!nextAiChatAt) nextAiChatAt = now + 1500 + Math.random() * 2000
      if (now < nextAiChatAt) return
      const cand = state.alive.filter((id) => playerOf(state, id)?.isAI && !spokeRound.has(id))
      if (!cand.length) {
        nextAiChatAt = now + 2600
        return
      }
      const id = cand[Math.floor(Math.random() * cand.length)]
      spokeRound.add(id)
      const text = aiSpeak(state, id)
      if (!text) {
        nextAiChatAt = now + 1500
        return
      }
      pushChat(state, { fromId: id, text, channel: 'day' })
      commit('ww:chat', { fromId: id, text, channel: 'day' }, { private: false })
      return
    }

    if (view.phase === PHASE.VOTE) {
      state.alive.forEach((id) => {
        if (!playerOf(state, id)?.isAI) return
        if (state.votes[id] !== undefined) return
        if (!aiVotes.some((x) => x.id === id)) aiVotes.push({ id, at: now + 900 + Math.random() * 3000 })
      })
      aiVotes.slice().forEach((entry) => {
        if (entry.at > now) return
        aiVotes.splice(aiVotes.indexOf(entry), 1)
        if (state.votes[entry.id] !== undefined) return
        submitVote(state, entry.id, aiVote(state, entry.id))
        commit('ww:sync', {}, { private: false })
      })
    }
  }

  //  防挂机门槛（单人专属）
  // 单人模式下玩家没做推进动作就停在当前阶段（期望行为，防挂机刷钱），判定只看玩家当前有没有欠着的推进义务；联机一律不拦
  function humanBlocking() {
    if (isMp.value || !state) return false
    const me = myId.value
    // 反击要单独放前面：丹恒被放逐的那一刻自己已经不在 alive 里了
    if (state.phase === PHASE.HUNTER) return hunterPending(state, me)
    // 遗言 / 轮流发言要放在 alive 判断之前：开口的人本来就已经离场了
    if (state.phase === PHASE.LAST_WORDS || state.phase === PHASE.SPEAKING) {
      return currentSpeaker(state) === me
    }
    // 已经离场的人没有「该做的事」，不拦
    if (!state.alive.includes(me)) return false
    switch (state.phase) {
      case PHASE.NIGHT:
        // 夜晚分步：轮到你的那一步还没出手 → 停住
        return !!pendingNightAction(state, me)
      case PHASE.DISCUSS:
        // 自由发言：你还没出过声 → 停住（在频道里说一句，或点「跳过」）
        return !discussSpoke
      case PHASE.VOTE:
        // 投票：你还没投 → 停住（投一票，或点「弃票」）
        return state.votes[me] === undefined
      default:
        return false
    }
  }

  // 帕姆自动主持并按限时推进阶段
  function runAutoAdvance() {
    const now = Date.now()
    // 「玩家还没做事」时，到点也不许往前走 —— 这就是防挂机的全部实现
    const blocked = humanBlocking()

    if (view.phase === PHASE.NIGHT) {
      // 分步：这一步该动的都动完了 → 进下一步（或走到 done 收夜）
      if (actorsPending(state).length === 0) {
        advancePhase()
        return
      }
      if (now >= state.deadline && !blocked) advancePhase()
      return
    }

    if (view.phase === PHASE.DAY) {
      // 天亮只是过场，不需要玩家做任何事
      if (now >= state.deadline) advancePhase()
      return
    }

    if (view.phase === PHASE.LAST_WORDS || view.phase === PHASE.SPEAKING) {
      // 发完了 → 直接进下一阶段；否则等当前这位说完或超时
      if (speakingDone(state)) {
        advancePhase()
        return
      }
      if (now >= state.deadline && !blocked) {
        const cur = currentSpeaker(state)
        if (cur) skipSpeak(state, cur)   // 超时：这一位过掉
        resetSpeakCursor()
        if (speakingDone(state)) advancePhase()
        else commit('ww:sync', {}, { private: false })
      }
      return
    }

    if (view.phase === PHASE.DISCUSS) {
      if (now >= state.deadline && !blocked) advancePhase()
      return
    }

    if (view.phase === PHASE.VOTE) {
      const allVoted = state.alive.every((id) => state.votes[id] !== undefined)
      if (allVoted) {
        advancePhase()
        return
      }
      if (now >= state.deadline && !blocked) advancePhase()
      return
    }

    if (view.phase === PHASE.HUNTER) {
      // 已经开过枪 / 明确放弃 → 收阶段
      if (!hunterPending(state, state.hunterId)) {
        advancePhase()
        return
      }
      if (now >= state.deadline && !blocked) {
        skipHunter(state, state.hunterId)
        advancePhase()
      }
    }
  }

  function broadcastPhase(kind = 'ww:phase', extra = {}) {
    refreshLocal()
    if (!isMp.value || !authority.value) return
    mp.sendGame({ kind, ...extra, snap: pubSnap() })
    syncPrivateAll()
  }

  function advancePhase() {
    if (!state) return
    // 先记下「上一个阶段是谁」——阶段条要同时显示现在和上一步（用户要求）。
    // 夜里分步时 prevPhase 仍是 night，具体哪一步看 prevNightStep。
    state.prevPhase = state.phase
    state.prevNightStep = state.phase === PHASE.NIGHT ? state.nightStep : ''

    switch (state.phase) {
      case PHASE.NIGHT: {
        // ★ 分步：还没走到最后一步就只是「进下一步」，不结算。
        //   顺序是 银狼 → 瓦尔特 → 姬子 → 流萤（config.NIGHT_STEPS）。
        if (!nightStepsDone(state)) {
          const next = advanceNightStep(state)
          aiPlan.length = 0
          // 不带 phase 字段 → 客户端不会重复弹「天黑了」，只静默更新快照
          broadcastPhase('ww:phase', { nightStep: next })
          return
        }
        const res = resolveNight(state)
        const deadNames = res.deaths.map((id) => playerOf(state, id)?.name).filter(Boolean)
        startDay(state, res)
        // startDay 只负责结算，过场时长由这里给
        state.deadline = Date.now() + PHASE_MS[PHASE.DAY]
        broadcastPhase('ww:night-result', { dead: res.deaths, saved: res.saved, deadNames })
        pushPrivateEvents()
        afterNightResolved(res)
        // ★ 夜里也可能直接把胜利条件打满（最典型的就是「开拓者全被抓走」），
        //   所以这里必须也判一次胜负 —— 不能只在投票结算后判，否则天亮了还接着走流程。
        const wNight = evaluateWin(state)
        if (wNight) { endGame(wNight); break }
        break
      }
      case PHASE.DAY: {
        // 天亮之后先让昨夜离场的人留遗言（谁被杀了谁先发言），
        // 没人离场就直接跳到轮流发言
        const dead = startLastWords(state)
        if (!dead.length) startSpeaking(state)
        resetSpeakCursor()
        spokeRound.clear()
        nextAiChatAt = 0
        broadcastPhase('ww:phase')
        break
      }
      case PHASE.LAST_WORDS: {
        startSpeaking(state)
        resetSpeakCursor()
        broadcastPhase('ww:phase')
        break
      }
      case PHASE.SPEAKING: {
        startDiscuss(state)
        spokeRound.clear()
        nextAiChatAt = 0
        // 进入讨论：玩家还没出过声，所以「防挂机」门槛此刻是关着的
        discussSpoke = false
        broadcastPhase('ww:phase')
        break
      }
      case PHASE.DISCUSS: {
        startVote(state)
        aiVotes.length = 0
        broadcastPhase('ww:vote-start')
        break
      }
      case PHASE.VOTE: {
        const r = resolveVote(state)
        // 平票 → 全场加时重投一轮（不限候选人，可弃票），留在投票阶段
        if (r.revote) {
          startRevote(state)
          aiVotes.length = 0
          broadcastPhase('ww:vote-result', {
            tie: true, revote: true, outId: null,
            outIds: r.outIds, round: r.round,
            outNames: r.outIds.map((id) => playerOf(state, id)?.name).filter(Boolean),
          })
          break
        }
        const outName = r.outId ? playerOf(state, r.outId)?.name : ''
        broadcastPhase('ww:vote-result', {
          votes: r.votes, outId: r.outId, tie: r.tie, outName, round: r.round,
        })
        if (r.outId) {
          const wasHunter = state.roleMap[r.outId] === ROLE.HUNTER
          applyExile(state, r.outId)
          // 丹恒被放逐 → 先让他把「反击」打出去，胜负等这一枪之后再判
          if (wasHunter) {
            startHunter(state, r.outId)
            aiPlan.length = 0
            aiVotes.length = 0
            broadcastPhase('ww:phase', { phase: PHASE.HUNTER, hunterId: r.outId })
            return
          }
        }
        const w = evaluateWin(state)
        if (w) return endGame(w)
        startNight(state)
        aiPlan.length = 0
        aiVotes.length = 0
        resetSpeakCursor()
        broadcastPhase('ww:phase', { phase: PHASE.NIGHT })
        break
      }
      //  反击：丹恒被放逐后指定一名乘客同去 
      // 这一枪可能把胜负条件打满，出去之前必须再判一次
      case PHASE.HUNTER: {
        const w = evaluateWin(state)
        if (w) return endGame(w)
        startNight(state)
        aiPlan.length = 0
        aiVotes.length = 0
        resetSpeakCursor()
        broadcastPhase('ww:phase', { phase: PHASE.NIGHT })
        break
      }
      default:
        break
    }
  }

  // 夜里有人离场时：流萤若在其中，就播一次全屏萤火消散
  function afterNightResolved(res) {
    const fireflyId = Object.keys(state.roleMap).find((id) => state.roleMap[id] === ROLE.FIREFLY)
    if (res.deaths.includes(fireflyId)) {
      fireflyFade.value = true
      if (fireflyFadeTimer) clearTimeout(fireflyFadeTimer)
      fireflyFadeTimer = setTimeout(() => { fireflyFade.value = false }, 1700)
      pushFeed(state, '一束萤火暗了下去……她离开了梦境。', 'gold')
      refreshLocal()
    }
    if (res.deaths.includes(myId.value)) {
      bubbleText.value = getFireflyGreeting('selfKilled')
      ElMessage.warning(bubbleText.value)
    }
  }

  function endGame(winner) {
    finish(state, winner)
    broadcastPhase('ww:game-over', { winner, reveal: { ...state.reveal } })
    stopDriver()
  }

  //  动作入口 
  // 旁观者一律拦下，所有入口都先过这一道，免得漏掉某个按钮让旁观者搅乱对局
  function blockedByWatch() {
    if (!isWatcher.value) return false
    ElMessage.info('你在观战，不能参与这一局')
    return true
  }

  // 单人 / 桌主：本地直接跑引擎；普通成员：把意图发给桌主，由桌主跑完再广播回来
  function onAct({ action, targetId }) {
    if (blockedByWatch()) return
    if (!authority.value || !state) {
      if (action) {
        const ok = mp.sendGame({ kind: 'ww:action', action, targetId })
        if (ok === false) ElMessage.warning('与房间的连接已断开')
      }
      return
    }
    applyAction(myId.value, action, targetId, true)
  }

  function applyAction(actorId, action, targetId, local = false) {
    if (!state) return false
    const isVote = action === 'vote'
    const isHunterAct = action === 'hunter-shoot' || action === 'hunter-pass'
    let r
    if (isVote) r = submitVote(state, actorId, targetId)
    else if (action === 'hunter-shoot') r = submitHunterShoot(state, actorId, targetId)
    else if (action === 'hunter-pass') r = skipHunter(state, actorId)
    else r = submitNightAction(state, actorId, action, targetId)

    if (!r.ok) {
      if (local) ElMessage.warning(r.msg)
      else sendPrivate(actorId, 'ww:sync', {})
      return false
    }
    if (local && !r.duplicate) {
      if (isVote) ElMessage.success(targetId ? '已投出这一票' : '已弃票')
      else if (action === 'hunter-shoot') ElMessage.success('龙焰已出')
      else if (action === 'hunter-pass') ElMessage.success('你放下了这一枪')
      else if (action === 'wolf-pass') ElMessage.success('本夜不动手')
      else if (action === 'seer-pass') ElMessage.success('本夜不感应')
      else if (action === 'witch-pass') ElMessage.success('本夜不动用咖啡')
      else if (action === 'firefly-pass') ElMessage.success('本夜不照亮')
      else ElMessage.success('已提交')
    }
    // 夜间私有信息才需要定向补发；投票与反击全场可见，走公开快照就够了
    if (!isVote && !isHunterAct) pushNightPrivate(actorId, action)
    commit('ww:sync', {})
    return true
  }

  function onSeatPick(id) {
    if (blockedByWatch()) return
    if (view.phase === PHASE.VOTE) {
      onAct({ action: 'vote', targetId: id })
      return
    }
    // 反击：丹恒此刻已经离场，view.me.pending 是空的，所以单独判一段
    if (view.phase === PHASE.HUNTER && view.me?.hunterPending) {
      pickedId.value = id
      onAct({ action: 'hunter-shoot', targetId: id })
      return
    }
    // 夜晚：点座位 = 选中行动目标并立刻提交（狼人杀不需要二次确认）
    const pending = view.me?.pending
    if (pending && pending !== 'witch') {
      pickedId.value = id
      onAct({ action: pending, targetId: id })
    }
  }

  //  频道里说话 
  // 所有话都从频道出去（卡片里的发言面板已删），轮到自己的「轮流发言 / 遗言」也走这条路径
  function onSendChat(text, channel = 'day') {
    if (blockedByWatch()) return
    const myRole = view.me?.roleKey || ''
    const ch = channel === 'wolf' && !isWolfRole(myRole) ? 'day' : channel

    const speakingNow = view.phase === PHASE.LAST_WORDS || view.phase === PHASE.SPEAKING
    if (speakingNow && view.speaking?.current === myId.value) {
      onSpeak(text)
      return
    }

    if (!authority.value || !state) {
      mp.sendGame({ kind: 'ww:chat', text, channel: ch })
      return
    }
    // 单人 + 讨论阶段：说过一句就算「推进过了」，AI 判官才会收尾（防挂机门槛）
    if (state.phase === PHASE.DISCUSS) discussSpoke = true
    pushChat(state, { fromId: myId.value, name: userStore.currentUser, text, channel: ch })
    commit('ww:chat', { fromId: myId.value, text, channel: ch }, { private: false })
  }

  //  轮流发言 / 遗言：玩家自己的那一次
  // 轮到你时用这个提交；提交后自动轮到下一位（由引擎的 submitSpeak 推进）
  function onSpeak(text) {
    const clean = String(text || '').trim()
    if (!clean) return
    if (!authority.value) {
      // 非房主：把自己的发言交给房主去落库
      mp.sendGame({ kind: 'ww:speak', text: clean })
      return
    }
    if (!state) return
    const cur = currentSpeaker(state)
    if (!cur || cur !== myId.value) return
    const r = submitSpeak(state, cur, clean)
    if (!r.ok) {
      ElMessage.warning(r.msg || '发言失败')
      return
    }
    resetSpeakCursor()
    commit('ww:sync', {}, { private: false })
  }

  // 「我说完了 / 跳过」——玩家在自己那一轮可以选择不说
  function doSkipSpeak() {
    if (blockedByWatch()) return
    if (!authority.value) {
      mp.sendGame({ kind: 'ww:skip-speak' })
      return
    }
    if (!state) return
    const cur = currentSpeaker(state)
    // 轮不到自己就不给跳过（联机时每个人都只能跳自己的那一次）
    if (!cur || cur !== myId.value) return
    skipSpeak(state, cur)
    resetSpeakCursor()
    if (speakingDone(state)) advancePhase()
    else commit('ww:sync', {}, { private: false })
  }

  //  单人模式的「跳过」：直接把当前阶段推过去 
  // 它同时是防挂机的官方出口；夜晚上只补完「当前这一步」还没行动的 AI（不是整夜）
  function skipPhase() {
    if (blockedByWatch()) return
    if (!state || !authority.value) return
    if (state.phase === PHASE.OVER || state.phase === PHASE.IDLE) return
    if (state.phase === PHASE.NIGHT) {
      // 玩家自己欠着的那一步：点「跳过」= 明确不使用技能，要落标记否则会一直被认为是欠着的
      const mine = pendingNightAction(state, myId.value)
      const myPass = {
        'wolf-kill': 'wolf-pass',
        'seer-check': 'seer-pass',
        witch: 'witch-pass',
        'firefly-light': 'firefly-pass',
      }[mine]
      if (myPass) submitNightAction(state, myId.value, myPass)

      state.alive.forEach((id) => {
        if (!playerOf(state, id)?.isAI) return
        let guard = 0
        while (pendingNightAction(state, id) && guard++ < 8) {
          if (!applyAiNightAction(id)) break
        }
      })
      aiPlan.length = 0
    }
    if (state.phase === PHASE.LAST_WORDS || state.phase === PHASE.SPEAKING) {
      const cur = currentSpeaker(state)
      if (cur) skipSpeak(state, cur)
      resetSpeakCursor()
    }
    // 反击：AI 丹恒自动开一枪；轮到真人丹恒时「跳过」= 放弃这一枪
    if (state.phase === PHASE.HUNTER) {
      const hid = state.hunterId
      if (hid && hunterPending(state, hid)) {
        if (playerOf(state, hid)?.isAI) {
          const t = aiHunterShoot(state, hid)
          if (t) submitHunterShoot(state, hid, t)
          else skipHunter(state, hid)
        } else {
          skipHunter(state, hid)
        }
      }
    }
    // 讨论阶段点「跳过」也算表态，否则下一 tick 又会被防挂机门槛拦住
    discussSpoke = true
    aiVotes.length = 0
    advancePhase()
    refreshLocal()
  }

  //  联机消息路由 
  function onGame(data, fromId) {
    if (!data || !data.kind) return
    // 所有带 snap 的消息统一先应用快照（幂等，重复到达也无副作用）
    if (data.snap) applySnap(data.snap)

    switch (data.kind) {
      case 'ww:start':
        started.value = true
        ElMessage.info(`房主开始了「${TERMS.gameName}」`)
        break
      case 'ww:phase':
        if (data.phase === PHASE.NIGHT) ElMessage.info(`${TERMS.night}开始了，天黑了`)
        else if (data.phase === PHASE.HUNTER) ElMessage.warning('丹恒被放逐，正在发动反击……')
        break
      case 'ww:night-result':
        if (data.dead?.length) ElMessage.warning(`昨夜离场：${(data.deadNames || data.dead).join('、')}`)
        else ElMessage.success(`${TERMS.day}了，昨夜是${TERMS.peaceNight}`)
        break
      case 'ww:vote-result':
        if (data.tie) ElMessage.warning('平票，本轮流局')
        else if (data.outId) ElMessage.warning(`${data.outName || data.outId} 被${TERMS.exile}`)
        else ElMessage.info('全员弃票，无人被放逐')
        break
      case 'ww:announce':
        if (data.text) ElMessage.info(data.text)
        break
      case 'ww:firefly-info':
        if (data.litId && fromId === mp.selfId) ElMessage.success('你感到一束萤火围绕着你。')
        break
      case 'ww:seer-result':
        if (fromId === mp.selfId && data.targetId) {
          const p = view.players.find((x) => x.id === data.targetId)
          const who = p ? `${p.seat} 号 ${p.name}` : data.targetId
          ElMessage.success(`感应结果：${who} 是 ${data.team === 'hunt' ? TERMS.teamHunt : TERMS.teamTrain}`)
        }
        break
      //  房主侧：接收玩家意图 
      case 'ww:action':
        if (authority.value && fromId) applyAction(fromId, data.action, data.targetId)
        break
      case 'ww:chat':
        if (authority.value && fromId && fromId !== mp.selfId) {
          // 频道权限校验：不是银狼不许往暗网频道发
          const ch = data.channel === 'wolf' && !isWolfRole(state?.roleMap?.[fromId]) ? 'day' : data.channel
          const name = mp.members.find((m) => m.id === fromId)?.name
          pushChat(state, { fromId, name, text: data.text, channel: ch })
          commit('ww:chat', { fromId, text: data.text, channel: ch }, { private: false })
        }
        break
      //  轮流发言 / 遗言：非房主把自己的那一次交给房主落库
      case 'ww:speak':
        if (authority.value && fromId && currentSpeaker(state) === fromId) {
          submitSpeak(state, fromId, data.text)
          resetSpeakCursor()
          commit('ww:sync', {}, { private: false })
        }
        break
      case 'ww:skip-speak':
        if (authority.value && fromId && currentSpeaker(state) === fromId) {
          skipSpeak(state, fromId)
          resetSpeakCursor()
          if (speakingDone(state)) advancePhase()
          else commit('ww:sync', {}, { private: false })
        }
        break
      case 'mp:sync-request':
        // 中途进房 / 重连：只把「这一个观众」的视角补给他
        if (authority.value && state && fromId) sendPrivate(fromId, 'ww:sync', {})
        break
      case 'mp:room-closed':
        ElMessage.warning('房主已关闭房间')
        settleQuit()
        router.push('/multiplayer')
        break
      default:
        break
    }
  }

  //  结算 
  function settle({ endedNormally }) {
    if (settled) return
    settled = true
    const r = computeRewards({
      myRole: view.me?.roleKey || '',
      winner: view.winner,
      endedNormally: endedNormally && !!view.winner,
      tally: view.tallies?.[myId.value] || view.myTally || {},
      survivedRounds: view.survived[myId.value] || 0,
      aliveIds: view.alive,
      revealed: view.reveal,
    })
    r.items.forEach((it) => goldStore.addGold(it.amount, 'werewolf'))
    rewardResult.value = r
    // 双人结局：流萤与开拓者同行到最后
    if (r.pairEnding && (view.me?.roleKey === ROLE.FIREFLY || view.me?.roleKey === ROLE.VILLAGER)) {
      bubbleText.value = getFireflyGreeting('pairEnding')
    }
  }

  // 中途退出：满 3 分钟才给参与奖励（单人、联机同一口径）
  function settleQuit() {
    if (settled) return
    if (!startedAt || !passGracePeriod(startedAt)) {
      settled = true
      return
    }
    settle({ endedNormally: false })
  }

  // 阶段变成 over → 结算并弹窗。用 watcher 而不是在消息处理里直接结算，
  // 是为了避开「公开快照先到、定向私有快照后到」导致少算奖励的时序问题
  watch(
    () => view.phase,
    (p) => {
      if (p === PHASE.OVER) {
        settle({ endedNormally: true })
        overlay.value = 'over'
      }
    }
  )

  //  生命周期 
  onMounted(() => {
    goldStore.loadData()
    inventoryStore.loadData()
    userStore.loadData()

    if (!isMp.value) {
      bubbleText.value = getWerewolfGreeting('hello')
      return
    }
    if (!mp.connected) {
      ElMessage.warning('尚未连接到房间，请先回到大厅创建或加入房间')
      router.replace('/multiplayer')
      return
    }
    // 直接刷新对局页时 store 里的桌号会丢（地址栏的 ?sid= 还在）—— 先补回来，
    // 否则 sendGame 不带 sid，本桌的快照会广播到整个房间（别的桌 / 大厅的人都会收到身份相关快照）
    mp.restoreSession(route.query.sid || '', route.query.watch === '1')
    offGame = mp.onGame(onGame)
    // 非权威端：向本桌桌主要一份当前局面快照（中途进房 / 观战 / 刷新都能续上）
    if (!authority.value) {
      const t = mp.mySession
      const ownerId = t?.ownerId || mp.hostId || null
      if (ownerId) mp.sendGame({ kind: 'mp:sync-request' }, ownerId)
    }
  })

  onBeforeUnmount(() => {
    stopDriver()
    if (fireflyFadeTimer) clearTimeout(fireflyFadeTimer)
    if (offGame) { offGame(); offGame = null }
    // 没打完就离开 → 按「满 3 分钟给 100」结算；已结算过则什么都不做
    settleQuit()
    // 离开对局页 = 离开这一桌：座位让出来（桌主走了整桌解散），观战也结束。
    // ★ 必须清，否则回到大厅后桌号还残留着，点别的游戏会被「先退出才能开别的桌」拦住。
    if (isMp.value) mp.leaveSession()
  })

  // 返回：联机回大厅，单人回主页；对局未结束先确认（会按中途退出结算）
  async function onBack() {
    if (started.value && view.phase !== PHASE.OVER && !settled) {
      const ok = await ElMessageBox.confirm(
        '对局还没结束，现在离开会按「中途退出」结算（参与满 3 分钟才有 100 金币）。确定要走吗？',
        '离开对局',
        { confirmButtonText: '确定离开', cancelButtonText: '再玩一会', type: 'warning' }
      ).then(() => true).catch(() => false)
      if (!ok) return
      settleQuit()
    }
    stopDriver()
    if (isMp.value) router.push('/multiplayer')
    else router.push('/')
  }

  // 再来一局：把本地视图清空，回到开场面板
  function backToStart() {
    stopDriver()
    overlay.value = ''
    started.value = false
    state = null
    settled = false
    rewardResult.value = null
    startedAt = 0
    view.players = []
    view.alive = []
    view.phase = ''
    view.deadline = 0
    view.feed = []
    view.chat = []
    view.votes = {}
    view.survived = {}
    view.reveal = {}
    view.me = null
    view.myTally = null
    view.tallies = null
    view.allRoles = null
    view.nightLog = null
    view.judgeInfo = null
    view.seerHistory = null
    view.nightStep = ''
    view.prevPhase = ''
    view.prevNightStep = ''
    view.hunterId = ''
    view.hunterDone = false
    view.winner = ''
    discussSpoke = false
    waitingMe.value = false
    bubbleText.value = getWerewolfGreeting('hello')
  }

  return {
    // 状态
    view, started, overlay, fillWithAI, rewardResult, fireflyFade,
    pickedId, nowTs, bubbleText,
    // 派生
    isMp, authority, myId, isWatcher,
    seatCapacity, shortBy, canStart, startBtnText, setupLine,
    // 「单人在等你」——视图据此显示「梦境暂停中」
    waitingMe,
    // 行为
    startGame, onAct, onSeatPick, onSendChat,
    onBack, backToStart, settleQuit,
    // 轮流发言 / 遗言 / 单人跳过阶段
    onSpeak, doSkipSpeak, skipPhase,
  }
}
