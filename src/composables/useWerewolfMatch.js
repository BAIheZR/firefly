// 萤火夜话 · 对局编排（composable）：权威端（单人 = 本机 / 联机 = 房主）持有非响应式引擎 state
// 所有端只渲染 reactive 的 `view`，内容永远来自全量快照（天然幂等）；金币每个客户端只算自己那一份，结算只吃纯数据

import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { useMultiplayerStore } from '@/config/multiplayer'
import { useGoldStore } from '@/config/gold'
import { useInventoryStore, changeAffection } from '@/config/inventory'
import { takeDailyQuota, DAILY_CAPS } from '@/utils/affectionDaily'
import { useUserStore } from '@/config/user'
import { getWerewolfGreeting, getFireflyGreeting } from '@/config/greetings'
import {
  ROLE, ROLES, PHASE, PHASE_MS, TERMS, BASE_TOTAL, MAX_TOTAL, SUPPORTED_SIZES, isWolfRole, buildRolePool,
  pickAiNames, pickSeatAvatars,
} from '@/config/werewolf'
import {
  createState, buildSoloPlayers, startPrep, startNight, startDay, startDiscuss, startVote,
  startLastWords, startSpeaking, startRevote, advanceNightStep, nightStepsDone,
  startHunter, submitHunterShoot, skipHunter, aiHunterShoot, hunterPending,
  currentSpeaker, speakingDone,
  confirmIdentity, prepAllConfirmed,
  submitSpeak, skipSpeak, submitNightAction, resolveNight, submitVote, resolveVote,
  applyExile, evaluateWin,
  submitWolfBlast, canWolfBlast, aiWolfBlast, setBond, convertToAI, restoreHuman,
  pendingNightAction, actorsPending, aiNightAction, aiVote, aiSpeak, aiSpeakPlan, aiLastWords,
  recordClaim,
  pushChat, pushFeed,
  getSnapshot, playerOf, computeRewards, passGracePeriod, finish, aliveWolves,
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
    me: null, myTally: null, tallies: null, wolfTally: null,
    allRoles: null, nightLog: null,
    speaking: null, voteRound: 1, voteTieIds: [], lastNightDeaths: [],
    villagers: { left: 0, total: 0 }, huntReason: '',
    // 夜晚内部的分步 + 上一阶段（阶段条要显示「现在哪一步 / 上一步是谁」）
    nightStep: '', prevPhase: '', prevNightStep: '',
    // 反击：此刻在等谁开枪
    hunterId: '', hunterDone: false,
    // 准备期「确认身份」的进度 { total, done, pendingSeats }，非准备期为 null
    prepConfirm: null,
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
  // 单人局的人数（设定表「选择对局人数」）。默认 BASE_TOTAL，界面可改
  const soloSize = ref(BASE_TOTAL)
  // 联机局的目标人数：桌主定的「这局开几人」。null = 跟着这一桌实际坐了几个人走
  const mpSize = ref(null)
  // 能不能改本局人数：单人局谁都能选（界面写的就是最终牌面，没有桌主也没有已经坐好的座位）；
  // 联机局只有桌主（且还没开局）能改 —— 中途改会让已经坐好的座位对不上牌面。
  // 注意：别写成 isMp && ... —— 那样单人局会恒 false，「选择对局人数」整排按钮被 disable 点不动（2026-10-02 踩过）。
  const canSetSize = computed(() => (!isMp.value || (authority.value && !started.value)))
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
    // 用 'in' 判断：进夜后引擎会把它置成 null，得让「清空」也能落到视图上
    if ('prepConfirm' in snap) view.prepConfirm = snap.prepConfirm
    if ('me' in snap) view.me = snap.me
    if (snap.myTally) view.myTally = snap.myTally
    if (snap.tallies) view.tallies = snap.tallies
    if ('wolfTally' in snap) view.wolfTally = snap.wolfTally
    if ('allRoles' in snap) view.allRoles = snap.allRoles
    if ('nightLog' in snap) view.nightLog = snap.nightLog
    // 赛后复盘两项：对局中引擎一律填 null，只在结算那一帧才有内容。
    // 用 'in' 判断是为了让「复盘内容被清空」也能落到视图上
    if ('judgeInfo' in snap) view.judgeInfo = snap.judgeInfo
    if ('seerHistory' in snap) view.seerHistory = snap.seerHistory
    if (snap.startedAt) startedAt = snap.startedAt
    if (!started.value && view.phase && view.phase !== PHASE.IDLE) started.value = true
    // 收到快照 = 对局还在推进 → 驱动必须活着，顺手把可能停掉的 tick 拉回来
    ensureDriver()
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
      // ★ 这一刀下完之后，把「当前票况」私发给下一只还没出手的狼。
      // 公开快照 pubSnap 是 getSnapshot(state, '') —— viewerId 为空，wolfTally 一律 null，
      // 所以联机下狼看不到同伴投了谁，只能到最后才知道刀口。定向发一份才看得到。
      // 单人本地 refreshLocal 走的是 getSnapshot(state, myId)，那条线本来就有。
      pushWolfTally()
    }
    if (action === 'seer-check') {
      sendPrivate(actorId, 'ww:seer-result', getSnapshot(state, actorId).me?.seerResult || {})
    }
    if (action === 'firefly-light') {
      sendPrivate(actorId, 'ww:firefly-info', getSnapshot(state, actorId).me?.fireflyInfo || {})
    }
  }

  //  开场选项 
  // 座位容量：联机时看这一桌坐了几个人（一桌最多 MAX_TOTAL 个座位，判官帕姆不占座）；
  // 单人局固定铺 BASE_TOTAL 个空位由界面选人数
  const seatCapacity = computed(() =>
    isMp.value ? (mp.mySession?.seats?.length || 0) : BASE_TOTAL
  )

  // 本局该开多少人：单人跟界面选的走；联机 = 桌主定的目标人数 与 这一桌实际坐了几个人，取大的那个
  // （一桌最多开到 MAX_TOTAL —— 否则 12 个座位坐满了也会被截回 6 人，新角色永远上不了场）
  const totalPlayers = computed(() => {
    const wanted = isMp.value
      ? Math.max(mpSize.value || 0, mp.mySession?.seats?.length || 0)
      : (soloSize.value || BASE_TOTAL)
    return Math.min(MAX_TOTAL, Math.max(BASE_TOTAL, wanted))
  })

  function setMpSize(n) {
    if (!canSetSize.value) return
    mpSize.value = SUPPORTED_SIZES.includes(Number(n)) ? Number(n) : null
  }

  const shortBy = computed(() => Math.max(0, totalPlayers.value - seatCapacity.value))

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
    // 单人局跟界面选的人数走；联机局按这一桌实际坐了几个人走
    const n = totalPlayers.value
    const pool = buildRolePool(n)
    const count = {}
    pool.forEach((k) => { count[k] = (count[k] || 0) + 1 })
    const parts = Object.keys(count).map((k) => `${count[k]} ${ROLES[k]?.name || k}`)
    return `${n} 人 = ${parts.join(' + ')}`
  })

  // 准备期里「我是昔涟」→ 点座位即指定羁绊对象（可改，不必等到没绑定才给入口）
  // ★ 这里曾经多写一个 `&& !view.me?.bondInfo?.partnerId`：那时的开局是「一上来就随机绑好」，
  //   bondInfo 一直非空，条件一加入口恒为 false，点了半天没反应 —— 入口成了死代码（2026-10-02 反馈）。
  //   现在开局不再抢先绑，准备期 bondInfo 本来就是空的，这条更不能加。
  // ★ 别再加 `!!state`：联机非桌主的本地 state 是 null（权威在桌主那边），
  //   一加就恒 false —— 非桌主的昔涟连入口都看不到，更谈不上改羁绊（2026-10-02 反馈）。
  const bondPickMode = computed(
    () => view.phase === PHASE.PREP && view.me?.roleKey === ROLE.XILIAN
  )
  // 我当前缔结的羁绊对象：PREP 期要看得见「跟谁」，否则玩家只知道有绑定、不知道绑了谁
  const bondPartner = computed(() => {
    const pid = view.me?.bondInfo?.partnerId
    if (!pid) return null
    // ★ 必须查 view.players，不能查 playerOf(state, ...)：联机非桌主的 state 是 null，
    //   那边一进准备期就会 TypeError，整块面板直接渲染不出来（2026-10-02 踩过）。
    const p = view.players.find((x) => x.id === pid)
    return p
      ? { id: pid, name: p.name, seat: p.seat, roleKey: view.me?.bondInfo?.partnerRole || '' }
      : null
  })

  // 准备期的「确认身份」面板：拿到牌的人人都有（观战者手里没牌，view.me 为 null）。
  // 它的语义是「我看过自己的牌了」—— 所以不是只有昔涟才有，那样别人会觉得莫名其妙。
  const showPrepConfirm = computed(
    () => view.phase === PHASE.PREP && !!view.me && !isWatcher.value
  )
  // 准备期进度文案：「已确认 3/6 · 还差 4 号、7 号」
  const prepConfirmHint = computed(() => {
    const pc = view.prepConfirm
    if (!pc) return ''
    const tail = pc.pendingSeats?.length
      ? ` · 还差 ${pc.pendingSeats.map((s) => `${s} 号`).join('、')}`
      : ''
    return `已确认 ${pc.done}/${pc.total}${tail}`
  })
  // 点「确认身份」。走 onAct 而不是直接调引擎：联机非桌主的 state 是 null，
  // 必须由桌主落库再广播回来（和昔涟改羁绊同一条通道）。
  // 全桌确认完，runAutoAdvance 会在下一个 tick 直接入夜。
  function onConfirmIdentity() {
    if (view.me?.prepConfirmed) return
    if (!onAct({ action: 'confirm-id' })) return
    ElMessage.success('已确认身份 —— 等其他人看完牌就入梦')
  }
  // 我此刻能不能自爆：'white'（白狼王）/ 'bomb'（自爆狼）/ ''（不能）
  // 我能不能自爆：直接读私有信息里的 blastKind。
  // ★ 不能再算 `canWolfBlast(state, ...)` —— 联机非桌主的 state 是 null，算出来恒为空串，
  //   白狼王 / 自爆狼在手机端连按钮都不渲染（2026-10-05 修）。
  const myBlastKind = computed(() => view.me?.blastKind || '')
  // 自爆按钮上要显示「带谁走」，所以取当前选中座位的名字
  const pickedSeatName = computed(() => {
    if (!state || !pickedId.value) return ''
    return playerOf(state, pickedId.value)?.name || ''
  })

  // 玩家自爆：带走一人，自己也出局（白狼王走后当天跳过投票入夜）
  function onBlast(targetId) {
    if (blockedByWatch()) return
    // 走 onAct：单人 / 桌主本地直接跑引擎，联机非桌主把意图发给桌主
    // （跟投票、夜间动作同一条通道）。原先是 `!authority.value || !state` 直接 return，
    // 非桌主点了毫无反应（2026-10-05 修）。
    onAct({ action: 'wolf-blast', targetId })
  }

  // AI 自爆：白天择机发动（白狼王 / 自爆狼）
  function runAiBlast() {
    if (!state) return false
    const cand = state.alive.filter((id) => playerOf(state, id)?.isAI && canWolfBlast(state, id))
    for (const id of cand) {
      const targetId = aiWolfBlast(state, id)
      if (!targetId) continue
      if (submitWolfBlast(state, id, targetId)?.ok) {
        commit('ww:sync', {}, { private: false })
        return true
      }
    }
    return false
  }

  //  开发调试：强制指定「我」的身份 
  // 本地反复验证某张角色牌（昔涟 / 卡芙卡 / 白狼王…）时不用再赌 1/人数 的手气：
  //   localStorage.wwDevRole = 'xilian'      ← devtools 敲一次，之后每局都是这张牌
  //   localStorage.removeItem('wwDevRole')   ← 关掉，恢复随机
  // 只和「当前持有该身份的人」对调，整局身份构成不变；单人局与联机桌主都适用。
  // 该档牌池里没有这张牌时不改任何东西，只在控制台讲清楚原因（别让人以为开关坏了）。
  // ★ 调试口子：只认 localStorage，普通玩家不会碰到；要彻底去掉就删这个函数和它的调用。
  function applyDevRole(state) {
    let want = ''
    try { want = localStorage.getItem('wwDevRole') || '' } catch (e) { return }
    if (!want) return
    const me = isMp.value ? mp.selfId : 'me'
    const cur = state.roleMap[me]
    if (cur === want) return
    const holder = Object.keys(state.roleMap).find((id) => state.roleMap[id] === want)
    if (!holder) {
      console.warn(
        `[萤火夜话·调试] 这一档（${state.players.length} 人）的牌池里没有「${want}」，没有做任何改动。\n` +
        `  牌池：${Object.values(state.roleMap).join('、')}\n` +
        `  提示：昔涟 / 卡芙卡 / 白狼王 只在 9 人及以上入池，单人局请把人数调到 9。`
      )
      return
    }
    state.roleMap[me] = want
    state.roleMap[holder] = cur
    console.info(`[萤火夜话·调试] 「我」的身份已换成 ${want}（原持有者 ${holder} 改为 ${cur}）`)
    // 顺手把整局身份摊在控制台，方便对照着测（只在这个开关生效时打印）
    console.table(state.players.map((p) => ({
      座位: p.seat, 名字: p.name, id: p.id, 身份: state.roleMap[p.id], 是AI: !!p.isAI,
    })))
  }

  //  开局 
  function startGame(size) {
    if (!canStart.value) return
    // 单人局人数：优先用传入值，其次界面选的，兜底 BASE_TOTAL
    if (!isMp.value) {
      const n = Number(size) || 0
      if (n) soloSize.value = n
    }
    if (isMp.value) {
      // 参战名单 = 这一桌的座位。房间无上限后「房间里的所有人」已经不能拿来凑座位了
      // —— 房间里可能有好几桌，还有人在观战。
      const seats = mp.mySession?.seats || []
      // 参战的就是这一桌所有座位：坐了几个就开几人局（不足 6 人由 AI 补齐到 6）
      // 头像从**房间成员表**里查（join 时就带上来了，已经是压缩过的小图）。
      // 这样只要人在房间里就有头像，不依赖「开局那一刻别人把头像发到桌上了没有」——
      // 之前走的是 ww:avatar 广播，异步压缩 + 网络很容易晚于开局（2026-10-05 修）。
      const avatarOfMember = (id) => mp.members.find((m) => m.id === id)?.avatar || ''
      const players = seats.map((p) => ({
        id: p.id,
        name: p.name,
        isAI: false,
        avatar: avatarOfMember(p.id),
      }))
      const need = totalPlayers.value - players.length
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
        players: buildSoloPlayers(soloSize.value || BASE_TOTAL, userStore.currentUser, readSelfAvatar()),
      })
    }

    // 调试开关：把「我」的身份换成 localStorage.wwDevRole 指定的那张牌（没设就什么都不做）
    applyDevRole(state)

    startedAt = state.startedAt
    settled = false
    // 联机：开局后桌主改人数就没意义了，留着会跟已经发的牌面对不上
    if (isMp.value) mpSize.value = null
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

    // ★ 开局这里**不**替昔涟绑羁绊：准备期那 10 秒是留给她自己点座位选对象的。
    //   她一直不选（或她是 AI / 离线），才由引擎在入夜前兜底随机指定一个
    //   —— 见 werewolf.js 的 startNight → ensureBonds。
    //   曾经写成开局直接 assignBonds，用户「我还没选上，系统就先给我选上了」（2026-10-02）。
    // 开局准备期：10 秒缓冲，倒计时结束由 advancePhase 进入第一夜
    startPrep(state)
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
  // 自愈：驱动停了之后，任何「对局还在动」的信号都要把它拉回来。
  // ★ 漏过的代价：nowTs 只在 tick 里更新，driver 一停时间就冻住，
  //   而 deadline 跟着引擎继续往前走 —— 倒计时会停在某个数上，越往后偏得越大
  //   （自由讨论上限 60s，却显示 301s 就是这么来的）。
  function ensureDriver() {
    // 对局已经结束就别再把 interval 拉起来了：tick 里虽然也会 return，
    // 但让远端为一个打完的局空转没必要（2026-10-05 修）
    if (view.phase === PHASE.OVER) return
    if (!tickTimer.id) tickTimer.id = setInterval(tick, 500)
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

  // 把「当前刀口票况」私发给每一只还活着的狼。
  // ★ 两个容易踩的点（2026-10-02 用户反馈「投完就看不见了」）：
  //   1) 公开快照 pubSnap 的 viewerId 是空，狼票只能靠定向消息带出去；
  //   2) 收件人必须是「所有活着的狼」，不能只发给还没出手的 —— 真人狼一投完这一步就
  //      没欠着的事了，面板收起来，而 AI 队友的票往往在这之后才陆续落地；
  //      让它继续看到票型，它才知道自己票投得准不准、要不要改投。
  function pushWolfTally() {
    if (!state || !state.alive) return
    aliveWolves(state).forEach((wid) => {
      sendPrivate(wid, 'ww:wolf-tally', { tally: getSnapshot(state, wid).wolfTally || null })
    })
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
      // AI 这一刀落完，真人狼要能当场看到票型（AI 队友的票也在这一刻进箱）
      if (act.action === 'wolf-kill') pushWolfTally()
      return act
    }
    const passOf = {
      'wolf-kill': 'wolf-pass',
      'seer-check': 'seer-pass',
      'firefly-light': 'firefly-pass',
    }
    if (passOf[act.action]) {
      submitNightAction(state, id, passOf[act.action])
      if (act.action === 'wolf-kill') pushWolfTally()
    }
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
      let text = ''
      if (lastWords) {
        text = aiLastWords(state, cur)
      } else {
        // 用 plan 版：拿到文本的同时拿到这次发言的「公开后果」，登记进 state.claims。
        // 后面的 AI 投票靠它才知道「谁指认了谁」—— 以前发言和投票是两条平行的随机流（2026-10-06）
        const plan = aiSpeakPlan(state, cur)
        text = plan.text
        recordClaim(state, cur, plan.claim)
      }
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
      // 讨论阶段同理：发言要留下「公开后果」，后面的投票才用得上
      const plan = aiSpeakPlan(state, id)
      recordClaim(state, id, plan.claim)
      const text = plan.text
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
        // 自由发言是「限时聊天」，60 秒就是它的上限 —— 到点就走，跟 DAY 一个道理。
        // ★ 这里绝不能再 return !discussSpoke（旧写法，已删）：
        //   那样「没说话 → blocked」会把界面顶成「梦境暂停中 · 等你」，倒计时那一行被顶掉，
        //   玩家看不见还剩多久；等他终于说了一句，墙钟往往早就过了 deadline，
        //   下一 tick 立刻 advance —— 主观感受就是「我发一句话讨论就跳过了」。
        // 想提前进投票请点「跳过」按钮（skipPhase），不要拿发言去触发推进。
        return false
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

    // 白狼王自爆 → 强行入夜（发生在白天的任何阶段）。
    // 设计如此、不是漏流程：亮牌自爆当天不再走投票，连遗言 / 发言阶段一并跳过，
    // 直接 startNight —— 别改成"补一轮遗言再入夜"，那是产品拍板过的行为（2026-10-02 确认）。
    if (state.skipVoteToNight && view.phase !== PHASE.NIGHT && view.phase !== PHASE.OVER) {
      state.skipVoteToNight = false
      const wBlast = evaluateWin(state)
      if (wBlast) return endGame(wBlast)
      startNight(state)
      aiPlan.length = 0
      aiVotes.length = 0
      resetSpeakCursor()
      pushFeed(state, '这一天的投票取消了 —— 梦境提前沉了下来。', 'warn')
      broadcastPhase('ww:phase', { phase: PHASE.NIGHT })
      return
    }

    // AI 自爆（白狼王 / 自爆狼）：只在白天择机发动，一旦发动本轮不再处理其他推进
    if ([PHASE.DAY, PHASE.DISCUSS, PHASE.VOTE].includes(view.phase)) {
      if (runAiBlast()) return
    }

    if (view.phase === PHASE.PREP) {
      // 准备期：全桌都点过「确认身份」就提前入夜；
      // 有人没点（掉线 / 挂机）则等兜底倒计时走完再入夜，不让全桌被卡死。
      if (prepAllConfirmed(state) || now >= state.deadline) advancePhase()
      return
    }

    if (view.phase === PHASE.NIGHT) {
      // 分步：这一步该动的都动完了 → 进下一步（或走到 done 收夜）
      if (actorsPending(state).length === 0) {
        advancePhase()
        return
      }
      // 到点才推进 —— 但推进前先把「还欠着的 AI」兜底补完再判一次。
      // 联机下 humanBlocking 恒为 false（它只看「我」是不是欠着，同伴是 AI 不算阻塞），
      // 若直接推走，AI 同伴没落到的那一票会连同整步一起作废：最典型的就是平票重投后
      // 刀还没落定、这一步先被推到下一家，那一夜直接空刀。预言家 / 女巫 / 流萤同理。
      if (now >= state.deadline) {
        actorsPending(state)
          .filter((id) => playerOf(state, id)?.isAI)
          .forEach((id) => {
            const act = applyAiNightAction(id)
            if (!act) return
            pushNightPrivate(id, act.action)
            commit('ww:sync', {}, { private: false })
          })
        if (actorsPending(state).length === 0) {
          advancePhase()
          return
        }
        if (!blocked) advancePhase()
      }
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
    // 上一次选中的目标只用于「提交前高亮」，推进阶段就作废 ——
    // 否则白天的自爆按钮会沿用昨晚的陈旧目标（可能已经死了）
    pickedId.value = ''

    switch (state.phase) {
      case PHASE.PREP: {
        // 准备期结束 → 进入第一夜
        startNight(state)
        // ★ 入夜前再定向补发一次私有信息。
        //   羁绊关系（昔涟）直接决定双方胜负，且它不在公开快照里 —— 开局补发过一次，
        //   但中途进房 / 重连的人、以及开局那一帧没抢到消息的人，会一直显示「没绑定」。
        //   准备期末尾这一帧是全桌唯一一次「人齐了、还没动过任何夜动作」的补发窗口。
        pushPrivateEvents()
        aiPlan.length = 0
        aiVotes.length = 0
        resetSpeakCursor()
        broadcastPhase('ww:phase', { phase: PHASE.NIGHT })
        return
      }
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
        // 丹恒若昨夜被骇入离场，先让他在梦醒公布阶段把「反击」打出去。
        // 设定表：凡「带走一人」的效果统一只发生在白天，夜间不带走任何人。
        const hunterDown = state.lastNightDeaths.find((id) => state.roleMap[id] === ROLE.HUNTER)
        if (hunterDown && state.hunterFrom !== 'exile') {
          const w = evaluateWin(state)
          if (w) return endGame(w)
          startHunter(state, hunterDown, 'night')
          aiPlan.length = 0
          aiVotes.length = 0
          broadcastPhase('ww:phase', { phase: PHASE.HUNTER, hunterId: hunterDown })
          return
        }
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
      //  反击：丹恒离场后指定一名乘客同去 
      // 这一枪可能把胜负条件打满，出去之前必须再判一次
      case PHASE.HUNTER: {
        const w = evaluateWin(state)
        if (w) return endGame(w)
        // 夜里离场的丹恒：带完人后梦醒流程继续（遗言 → 轮流发言），不直接入夜
        if (state.hunterFrom === 'night') {
          state.hunterFrom = ''
          const deadN = startLastWords(state)
          if (!deadN.length) startSpeaking(state)
          resetSpeakCursor()
          spokeRound.clear()
          nextAiChatAt = 0
          broadcastPhase('ww:phase')
          break
        }
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
    if (blockedByWatch()) return false
    if (!authority.value || !state) {
      if (!action) return false
      const ok = mp.sendGame({ kind: 'ww:action', action, targetId })
      if (ok === false) { ElMessage.warning('与房间的连接已断开'); return false }
      // 意图已经发出去，结果由桌主那边跑完再广播回来，这里先按成功提示
      return true
    }
    return applyAction(myId.value, action, targetId, true)
  }

  function applyAction(actorId, action, targetId, local = false) {
    if (!state) return false
    const isVote = action === 'vote'
    const isHunterAct = action === 'hunter-shoot' || action === 'hunter-pass'
    let r
    if (isVote) r = submitVote(state, actorId, targetId)
    else if (action === 'hunter-shoot') r = submitHunterShoot(state, actorId, targetId)
    else if (action === 'hunter-pass') r = skipHunter(state, actorId)
    // 白狼王 / 自爆狼亮牌自爆：也走动作通道，非桌主才能点得动（2026-10-05 修）
    else if (action === 'wolf-blast') r = submitWolfBlast(state, actorId, targetId)
    // 昔涟指定羁绊对象：走动作通道，联机下由桌主落库再广播，非桌主点座位才有意义
    // setBond 直接返回 true/false，这里统一包成 { ok } 好跟其他动作共用后续分支
    else if (action === 'bond') r = { ok: setBond(state, actorId, targetId) }
    // 准备期「确认身份」：同样包成 { ok }（引擎那侧返回的是 boolean）
    else if (action === 'confirm-id') r = { ok: confirmIdentity(state, actorId) }
    else r = submitNightAction(state, actorId, action, targetId)

    if (!r.ok) {
      if (local) ElMessage.warning(r.msg || '这一步做不了')
      else sendPrivate(actorId, 'ww:sync', {})
      return false
    }
    // 羁绊 / 确认身份都有自己的成功提示，别再往下掉到 generic 的「已提交」
    if (local && !r.duplicate && action !== 'bond' && action !== 'confirm-id') {
      if (isVote) ElMessage.success(targetId ? '已投出这一票' : '已弃票')
      else if (action === 'hunter-shoot') ElMessage.success('龙焰已出')
      else if (action === 'hunter-pass') ElMessage.success('你放下了这一枪')
      else if (action === 'wolf-blast') ElMessage.success(r.kind === 'white' ? '银狼 Lv.999 自爆' : '已自爆')
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
    // 准备期：昔涟点座位 = 指定（或改）羁绊对象（真人自主选择）
    if (bondPickMode.value) {
      if (id === myId.value) { ElMessage.warning('不能和自己缔结羁绊'); return }
      const before = view.me?.bondInfo?.partnerId || ''
      const who = view.players.find((p) => p.id === id)?.name || id
      // 走 onAct 而不是直接调 setBond：联机下这里改的是只读镜像，直接改上传不上去，
      // 下一帧就被桌主的快照覆盖回来，表现就是「点了没反应」（2026-10-02 反馈）
      if (!onAct({ action: 'bond', targetId: id })) return
      pickedId.value = id
      ElMessage.success(before ? `羁绊已改到 ${who}` : `已与 ${who} 缔结羁绊`)
      return
    }
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
    // 白天：点座位 = 只是「选中目标」，不提交。阶段面板上的动作按钮（自爆等）按 pickedId 执行
    // ★ 必须读 view.phase，不能读 state.phase —— 联机非桌主的 state 是 null，
    //   夜间点座位会在这里 TypeError 崩掉（2026-10-05 修）
    if (view.phase !== PHASE.NIGHT) {
      pickedId.value = pickedId.value === id ? '' : id
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
    // ★ 这里不能带 { private: false }：公开广播里已经把暗网消息滤掉了，
    //   必须再给每个狼定向补一份私有快照，否则狼连自己刚发的暗网消息都看不到（2026-10-05 修）
    commit('ww:chat', { fromId: myId.value, text, channel: ch })
  }

  //  轮流发言 / 遗言：玩家自己的那一次
  // 轮到你时用这个提交；提交后自动轮到下一位（由引擎的 submitSpeak 推进）
  function onSpeak(text) {
    // 观战者一律拦下 —— doSkipSpeak / onSendChat 都有这道，这里原先漏了（2026-10-05 补）
    if (blockedByWatch()) return
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
    // 讨论阶段点「跳过」就是玩家主动收尾（自由发言本身已不再被防挂机门槛拦住，
    // 这里留个「本轮我出过声」的标记，别再拿它去解锁流程）
    discussSpoke = true
    aiVotes.length = 0
    advancePhase()
    refreshLocal()
  }

  // 局中某个真人离开了：提示全桌 + 把他的席位交给 AI 代打。
  // 不做接管的话，引擎还按「在等他」处理 —— 夜间动作 / 发言 / 投票会一路卡住。
  function handleSeatLeft(leftId) {
    if (!leftId) return
    const who = view.players.find((p) => p.id === leftId)
    if (!who) return   // 不在这一局里（可能是别的桌的人），不管
    // 局还没开 / 已经打完：没有「代打」这回事，别播那句会误导人的话。
    // 结算页一屋子人陆续退出，更不该刷一屏通知（2026-10-05）。
    if (view.phase === PHASE.OVER || view.phase === PHASE.IDLE) return
    // 用 ElNotification（右上角卡片、停 6 秒）而不是一闪而过的 ElMessage ——
    // 有人离席是影响全桌的事，得让人来得及看见；座位上另有常驻标签兜底
    ElNotification({
      title: '有乘客离开了',
      message: `${who.name} 退出了本局，这一位暂时由 AI 代打。`,
      type: 'warning',
      duration: 6000,
    })
    // 只有权威（单人 / 桌主）能改引擎状态，改完由 commit 广播给全桌
    if (authority.value && state && convertToAI(state, leftId)) commit('ww:sync', {})
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
      // 这条是桌主定向发给「流萤本人」的（不是发给被照亮者）。
      // ★ 原来写成 `fromId === mp.selfId` —— 定向消息的 fromId 是桌主，条件恒假、提示永远不出现。
      //   真正的数据靠消息里附带的 snap 落地，所以以前只是少个提示，面板信息不缺（2026-10-05 修）。
      case 'ww:firefly-info':
        if (data.litId) ElMessage.success('萤火已经落在你选中的那位乘客身上')
        break
      // 房主在狼出手后定向发来的「当前刀口票况」（公开快照里带不上，只能走这条私有通道）
      // 同样是定向私有消息：fromId 是桌主，不能拿它比自己的 id（2026-10-05 修）
      case 'ww:wolf-tally':
        if (data.tally) view.wolfTally = data.tally
        break
      // 瓦尔特只发给「本人」（fromId 是桌主），同上去掉错的守卫（2026-10-05 修）
      case 'ww:seer-result':
        if (data.targetId) {
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
          // 同上：去掉 private:false，靠定向私有快照把暗网消息发给狼自己（2026-10-05 修）
          commit('ww:chat', { fromId, text: data.text, channel: ch })
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
      case 'mp:table-closed':
        // 桌主离开了（或桌空了）→ 这局续不下去：引擎的 state 只在他一个人的内存里
        ElMessage.warning(
          data.reason === 'owner-ended' ? '桌主已解散本局' : '桌主已离开，本局结束'
        )
        settleQuit()
        mp.clearSession()
        router.push('/multiplayer')
        break
      // 局中有人离席。两个来源都要接，缺一不可：
      //   mp:member-left —— 服务端发的（断线 / 主动退出房间）
      //   mp:seat-left   —— 房主转发的（玩家只是离开了游戏页、人还在房间，走的是 session-leave）
      //   后者才是「点返回游戏大厅」那条路 —— 以前完全没人接，所以没有任何提示（2026-10-05 修）。
      case 'mp:member-left':
      case 'mp:seat-left':
        handleSeatLeft(data.memberId)
        break
      case 'ww:seat-back': {
        // 某个中途离席的人重新进来了 —— 把席位交还给他，撤掉 AI 代打。
        // 不做这一步的话，他回来时 isAI 还是 true，引擎继续替他行动，他点什么都没用（2026-10-05 修）。
        const backId = fromId
        if (!backId) break
        if (authority.value && state && restoreHuman(state, backId)) commit('ww:sync', {})
        break
      }
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
      isWatcher: isWatcher.value,
      // 昔涟判断「自己与绑定者是否都活到最后」用。走私有信息，不暴露全场绑定关系
      myId: myId.value || '',
      bondId: view.me?.bondInfo?.partnerId || '',
      // 搭档那侧靠它认出「我绑的是昔涟」，从而同享羁绊奖励（2026-10-05 修）
      bondRole: view.me?.bondInfo?.partnerRole || '',
    })
    r.items.forEach((it) => goldStore.addGold(it.amount, 'werewolf'))
    // 狼人杀同样涨好感：赢 +8，没赢（落败 / 中途退出）+3，统一受每日上限约束。
    // r.won 是 computeRewards 给出的「本局算不算我赢」；观战者再单独排一次
    // （观战本来就不结算，这里多一道保险，免得以后改坏了白送好感）
    if (!isWatcher.value) {
      const grant = takeDailyQuota('game', DAILY_CAPS.game, r.won ? 8 : 3)
      if (grant > 0) changeAffection(grant)
    }
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

  // 阶段变成 over → 结算并弹窗。
  // ★ 联机必须等「私有快照也到了」再算：公开快照先到，那一刻 view.me 还是 null，
  //   照算的话 myRole 是空串 → 全员按「没有身份」判落败，赢家拿 700 而不是 1000。
  //   所以触发条件是「phase 变 OVER」+「me 已就绪」；me 迟迟不来（1.5s）就按现有信息收尾，
  //   宁可少算一点，也不能让结算页永远不弹（2026-10-05 修）。
  let pendingSettleTimer = null
  const finishSettle = () => {
    settle({ endedNormally: true })
    overlay.value = 'over'
  }
  watch(
    () => `${view.phase}|${view.me?.roleKey || ''}`,
    () => {
      if (view.phase !== PHASE.OVER) return
      // 观战者本来就没有 me（也不拿奖励），直接放行
      const ready = !isMp.value || isWatcher.value || !!view.me?.roleKey
      if (!ready) {
        if (!pendingSettleTimer) {
          pendingSettleTimer = setTimeout(() => {
            pendingSettleTimer = null
            finishSettle()
          }, 1500)
        }
        return
      }
      if (pendingSettleTimer) {
        clearTimeout(pendingSettleTimer)
        pendingSettleTimer = null
      }
      finishSettle()
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
    // 重新进桌：把席位挂回桌上，并通知桌主撤掉 AI 代打。
    // ① 离开游戏页时房主已经把我从 seats 摘掉了，不挂回去桌列表里我的座位会一直空着；
    //    session-rejoin 是幂等的（已经在座就不动），正常首次入桌发它也没副作用。
    // ② ww:seat-back 才是关键：撤掉 isAI，否则引擎继续替「AI」行动，我点什么都没用。
    // 观战者不占座位，两个都不用发；桌主离开 = 整桌解散，不存在「回来」。
    if (!isWatcher.value) {
      if (mp.sessionId) {
        mp.sendRoom(
          { kind: 'mp:session-rejoin', sid: mp.sessionId, role: 'player' },
          mp.hostId || null
        )
      }
      mp.sendGame({ kind: 'ww:seat-back' })
    }
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
    if (pendingSettleTimer) clearTimeout(pendingSettleTimer)
    if (offGame) { offGame(); offGame = null }
    // 没打完就离开 → 按「满 3 分钟给 100」结算；已结算过则什么都不做
    settleQuit()
    // 离开对局页 = 离开这一桌：自己开的桌直接散桌，坐别人的桌让出席位。
    // ★ 必须用 exitSession 而不是 leaveSession —— 后者只发「离席」，
    //   桌主用它会在桌列表里留下一个「ownerId 指向已经不在的人」的桌，
    //   于是桌上所有人都不再是权威、没人跑引擎，整局就那么僵在那里（2026-10-05 修）。
    if (isMp.value) mp.exitSession()
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
    view.wolfTally = null
    view.allRoles = null
    view.nightLog = null
    view.judgeInfo = null
    view.seerHistory = null
    view.nightStep = ''
    view.prevPhase = ''
    view.prevNightStep = ''
    view.hunterId = ''
    view.hunterDone = false
    view.prepConfirm = null
    view.winner = ''
    // 发言游标也归零：不清的话下一局排第一位的那位会「立即」开口，没有思考间隔（2026-10-05 修）
    resetSpeakCursor()
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
    seatCapacity, totalPlayers, shortBy, canStart, startBtnText, setupLine, mpSize, canSetSize, setMpSize,
    // 单人局人数（设定表「选择对局人数」）
    soloSize,
    // 自爆 / 昔涟羁绊 / 准备期确认身份
    // ★ bondPartner 之前漏在导出列表外面：Werewolf.vue 解构它拿到的是 undefined，
    //   「你已与 X 号 Y 缔结羁绊」那行永远走不到（v-if 恒假），只有「只有你知道」面板生效。
    myBlastKind, pickedSeatName, bondPickMode, bondPartner, onBlast,
    showPrepConfirm, prepConfirmHint, onConfirmIdentity,
    // 「单人在等你」——视图据此显示「梦境暂停中」
    waitingMe,
    // 行为
    startGame, onAct, onSeatPick, onSendChat,
    onBack, backToStart, settleQuit,
    // 轮流发言 / 遗言 / 单人跳过阶段
    onSpeak, doSkipSpeak, skipPhase,
  }
}
