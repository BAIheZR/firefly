//  萤火夜话 · 配置层：只放纯数据与纯函数（角色定义、人数配置、术语常量、身份池生成、奖励表），不依赖 Vue/Pinia/组件，
// 可被 utils/werewolf.js 与视图层同时复用。本版本只运营 6 人基本局（7~10 人配置保留作扩展数据）
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
// 新增角色卡面：白狼王 / 自爆狼共用 yl999，昔涟 xl，卡芙卡 kfk。
// 三者都没有小图标（素材目录只有整张卡），故 ROLES 里 avatar 一律留空走人形兜底。
import yl999Card from '@/images/game/wolf/yl999_card.jpg'
import xlCard from '@/images/game/wolf/xl_card.jpg'
import kfkCard from '@/images/game/wolf/kfk_card.jpg'

//  阵营 
// 中立派不参与「狼 / 好人」的胜负判定，只按自身条件结算（见 REWARDS 的结算铁律）
export const CAMP = {
  HUNT: 'hunt',       // 星核猎手（狼人阵营）
  TRAIN: 'train',     // 列车组（好人阵营）
  NEUTRAL: 'neutral', // 中立派（流萤 / 昔涟 / 卡芙卡）
}

//  角色 key 
export const ROLE = {
  WOLF: 'wolf',         // 银狼
  VILLAGER: 'villager', // 开拓者
  SEER: 'seer',         // 瓦尔特
  WITCH: 'witch',       // 姬子
  HUNTER: 'hunter',     // 丹恒（6 人局已上场：被放逐时发动「反击」带走一人）
  FIREFLY: 'firefly',   // 流萤（萤火使，每局必出）
  // 以下为新增角色，上场表见 SETUPS_AI（当前只运营 6 人局，故尚未进任何身份池）
  WHITE_WOLF: 'whiteWolf', // 白狼王（可自选亮牌自爆）
  BOMB_WOLF: 'bombWolf',   // 自爆狼（被投出时爆炸带走一人）
  XILIAN: 'xilian',        // 昔涟（开局绑定情侣）
  KAFKA: 'kafka',          // 卡芙卡（摄梦人：连标同一人两晚处决）
}

