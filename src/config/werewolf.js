//  萤火夜话 · 配置层 
//
// 只放「纯数据 + 纯函数」：角色定义、人数配置、术语常量、身份池生成、奖励表。
// 不 import Vue / Pinia / 任何组件，也不 import 本目录外的业务模块 ——
// 这样它可以被 utils/werewolf.js 与视图层同时复用，也方便日后单独跑脚本验证。
//
// 本版本只运营「6 人基本局」（7~10 人的配置表一并保留，作为后续扩展的现成数据）。

import ylCard from '@/images/game/wolf/yl_card.jpg'
import ylIcon from '@/images/game/wolf/yl.png'
import wrtCard from '@/images/game/wolf/wrt_card.png'
import wrtIcon from '@/images/game/wolf/wrt.png'
import jzCard from '@/images/game/wolf/jz_card.png'
import jzIcon from '@/images/game/wolf/jz.png'
import lyCard from '@/images/game/wolf/ly_card.jpg'
import lyIcon from '@/images/game/wolf/ly.png'
import dhCard from '@/images/game/wolf/dh_card.png'
import ktzIcon from '@/images/game/wolf/ktz.png'
// 开拓者的卡面有男、女两张，发牌时随机分一张（不再用小图标兜底）
import ktzCardMan from '@/images/game/wolf/ktz_card_man.png'
import ktzCardWoman from '@/images/game/wolf/ktz_card_woman.png'
// 帕姆（AI 判官）的头像
import pmIcon from '@/images/game/wolf/pm.png'

//  阵营 
export const CAMP = {
  HUNT: 'hunt',   // 星核猎手（狼人阵营）
  TRAIN: 'train', // 列车组（好人阵营）
}

//  角色 key 
export const ROLE = {
  WOLF: 'wolf',         // 银狼
  VILLAGER: 'villager', // 开拓者
  SEER: 'seer',         // 瓦尔特
  WITCH: 'witch',       // 姬子
  HUNTER: 'hunter',     // 丹恒（6 人局已上场：被放逐时发动「反击」带走一人）
  FIREFLY: 'firefly',   // 流萤（萤火使，每局必出）
}

//  角色定义 
// card 为空字符串 = 素材目录里没有整张卡（开拓者只有 60px 小图标），
// 由视图层用 CSS 兜底画一张，别硬把小图标拉伸成卡片（60px 放大会糊成一团）。
export const ROLES = {
  [ROLE.WOLF]: {
    key: ROLE.WOLF,
    name: '银狼',
    job: '狼人',
    title: '星核猎手',
    camp: CAMP.HUNT,
    icon: 'fa-solid fa-user-ninja',
    color: '#8B5CF6',
    card: ylCard,
    avatar: ylIcon,
    short: '每晚与同伴共同骇入一名乘客',
    skill: '入梦时与同伴互认，共同选择一名乘客「骇入」。被骇入者于次日梦醒时离场。',
    tip: '伪装成列车组，把怀疑引向别人。同伴会在暗网频道与你相认。',
  },
  [ROLE.VILLAGER]: {
    key: ROLE.VILLAGER,
    name: '开拓者',
    job: '平民',
    title: '乘客',
    camp: CAMP.TRAIN,
    icon: 'fa-solid fa-user-astronaut',
    color: '#5B9BD5',
    card: '',          // 开拓者有两张卡（男/女），随机分 —— 统一走 pickRoleCard()
    cards: [ktzCardMan, ktzCardWoman],
    avatar: ktzIcon,
    short: '没有技能，靠推理与投票找出星核猎手',
    skill: '你没有特殊能力。仔细听发言、盯住票型，把银狼放逐出梦境。',
    tip: '你的每一票都很重要，别轻易跟票。',
  },
  [ROLE.SEER]: {
    key: ROLE.SEER,
    name: '瓦尔特',
    job: '预言家',
    title: '感应者',
    camp: CAMP.TRAIN,
    icon: 'fa-solid fa-glasses',
    color: '#3D7EBF',
    card: wrtCard,
    avatar: wrtIcon,
    short: '每晚感应一人，得知其阵营',
    skill: '入梦时感应一名乘客，只得到「星核猎手 / 列车组」这一个结论，看不到具体身份。',
    tip: '你的结论是全场最有价值的信息，但也最容易被针对。',
  },
  [ROLE.WITCH]: {
    key: ROLE.WITCH,
    name: '姬子',
    job: '女巫',
    title: '调饮师',
    camp: CAMP.TRAIN,
    icon: 'fa-solid fa-mug-hot',
    color: '#C0392B',
    card: jzCard,
    avatar: jzIcon,
    short: '一瓶咖啡一瓶毒咖啡，各只能用一次',
    skill: '入梦时得知当晚被骇入的人。可用「姬子的咖啡」救下他，或用「毒咖啡」毒死任意一人。两瓶各只有一次机会。',
    tip: '咖啡用得早不一定好，留到关键那一夜往往更值。',
  },
  [ROLE.HUNTER]: {
    key: ROLE.HUNTER,
    name: '丹恒',
    job: '猎人',
    title: '护卫',
    camp: CAMP.TRAIN,
    icon: 'fa-solid fa-dragon',
    color: '#2E8B7A',
    card: dhCard,
    // 素材目录里没有丹恒的小图（只有 dh_card.png），留空让座位走「人形」图标兜底。
    // ★ 别拿 dhCard 顶上去：座位头像一旦跟着身份走，开局看一眼头像就知道谁是护卫。
    avatar: '',
    short: '被放逐时可发动反击带走一人',
    skill: '当你被投票放逐出梦境时，可以发动「反击」，指定一名乘客与你一同离场。',
    tip: '别急着亮身份，让银狼不敢投你才是价值。',
  },
  [ROLE.FIREFLY]: {
    key: ROLE.FIREFLY,
    name: '流萤',
    job: '萤火使',
    title: '萤火使',
    camp: CAMP.TRAIN,
    icon: 'fa-solid fa-fire-flame-simple',
    color: '#FFD966',
    card: lyCard,
    avatar: lyIcon,
    short: '每晚照亮一人，使其当晚免于离场',
    skill: '入梦时照亮一名乘客。被照亮者若当晚被银狼骇入，不会立即离场，而是延后到次日梦醒公布。',
    tip: '不能连续两晚照亮同一人，也不能照亮自己。',
    motto: '我愿化作萤火，照亮你前行的路。',
  },
}