//  角色定义 
// card 为空字符串 = 素材目录没有整张卡（开拓者只有 60px 小图标），由视图层用 CSS 兜底画一张
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
    // 中立派：按自身条件结算，不领阵营的胜利 / 落败金币（见 computeRewards 的结算铁律）。
    // 注意 countCamps 用的是「狼 / 非狼」口径，中立派计入非狼侧，故平衡性不受影响。
    camp: CAMP.NEUTRAL,
    icon: 'fa-solid fa-fire-flame-simple',
    color: '#FFD966',
    card: lyCard,
    avatar: lyIcon,
    short: '每晚照亮一人；离场时拖住星核猎手一整夜',
    skill: '入梦时照亮一名乘客。被照亮者若当晚被骇入，不会立即离场，而是延后到次日梦醒公布。你离场时萤火燃尽，星核猎手下一夜无法行动（含白狼王 / 自爆狼）。',
    tip: '不能连续两晚照亮同一人，也不能照亮自己。与开拓者都活到最后，即可达成双人结局。',
    motto: '我愿化作萤火，照亮你前行的路。',
  },
  [ROLE.WHITE_WOLF]: {
    key: ROLE.WHITE_WOLF,
    name: '白狼王',
    job: '狼人',
    title: '星核猎手',
    camp: CAMP.HUNT,
    icon: 'fa-solid fa-crown',
    color: '#A855F7',
    card: yl999Card,
    avatar: '',
    short: '可自选亮牌自爆：带走一人并跳过当天投票',
    skill: '你可以自选公开亮牌（全场播报「银狼 Lv.999 自爆」），立即指定一名乘客与你一同离场，随后当天跳过投票直接入梦。',
    tip: '亮牌是可选的一次性杀招；不亮牌时按普通狼行动。',
  },
  [ROLE.BOMB_WOLF]: {
    key: ROLE.BOMB_WOLF,
    name: '自爆狼',
    job: '狼人',
    title: '星核猎手',
    camp: CAMP.HUNT,
    icon: 'fa-solid fa-bomb',
    color: '#6D28D9',
    card: yl999Card,
    avatar: '',
    short: '被投票放逐时爆炸，带走一人',
    skill: '当你被投票放逐出梦境时立即「爆炸」，指定一名乘客与你一同离场。',
    tip: '你的价值不在于活到最后，而在于换掉关键的好人。',
  },
  [ROLE.XILIAN]: {
    key: ROLE.XILIAN,
    name: '昔涟',
    job: '丘比特',
    title: '羁绊者',
    camp: CAMP.NEUTRAL,
    icon: 'fa-solid fa-heart',
    color: '#EC4899',
    card: xlCard,
    avatar: '',
    short: '开局与一人缔结羁绊，与对方互知身份',
    skill: '开局与一名乘客缔结羁绊（对方是真人时可自主选择对象，也可改），两人互知身份。你与羁绊对象都活到最后即获胜。',
    tip: '羁绊对象的阵营不一定和你相同 —— 先确认他站在哪一边。',
  },
  [ROLE.KAFKA]: {
    key: ROLE.KAFKA,
    name: '卡芙卡',
    job: '摄梦人',
    title: '中立派',
    camp: CAMP.NEUTRAL,
    icon: 'fa-solid fa-moon',
    color: '#6366F1',
    card: kfkCard,
    avatar: '',
    short: '每晚标记一人，连标两晚即处决',
    skill: '入梦时标记一名乘客。若连续两晚标记同一人，那人将被处决出梦境。',
    tip: '处决满两人即可达成自己的胜利条件，但别做得太明显。',
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
  // 开局准备期：全员缓冲（等人齐 / 昔涟选绑定），倒计时结束后进入第一夜
  PREP: 'prep',
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

// 各阶段默认时限（毫秒），帕姆按此倒计时自动推进。夜晚内部按角色分步走，NIGHT 只在整夜兜底时用
export const PHASE_MS = {
  // 准备期：看完牌点「确认身份」，全员确认就立刻入夜 —— 这个值只是兜底上限，
  // 用来保证有人掉线/挂机时全桌不会被永远卡在准备期（原为 10s，昔涟来不及挑羁绊对象）
  [PHASE.PREP]: 30000,
  [PHASE.NIGHT]: 60000,
  [PHASE.DAY]: 8000,      // 公布夜间结果，自动过场（单人模式可点「跳过」直接过）
  [PHASE.LAST_WORDS]: SPEAK_MS,
  [PHASE.SPEAKING]: SPEAK_MS,
  [PHASE.DISCUSS]: 60000,
  [PHASE.VOTE]: 30000,
  [PHASE.HUNTER]: 10000,
}

//  夜间分步
export const NIGHT_STEPS = ['wolf', 'seer', 'witch', 'firefly', 'kafka']

export const NIGHT_STEP_LABEL = {
  wolf: '银狼 · 骇入',
  seer: '瓦尔特 · 感应',
  witch: '姬子 · 调饮',
  firefly: '流萤 · 照亮',
  kafka: '卡芙卡 · 摄梦',
  done: '入梦结算',
}

// 每一步归谁管 —— 引擎据此判断「这一步该谁出手」（真人不在这一步就自动放行）
export const NIGHT_STEP_ROLE = {
  wolf: ROLE.WOLF,
  seer: ROLE.SEER,
  witch: ROLE.WITCH,
  firefly: ROLE.FIREFLY,
  kafka: ROLE.KAFKA,
}

// 每一步的限时（毫秒）。完成阶段需要时间 —— 想调节奏只改这一个表。
// 设定表：夜间每步统一 60s（原先 20/20/25/20s 偏紧，真人来不及读信息）
// 银狼本夜最多因为平票重投几次（引擎与视图共用，别两边各写一个数）
export const WOLF_REVOTE_MAX = 2

export const NIGHT_STEP_MS = {
  wolf: 60000,
  seer: 60000,
  witch: 60000,
  firefly: 60000,
  kafka: 60000,
}

//  人数配置表 
// 用「每个角色几张」描述，而不是写死身份数组 —— 这样特殊狼能随机二选一，改数量也不用重排数组。
// 规则：银狼 ≤2、特殊狼 0/1（不占银狼名额，额外 +1）、好人特殊各 1、平民 ≤4、流萤每局必出、
// 昔涟 9 人起、卡芙卡 10 人起。每行合计必须等于人数。
export const SETUPS_AI = {
  6:  { wolf: 1, specialWolf: 0, seer: 1, witch: 1, hunter: 1, villager: 1, firefly: 1, xilian: 0, kafka: 0 },
  7:  { wolf: 1, specialWolf: 0, seer: 1, witch: 1, hunter: 1, villager: 2, firefly: 1, xilian: 0, kafka: 0 },
  8:  { wolf: 1, specialWolf: 1, seer: 1, witch: 1, hunter: 1, villager: 2, firefly: 1, xilian: 0, kafka: 0 },
  9:  { wolf: 1, specialWolf: 1, seer: 1, witch: 1, hunter: 1, villager: 2, firefly: 1, xilian: 1, kafka: 0 },
  10: { wolf: 1, specialWolf: 1, seer: 1, witch: 1, hunter: 1, villager: 2, firefly: 1, xilian: 1, kafka: 1 },
  11: { wolf: 2, specialWolf: 1, seer: 1, witch: 1, hunter: 1, villager: 2, firefly: 1, xilian: 1, kafka: 1 },
  12: { wolf: 2, specialWolf: 1, seer: 1, witch: 1, hunter: 1, villager: 3, firefly: 1, xilian: 1, kafka: 1 },
}

// 本版本开放的「基本局」人数（联机最少要够这一档才开得起来）
export const BASE_TOTAL = 6

// 界面「选择对局人数」用：从小到大列出支持的人数
export const SUPPORTED_SIZES = Object.keys(SETUPS_AI).map(Number).sort((a, b) => a - b)
// 一局能开到多少人（= 上场表里最大那一档）。联机一桌的座位数上限就按它给，
// 否则联机永远被钉死在 6 人局 —— 白狼王 / 自爆狼 / 昔涟 / 卡芙卡 只在上场表 ≥9 人时才进身份池
export const MAX_TOTAL = SUPPORTED_SIZES[SUPPORTED_SIZES.length - 1]

//  身份池生成（流萤必出；特殊狼在白狼王 / 自爆狼中二选一随机） 
export function buildRolePool(totalCount) {
  const cfg = SETUPS_AI[totalCount] || SETUPS_AI[BASE_TOTAL]
  const pool = []
  const push = (role, n) => { for (let i = 0; i < (n || 0); i++) pool.push(role) }
  push(ROLE.WOLF, cfg.wolf)
  // 特殊狼最多 1 张，且随机二选一（两者共用 yl999 卡面，牌面会显示角色名，故不混淆）
  if (cfg.specialWolf > 0) push(Math.random() < 0.5 ? ROLE.WHITE_WOLF : ROLE.BOMB_WOLF, 1)
  push(ROLE.SEER, cfg.seer)
  push(ROLE.WITCH, cfg.witch)
  push(ROLE.HUNTER, cfg.hunter)
  push(ROLE.VILLAGER, cfg.villager)
  push(ROLE.FIREFLY, cfg.firefly)
  push(ROLE.XILIAN, cfg.xilian)
  push(ROLE.KAFKA, cfg.kafka)
  // 兜底：流萤机制必出；数量对不上时用平民补齐 / 截断
  if (!pool.includes(ROLE.FIREFLY)) pool.push(ROLE.FIREFLY)
  while (pool.length < totalCount) pool.push(ROLE.VILLAGER)
  return pool.slice(0, totalCount)
}

//  判定辅助 
export const isWolfRole = (roleKey) => ROLES[roleKey]?.camp === CAMP.HUNT

//  阵营统计 
// 口径是「狼 / 非狼」而非「狼 / 好人」：中立派（流萤等）计入 train 侧，
// 这样狼的 parity 判定（数够不够）不受中立派影响 —— 它们不算狼，也不共享好人的胜负奖励。
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
  // 中立派各自的条件奖励。常量先落位，引擎支持（昔涟绑定 / 卡芙卡处决计数）随之接入。
  XILIAN_BOND: 1500,         // 昔涟与绑定者都活到最后（绑定者同享）
  KAFKA_EXECUTE: 1200,       // 卡芙卡处决人数 ≥ 2
  QUIT_GRACE_MS: 3 * 60 * 1000,
}

//  流萤保护语义开关：true = 萤火只是「延迟一死」（被照亮者当晚不死，下一个梦醒仍会公布离场）
export const FIREFLY_DELAY_DEATH = true

// （原 passGracePeriod 已删：与 utils/werewolf.js:1855 逐字重复，
//   而全项目实际 import 的是 utils 那份（useWerewolfMatch.js:29）—— 2026-10-09 去重。
//   REWARDS.QUIT_GRACE_MS 仍被 utils 那份使用，常量保留。）

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
// 取素材目录里「不带 card」的小图随机分给 AI 乘客，刻意与身份无关（否则看头像就知道谁是银狼）
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