//  帕姆（AI 判官）的头像 
// 判官不是角色、不进 roleMap，所以单独导出 —— 不要为了放张头像就给它编一个 ROLE。
export const PM_AVATAR = pmIcon

// 取某个角色的卡面。开拓者有两张（男/女），random 注入便于测试时固定；
// 视图层只在「发牌那一刻」调一次并把结果存起来，避免每次重渲染都换脸。
export function pickRoleCard(roleKey, rnd = Math.random) {
  const r = ROLES[roleKey]
  if (!r) return ''
  if (r.cards?.length) return r.cards[Math.floor(rnd() * r.cards.length)] || r.cards[0]
  return r.card || ''
}

//  术语常量（主题命名，UI 一律走这里，别在视图里写死中文） 
export const TERMS = {
  gameName: '萤火夜话',
  subTitle: '匹诺康尼的梦境游戏',
  teamHunt: '星核猎手',
  teamTrain: '列车组',
  night: '入梦',
  day: '梦醒',
  discuss: '讨论',
  vote: '投票',
  kill: '骇入',
  seerCheck: '感应',
  witchSave: '姬子的咖啡',
  witchPoison: '毒咖啡',
  hunterShoot: '反击',
  exile: '放逐出梦境',
  wolfChannel: '暗网频道',
  publicChannel: '列车广播',
  judge: '帕姆',
  seat: '座位',
  survivor: '乘客',
  fireflyLight: '照亮',
  peaceNight: '平安夜',
  // 平民角色的名字。狼人的胜利条件挂在它上面（「场上有几张开拓者就要抓走几张」），
  // 视图里别再写死「开拓者」三个字。
  villagerName: '开拓者',
}

//  阶段 
export const PHASE = {
  IDLE: 'idle',
  NIGHT: 'night',
  DAY: 'day',
  // 昨夜离场的人先发言（遗言），让死者先把判断说完，再进讨论
  LAST_WORDS: 'lastwords',
  // 轮流发言：存活者按座位顺序依次拿到发言时间
  SPEAKING: 'speaking',
  // 自由发言：谁都可以说，不限时
  DISCUSS: 'discuss',
  VOTE: 'vote',
  HUNTER: 'hunter',
  OVER: 'over',
}

// 每位玩家的发言时长（遗言阶段与轮流发言阶段共用）。
// 想调节奏只改这一个数，UI 与计时都会跟着走。
export const SPEAK_MS = 35000

// 各阶段默认时限（毫秒）。帕姆判官按这个倒计时自动推进。
// ★ 夜晚是一个「阶段」，但内部还要按角色一步步走（见 NIGHT_STEPS），
//   所以 NIGHT 这里的数字只在「整夜兜底」时用，正常倒计时走 NIGHT_STEP_MS。
export const PHASE_MS = {
  [PHASE.NIGHT]: 60000,
  [PHASE.DAY]: 8000,      // 公布夜间结果，自动过场（单人模式可点「跳过」直接过）
  [PHASE.LAST_WORDS]: SPEAK_MS,
  [PHASE.SPEAKING]: SPEAK_MS,
  [PHASE.DISCUSS]: 60000,
  [PHASE.VOTE]: 30000,
  [PHASE.HUNTER]: 10000,
}

//  夜间分步
export const NIGHT_STEPS = ['wolf', 'seer', 'witch', 'firefly']

export const NIGHT_STEP_LABEL = {
  wolf: '银狼 · 骇入',
  seer: '瓦尔特 · 感应',
  witch: '姬子 · 调饮',
  firefly: '流萤 · 照亮',
  done: '入梦结算',
}

// 每一步归谁管 —— 引擎据此判断「这一步该谁出手」（真人不在这一步就自动放行）
export const NIGHT_STEP_ROLE = {
  wolf: ROLE.WOLF,
  seer: ROLE.SEER,
  witch: ROLE.WITCH,
  firefly: ROLE.FIREFLY,
}

// 每一步的限时（毫秒）。完成阶段需要时间 —— 想调节奏只改这一个表。
export const NIGHT_STEP_MS = {
  wolf: 20000,
  seer: 20000,
  witch: 25000,
  firefly: 20000,
}

//  人数配置表 
export const SETUPS_AI = {
  // 6 人基本局
  6: [ROLE.WOLF, ROLE.SEER, ROLE.WITCH, ROLE.HUNTER, ROLE.FIREFLY, ROLE.VILLAGER],
  7: [ROLE.WOLF, ROLE.WOLF, ROLE.SEER, ROLE.WITCH, ROLE.HUNTER, ROLE.FIREFLY, ROLE.VILLAGER],
  8: [ROLE.WOLF, ROLE.WOLF, ROLE.SEER, ROLE.WITCH, ROLE.HUNTER, ROLE.FIREFLY, ROLE.VILLAGER, ROLE.VILLAGER],
  9: [ROLE.WOLF, ROLE.WOLF, ROLE.WOLF, ROLE.SEER, ROLE.WITCH, ROLE.HUNTER, ROLE.FIREFLY, ROLE.VILLAGER, ROLE.VILLAGER],
  10: [ROLE.WOLF, ROLE.WOLF, ROLE.WOLF, ROLE.SEER, ROLE.WITCH, ROLE.HUNTER, ROLE.FIREFLY, ROLE.VILLAGER, ROLE.VILLAGER, ROLE.VILLAGER],
}

// 本版本开放的局
export const BASE_TOTAL = 6

//  身份池生成（流萤必出机制） 
export function buildRolePool(totalCount) {
  const base = SETUPS_AI[totalCount] || SETUPS_AI[BASE_TOTAL]
  const pool = base.includes(ROLE.FIREFLY) ? [...base] : [...base, ROLE.FIREFLY]
  while (pool.length < totalCount) pool.push(ROLE.VILLAGER)
  return pool.slice(0, totalCount)
}

//  判定辅助 
export const isWolfRole = (roleKey) => ROLES[roleKey]?.camp === CAMP.HUNT

//  阵营统计 
export function countCamps(roleMap, aliveIds) {
  let hunt = 0
  let train = 0
  aliveIds.forEach((id) => {
    if (isWolfRole(roleMap[id])) hunt++
    else train++
  })
  return { hunt, train }
}

// 「开拓者」的存活进度：{ left, total }
export function villagerStat(roleMap, aliveIds) {
  const total = Object.keys(roleMap).filter((id) => roleMap[id] === ROLE.VILLAGER).length
  const left = aliveIds.filter((id) => roleMap[id] === ROLE.VILLAGER).length
  return { left, total }
}

// 狼人这一次是靠什么赢的：'villagers'（开拓者全部被抓走）| 'advantage'（人数优势）
// 结算播报与结算页共用，避免两处文案各写一遍
export function huntWinReason(roleMap, aliveIds) {
  const v = villagerStat(roleMap, aliveIds)
  return v.total > 0 && v.left === 0 ? 'villagers' : 'advantage'
}

// 胜负判定（返回 null 表示继续）
export function checkWin(roleMap, aliveIds) {
  const { hunt, train } = countCamps(roleMap, aliveIds)
  if (hunt === 0) return CAMP.TRAIN
  const v = villagerStat(roleMap, aliveIds)
  // total > 0 的守卫：万一某套配置一张开拓者都没有，不能一开局就判狼赢
  if (v.total > 0 && v.left === 0) return CAMP.HUNT
  if (hunt >= train) return CAMP.HUNT
  return null
}

//  金币奖励表 
// 只在这里改数字，别散落到视图里。addGold 统一由 goldStore 发放（会吃「金币获取」加成）。
export const REWARDS = {
  WIN: 1000,                 // 参加并获胜
  LOSE: 700,                 // 参加但失败
  QUIT_AFTER_3MIN: 100,      // 参与满 3 分钟后中途退出
  PAIR_BONUS: 1000,          // 流萤与开拓者同时存活到最后，额外加成
  NIGHT_ACTION: 50,          // 每成功执行一次夜间技能
  SURVIVE_ROUND: 50,         // 每活过一个完整昼夜
  VOTE_HIT_WOLF: 200,        // 投票投中的是星核猎手
  FIREFLY_SAVE: 300,         // 萤火护住被骇入者（玩家自己是流萤时）
  QUIT_GRACE_MS: 3 * 60 * 1000,
}

//  流萤保护语义开关 
// true  = 萤火只是「延迟一死」：被照亮者当晚不死，但下一个梦醒仍会公布离场
// false = 萤火是「完全救下」：被照亮者当晚免死，且之后再也不会因此离场
// 文案（技能说明、播报）会跟着这条开关变，改这里一处即可。
export const FIREFLY_DELAY_DEATH = true

// 参与满 3 分钟的判定：开始时间来自对局启动瞬间（本地时钟即可，联机不要求精确同步）
export function passGracePeriod(startedAt, now = Date.now()) {
  return startedAt > 0 && now - startedAt >= REWARDS.QUIT_GRACE_MS
}

//  角色计分（用于结算页展示「本局贡献」） 
export function roleLabel(roleKey) {
  const r = ROLES[roleKey]
  return r ? `${r.name}·${r.title}` : '未知'
}

//  单人模式 / AI 补位用的乘客名 
// 刻意避开角色名（不叫「三月七」「丹恒」），否则玩家会把「名字」误读成「身份」。
export const AI_NAME_POOL = [
  '梦客·阿澈', '梦客·小满', '梦客·青雀', '梦客·寒鸦',
  '梦客·米沙', '梦客·桑博', '梦客·知更', '梦客·砂金',
  '梦客·白露', '梦客·佩拉',
]

// 给 AI 取一批互不重复的名字
export function pickAiNames(count, seed = []) {
  const used = new Set(seed)
  const pool = AI_NAME_POOL.filter((n) => !used.has(n))
  const out = []
  while (out.length < count) {
    if (pool.length === 0) {
      out.push(`梦客·${out.length + 1}号`)
      continue
    }
    const i = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(i, 1)[0])
  }
  return out
}

//  座位头像池 
// 取素材目录里「不带 card」的小图，随机分给 AI 乘客当头像。
// ★ 刻意与身份无关：如果按身份取角色图，开局看一眼头像就知道谁是银狼。
// 丹恒没有小图（目录里只有 dh_card.png），所以不在池子里 —— 用到时由视图层兜底。
export const SEAT_AVATARS = [ylIcon, jzIcon, ktzIcon, wrtIcon, lyIcon]

// 给一批座位随机取头像（可重复；数量超过池子就循环补齐）
export function pickSeatAvatars(count) {
  const out = []
  while (out.length < count) out.push(...shuffle(SEAT_AVATARS))
  return out.slice(0, count)
}

//  洗牌（Fisher-Yates，就地） 
export function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 发牌：把身份池打乱后按座位顺序一一对应
// players: [{ id, name, seat }] → { [playerId]: roleKey }
export function assignRoles(players, pool) {
  const deck = shuffle(pool)
  const map = {}
  players.forEach((p, i) => {
    map[p.id] = deck[i] || ROLE.VILLAGER
  })
  return map
}
