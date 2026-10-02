import { analyzeProfile } from './gomokuProfile'

export const BOARD_SIZE = 15
// 联机棋盘路数（真人对战用大棋盘；单人对 AI 仍走 15 路）
export const MP_BOARD_SIZE = 32
export const EMPTY = 0
export const HUMAN = 1 // 黑棋（单人=玩家，联机=房主）
export const AI = 2    // 白棋（单人=AI，联机=加入者）

const DIRS = [
  [0, 1],   // 横向
  [1, 0],   // 纵向
  [1, 1],   // \ 斜
  [1, -1],  // / 斜
]

//  胜负判定 
export function checkWin(board, row, col, player, size = BOARD_SIZE) {
  for (const [dr, dc] of DIRS) {
    let count = 1
    for (let s = 1; s < 5; s++) {
      const r = row + dr * s, c = col + dc * s
      if (r < 0 || r >= size || c < 0 || c >= size) break
      if (board[r][c] !== player) break
      count++
    }
    for (let s = 1; s < 5; s++) {
      const r = row - dr * s, c = col - dc * s
      if (r < 0 || r >= size || c < 0 || c >= size) break
      if (board[r][c] !== player) break
      count++
    }
    if (count >= 5) return true
  }
  return false
}

export function isBoardFull(board, size = BOARD_SIZE) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY) return false
    }
  }
  return true
}

// 判定这一手取胜的性质（dir 取胜线方向索引，doubleThreat 是否为组合威胁取胜）
// 必须在棋子已落到盘上之后调用
export function classifyWin(board, r, c, player, size = BOARD_SIZE) {
  const info = moveInfo(board, r, c, player, size)
  let dir = -1
  for (let i = 0; i < DIRS.length; i++) {
    if (info.levels[i] === LV_FIVE) { dir = i; break }
  }
  const doubleThreat =
    info.four >= 2 || (info.four >= 1 && info.openThree >= 1) || info.openThree >= 2
  return { dir, doubleThreat }
}

export function createBoard(size = BOARD_SIZE) {
  return Array.from({ length: size }, () => new Array(size).fill(EMPTY))
}

// 棋型识别

// 棋型等级：数字越小越强，决策阶梯直接按等级比较
const LV_FIVE = 0
const LV_OPEN_FOUR = 1
const LV_FOUR = 2
const LV_OPEN_THREE = 3
const LV_THREE = 4
const LV_OPEN_TWO = 5
const LV_TWO = 6
const LV_ONE = 7
const LV_NONE = 8

// 按「从强到弱」顺序匹配，命中最强的即返回，不累加
// 窗口固定 9 格：o=自己，x=对手或边界，.=空，中心一定是 o
const SHAPES = [
  { level: LV_FIVE, score: 10000000, re: /ooooo/ },
  { level: LV_OPEN_FOUR, score: 1000000, re: /\.oooo\./ },
  // 冲四：一头被堵的四，以及跳四（填中间那格就成五）
  { level: LV_FOUR, score: 60000, re: /xoooo\.|\.oooox|o\.ooo|oo\.oo|ooo\.o/ },
  // 活三：两头都空的连三，以及跳三
  { level: LV_OPEN_THREE, score: 12000, re: /\.ooo\.\.|\.\.ooo\.|\.o\.oo\.|\.oo\.o\./ },
  // 眠三：一头被堵的三（还能变成冲四）
  { level: LV_THREE, score: 1200, re: /xooo\.\.|\.\.ooox|xo\.oo\.|\.oo\.ox|xoo\.o\.|\.o\.oox|oo\.\.o|o\.\.oo/ },
  { level: LV_OPEN_TWO, score: 600, re: /\.oo\.\.|\.\.oo\.|\.o\.o\./ },
  { level: LV_TWO, score: 80, re: /xoo\.\.|\.\.oox|xo\.o\.|\.o\.ox/ },
  { level: LV_ONE, score: 10, re: /\.o\./ },
  // 兜底项必须留着：SHAPE_SCORE 要能索引到 LV_NONE，否则分数会加出 NaN
  { level: LV_NONE, score: 0, re: null },
]

// 复用正则实例，避免每次调用都 new RegExp
const SHAPE_REGEX = SHAPES.map((s) => (s.re ? new RegExp(s.re.source, 'g') : null))
const SHAPE_SCORE = SHAPES.map((s) => s.score)

// 在 9 格窗口里找该棋型，且必须含中心格（index 4）
function hitsCenter(w, re) {
  re.lastIndex = 0
  let m
  while ((m = re.exec(w)) !== null) {
    if (m.index <= 4 && m.index + m[0].length > 4) return true
    if (m[0].length === 0) re.lastIndex++
  }
  return false
}

// 取以 (r,c) 为中心、沿 (dr,dc) 方向的 9 格窗口，出界当堵头
function windowAt(board, r, c, dr, dc, player, size) {
  let w = ''
  for (let i = -4; i <= 4; i++) {
    if (i === 0) {
      w += 'o'
      continue
    }
    const rr = r + dr * i
    const cc = c + dc * i
    if (rr < 0 || rr >= size || cc < 0 || cc >= size) {
      w += 'x'
      continue
    }
    const v = board[rr][cc]
    w += v === EMPTY ? '.' : v === player ? 'o' : 'x'
  }
  return w
}

function levelOfWindow(w) {
  for (let i = 0; i < SHAPES.length; i++) {
    // 最后一项（LV_NONE）没有正则，跳过
    if (SHAPE_REGEX[i] && hitsCenter(w, SHAPE_REGEX[i])) return i
  }
  return LV_NONE
}

// 评估「把 player 的棋子下在 (r,c)」这一手：四个方向的棋型等级 + 威胁组数
export function moveInfo(board, r, c, player, size = BOARD_SIZE) {
  const levels = [0, 0, 0, 0]
  let score = 0
  for (let i = 0; i < DIRS.length; i++) {
    const [dr, dc] = DIRS[i]
    const lv = levelOfWindow(windowAt(board, r, c, dr, dc, player, size))
    levels[i] = lv
    score += SHAPE_SCORE[lv]
  }

  let five = false
  let openFour = 0
  let four = 0
  let openThree = 0
  for (const lv of levels) {
    if (lv === LV_FIVE) five = true
    else if (lv === LV_OPEN_FOUR) {
      openFour++
      four++
    } else if (lv === LV_FOUR) four++
    else if (lv === LV_OPEN_THREE) openThree++
  }

  // 「已成杀」= 对手挡不住：活四 / 双四 / 四三 / 双活三
  const winning =
    five || openFour >= 1 || four >= 2 || (four >= 1 && openThree >= 1) || openThree >= 2

  return { levels, score, five, openFour, four, openThree, winning }
}

/* ═══════════════════ 候选与排序 ═══════════════════ */

/** 只枚举已有棋子周围 radius 圈内的空点，并按威胁分数从高到低排好 */
function rankedMoves(board, size, player, radius) {
  const out = []
  const seen = new Set()
  let anyStone = false

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY) continue
      anyStone = true
      for (let dr = -radius; dr <= radius; dr++) {
        const nr = r + dr
        if (nr < 0 || nr >= size) continue
        for (let dc = -radius; dc <= radius; dc++) {
          const nc = c + dc
          if (nc < 0 || nc >= size) continue
          if (board[nr][nc] !== EMPTY) continue
          const key = nr * size + nc
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ r: nr, c: nc, info: moveInfo(board, nr, nc, player, size) })
        }
      }
    }
  }

  const mid = Math.floor(size / 2)
  if (!anyStone) return [{ r: mid, c: mid, info: moveInfo(board, mid, mid, player, size) }]
  // 兜底：棋子全被围死时，退回全盘找空点，绝不返回空
  if (!out.length) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] === EMPTY) out.push({ r, c, info: moveInfo(board, r, c, player, size) })
      }
    }
  }

  for (const m of out) m.score = m.info.score
  out.sort((a, b) => b.score - a.score)
  return out
}

function scoreAt(moves, r, c) {
  for (const m of moves) {
    if (m.r === r && m.c === c) return m.score
  }
  return 0
}

// 从对手的威胁点里挑一个去堵，同样能堵住时优先选「我下在那里自己也能成型」的点
function chooseBlock(threats, mine, rng) {
  let best = threats[0]
  let bestVal = -Infinity
  let tied = []
  for (const t of threats) {
    const val = t.score + scoreAt(mine, t.r, t.c) * 0.9
    if (val > bestVal + 1e-6) {
      bestVal = val
      best = t
      tied = [t]
    } else if (Math.abs(val - bestVal) <= 1e-6) {
      tied.push(t)
    }
  }
  return tied.length > 1 ? tied[Math.floor(rng() * tied.length)] : best
}

/** 同分/近分里按 seed 挑一个，让同一局面在不同局里有不同应手（但局内确定） */
function pickVaried(list, rng, noise) {
  if (!list.length) return null
  const sorted = list.slice().sort((a, b) => b.score - a.score)
  if (noise > 0) {
    const top = sorted[0].score
    const floor = top > 0 ? top * (1 - noise) : top
    const band = sorted.filter((m) => m.score >= floor)
    if (band.length > 1) return band[Math.floor(rng() * band.length)]
    return sorted[0]
  }
  const ties = sorted.filter((m) => m.score === sorted[0].score)
  return ties.length > 1 ? ties[Math.floor(rng() * ties.length)] : sorted[0]
}

// 难度档位

// 每档只开放「它这个水平该有的视野」：挡五（对手下一手能连五）任何难度都必须堵，
// 预防性挡四（对手某点能造出四）只有 normal / hard 才会，简单档不给
const PROFILES = {
  easy: {
    radius: 1,
    blockThreat: false,     // ★ 不预防：你做成活三它不管，直到你真成四才堵五
    blockOpenThree: false,
    buildFour: false,       // 不主动造四/成杀，不追着你打
    buildThree: true,       // 但会做活三，你不理它它也能赢
    buildWin: false,
    seeDoubleThreat: false,
    avoidRisky: false,
    forcedSearch: false,
    readOpponent: false,    // ★ 静默局面下不读对手，只管自己下
    attack: 0.9,
    defense: 0,
    noise: 0.45,
  },
  normal: {
    radius: 2,
    blockThreat: true,      // 会预防性堵四 —— 等价于「会挡活三」
    blockOpenThree: true,
    buildFour: true,
    buildThree: true,
    buildWin: true,
    seeDoubleThreat: false, // ★ 不做自查，会被「两步组合」打死
    avoidRisky: false,
    forcedSearch: false,    // ★ 算不出「冲四逼应 → 再杀」这条链路
    readOpponent: true,
    attack: 1,
    defense: 1,
    noise: 0.12,
  },
  hard: {
    radius: 2,
    blockThreat: true,
    blockOpenThree: true,
    buildFour: true,
    buildThree: true,
    buildWin: true,
    seeDoubleThreat: true,  // 挡点时优先掐最危险的「组合点」
    avoidRisky: true,       // 落子前先验一层：这一手会不会把机会让给你
    search: true,           // ★ 开威胁空间搜索：主动算 VCF / VCT 连杀（困难档的主要强度来源）
    forcedSearch: true,     // 防守端也做两段杀自查（见 decide 步骤 7b）
    readOpponent: true,
    attack: 1,
    defense: 1.1,
    noise: 0,
  },
}

// 对手画像 → 实际档位

// 档位从弱到强，resolveProfile 用它做上下移动
const ORDER = ['easy', 'normal', 'hard']

// 把「用户选的难度」+「对手画像」合成这一局真正使用的档位：
// 按最近胜率整体升降一档（自适应）、按惯用套路微调落点、被反复双威胁取胜时保留 seeDoubleThreat
export function resolveProfile(difficulty, profile, opts = {}) {
  const adaptive = opts.adaptive !== false
  const key = ORDER.includes(difficulty) ? difficulty : 'normal'
  const baseIdx = ORDER.indexOf(key)

  const a = adaptive && profile
    ? analyzeProfile(profile)
    : { ready: false, tierShift: 0, habit: null, comboAware: false }

  const shift = a.ready ? a.tierShift : 0
  const idx = Math.max(0, Math.min(ORDER.length - 1, baseIdx + shift))
  const prof = {
    ...PROFILES[ORDER[idx]],
    baseDifficulty: key,
    effectiveDifficulty: ORDER[idx],
    tierShift: shift,
    habit: a.habit || null,
  }

  // 被「学习」出来的防守能力：只在不低于 normal 档时解锁「看得见双威胁」（放在 easy 上会喧宾夺主）
  if (a.comboAware && ORDER.indexOf(prof.effectiveDifficulty) >= ORDER.indexOf('normal')) {
    prof.seeDoubleThreat = true
  }
  return prof
}

// 反制「惯用套路」：给候选点加一点分，让 AI 主动去挤占你常落的区域 / 封你惯用的方向。
// 量级刻意压得很小（几十~一百多），只在局面静默、没有真正威胁时才起作用
function habitBonus(habit, board, size, r, c) {
  if (!habit) return 0
  let bonus = 0

  // ① 惯用开局点附近：距离越近加分越高（早期候选点少，这个效果在开局最明显）
  const dist = Math.abs(r - habit.r) + Math.abs(c - habit.c)
  if (dist <= 3) bonus += (4 - dist) * 30

  // ② 主导方向：这一手若正好压在你惯用连子方向的延长线上，再加一份
  if (habit.dir >= 0) {
    const [dr, dc] = DIRS[habit.dir]
    let touch = 0
    for (const sgn of [1, -1]) {
      for (let k = 1; k <= 2; k++) {
        const rr = r + dr * sgn * k
        const cc = c + dc * sgn * k
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) break
        if (board[rr][cc] === HUMAN) touch++
        else break
      }
    }
    bonus += touch * 25
  }
  return bonus
}

// 我落子后，对手是否立刻拿到成杀 / 冲四机会（hard 的廉价自查，先用它过一遍）
function isRisky(board, r, c, size) {
  board[r][c] = AI
  const opp = rankedMoves(board, size, HUMAN, 2)
  const bad = opp.some((m) => m.info.winning || m.info.four > 0)
  board[r][c] = EMPTY
  return bad
}

// 两段杀搜索（hard 专用）

// 只在 hard 上开：算「造四 → 对手唯一应手 → 再杀」这条链路，normal 看不到这种两手组合
function otherOf(player) {
  return player === AI ? HUMAN : AI
}

function fivePointsOf(board, size, player) {
  return rankedMoves(board, size, player, 2).filter((m) => m.info.five)
}

// 轮到我走，能否在 depth 手内强制取胜；赢不了返回 null，制胜则返回第一手坐标
export function findForcedWin(board, size, player, depth = 2, budget = { n: 40 }) {
  if (depth <= 0 || budget.n <= 0) return null
  budget.n--
  const opp = otherOf(player)
  const mine = rankedMoves(board, size, player, 2)

  // 能直接连五
  const five = mine.find((m) => m.info.five)
  if (five) return five

  // 一手成杀（活四 / 双四 / 四三 / 双三）—— 前提是对手没有更快的连五
  const win = mine.find((m) => m.info.winning)
  if (win) {
    board[win.r][win.c] = player
    const oppCanWin = fivePointsOf(board, size, opp).length > 0
    board[win.r][win.c] = EMPTY
    if (!oppCanWin) return win
  }

  // 对手已有连五点：我的冲四「逼不住」他，算下去只会把「对手赢」当成「我能赢」
  if (fivePointsOf(board, size, opp).length > 0) return null

  // 逐步：我造四 → 我只有唯一成五点 → 对手被迫堵这一点 → 接着算下一层
  // 这里数的必须是「我自己的成五点」：改数对手的成五点，整条序列会建在错误前提上
  const forcing = mine.filter((m) => m.info.four > 0)
  for (const m of forcing) {
    if (budget.n <= 0) break
    board[m.r][m.c] = player
    const myFive = fivePointsOf(board, size, player)
    if (myFive.length === 1) {
      const block = myFive[0]
      board[block.r][block.c] = opp
      const next = findForcedWin(board, size, player, depth - 1, budget)
      board[block.r][block.c] = EMPTY
      board[m.r][m.c] = EMPTY
      if (next) return m
      continue
    }
    // 我有 0 个或 ≥2 个成五点：这一手不构成「唯一应手」的强制序列
    board[m.r][m.c] = EMPTY
  }
  return null
}

// 威胁空间搜索（困难档专用）

// 补上「连续威胁」这条链路：VCF 连续冲四取胜、VCT 连续威胁取胜（允许用活三当威胁）。
// 递归全受「节点预算 + 时间预算」双重限制，超限立即放弃，宁可少算一手也不卡住界面
const SEARCH_LIMITS = {
  depth: 6,        // 迭代加深的最大深度（每层 = 一手交换）
  tWidth: 8,       // 每层最多考察的威胁手数
  vctWidth: 3,     // 每层最多展开的活三手数（VCT 是主要开销，单独限流）
  replyWidth: 3,   // VCT 中对手最多考虑的应手数
  nodes: 220,      // 总节点预算
  timeMs: 500,     // 总时间预算（毫秒）
  radius: 1,       // 候选搜索半径。取 1 而非 2：威胁点必在邻格，候选量只有半径 2 的约 1/3
}

// 只保留「能造威胁」的候选手：直接赢 / 成杀 / 冲四 / 活三
function threatMoves(board, size, player, habit, width, radius = SEARCH_LIMITS.radius) {
  let list = rankedMoves(board, size, player, radius).filter(
    (m) => m.info.five || m.info.winning || m.info.four > 0 || m.info.openThree > 0
  )
  if (habit) {
    // 习惯反制同样参与排序：同一批威胁手里，优先选「正好压在你惯用方向/开局」的那手
    list = list.map((m) => ({ ...m, score: m.score + habitBonus(habit, board, size, m.r, m.c) }))
    list.sort((a, b) => b.score - a.score)
  }
  return width ? list.slice(0, width) : list
}

// VCT 中「对手面对我的威胁时真正需要考虑的应手」：① 能封住我下一步成杀/造四的点，
// ② 对手自己能立刻反杀的点。取并集而非穷举，这是威胁空间搜索的核心近似
function forcedReplies(board, size, opp, width) {
  const me = otherOf(opp)
  const blocks = rankedMoves(board, size, me, SEARCH_LIMITS.radius)
    .filter((m) => m.info.five || m.info.winning || m.info.four > 0)
    .slice(0, width)
  const counters = rankedMoves(board, size, opp, SEARCH_LIMITS.radius)
    .filter((m) => m.info.five || m.info.four > 0)
    .slice(0, width)
  const map = new Map()
  for (const m of [...blocks, ...counters]) map.set(m.r * size + m.c, m)
  return [...map.values()]
}

// 威胁空间搜索：轮到我走，能否在 depth 层内强制取胜，赢不了返回 null。
// 强制手的前提是「对手不得不应」—— 一手若不能迫使对手唯一应对，直接跳过
function threatSearch(board, size, player, depth, ctx, habit) {
  if (depth <= 0 || ctx.budget.n <= 0) return null
  if (Date.now() > ctx.deadline) return null
  ctx.budget.n--

  const opp = otherOf(player)
  const my = threatMoves(board, size, player, habit, SEARCH_LIMITS.tWidth)
  if (!my.length) return null

  // 1. 直接连五
  const five = my.find((m) => m.info.five)
  if (five) return five

  // 2. 对手已有连五点 → 先手权在对方，保守返回 null，不把「对手先赢」误判成「我能赢」
  if (fivePointsOf(board, size, opp).length > 0) return null

  // 3. 一手成杀（活四 / 双四 / 四三 / 双三），且这一手不能反而把连五点送给对手
  for (const m of my.filter((x) => x.info.winning)) {
    board[m.r][m.c] = player
    const oppCanFive = fivePointsOf(board, size, opp).length > 0
    board[m.r][m.c] = EMPTY
    if (!oppCanFive) return m
  }

  // 4. VCF：造四 → 我的成五点唯一 → 对手被迫堵那一点 → 递归下一层
  for (const m of my.filter((x) => x.info.four > 0)) {
    if (ctx.budget.n <= 0 || Date.now() > ctx.deadline) break
    board[m.r][m.c] = player
    const myFives = fivePointsOf(board, size, player)
    let ok = false
    if (myFives.length === 1) {
      const b = myFives[0]
      // 成五点若就是刚落下的这手，说明已经连五（步骤 1 已处理），跳过
      if (!(b.r === m.r && b.c === m.c)) {
        board[b.r][b.c] = opp
        ok = !!threatSearch(board, size, player, depth - 1, ctx, habit)
        board[b.r][b.c] = EMPTY
      }
    } else if (myFives.length >= 2) {
      // 活四 / 双四：对手只堵得了一头。此处能安全判胜，
      // 因为步骤 2 已保证对手此刻没有连五点（我落子只会减少、不会增加对手的成五点）。
      ok = true
    }
    board[m.r][m.c] = EMPTY
    if (ok) return m
  }

  // 5. VCT：造活三 → 对手应手有限 → 要求「每一种应手我都能赢」才算我赢。
  //    深度门槛 ≥3：两层展开不了「三 → 四 → 五」这条链。
  if (depth >= 3) {
    const threes = my.filter((x) => x.info.openThree >= 1).slice(0, SEARCH_LIMITS.vctWidth)
    for (const m of threes) {
      if (ctx.budget.n <= 0 || Date.now() > ctx.deadline) break
      board[m.r][m.c] = player
      const replies = forcedReplies(board, size, opp, SEARCH_LIMITS.replyWidth)
      let allWin = replies.length > 0
      for (const rp of replies) {
        if (rp.r === m.r && rp.c === m.c) { allWin = false; break }
        board[rp.r][rp.c] = opp
        const sub = threatSearch(board, size, player, depth - 1, ctx, habit)
        board[rp.r][rp.c] = EMPTY
        if (!sub) { allWin = false; break }
      }
      board[m.r][m.c] = EMPTY
      if (allWin) return m
    }
  }
  return null
}

/** 对外入口：迭代加深地找制胜手。浅层没解就别浪费时间往深算。 */
function searchWin(board, size, habit) {
  const ctx = {
    budget: { n: SEARCH_LIMITS.nodes },
    deadline: Date.now() + SEARCH_LIMITS.timeMs,
  }
  for (let d = 2; d <= SEARCH_LIMITS.depth; d += 2) {
    const res = threatSearch(board, size, AI, d, ctx, habit)
    if (res) return res
    if (ctx.budget.n <= 0 || Date.now() > ctx.deadline) break
  }
  return null
}

// 随机源

// 由 seed 决定的确定性随机，同 seed 同序列 → 局内不会换手
function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9
  return function rng() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 决策阶梯

// 阶梯顺序（每档允许走到第几级不同）：1 我自己能连五 → 2 对手下一手能连五必须堵 →
// 3 我自己能成杀 → 4 对手能成杀堵最危险组合点 → 5 对手能造四预防性堵 → 6 我做活三/冲四 → 7 静默按分数选点
function decide(board, prof, size, rng) {
  const mine = rankedMoves(board, size, AI, prof.radius)
  const theirs = rankedMoves(board, size, HUMAN, prof.radius)

  // 1. 能赢就赢
  const win = mine.find((m) => m.info.five)
  if (win) return [win.r, win.c]

  // 2. 对手下一手能连五 → 堵（任何难度都不能省，否则会显得「蠢」而不是「弱」）
  const oppFive = theirs.filter((m) => m.info.five)
  if (oppFive.length) {
    const b = chooseBlock(oppFive, mine, rng)
    return [b.r, b.c]
  }

  // 3. 自己能成杀（活四 / 双四 / 四三 / 双三）
  if (prof.buildWin) {
    const w = mine.find((m) => m.info.winning)
    if (w) return [w.r, w.c]
  }

  // 3b. hard 的正式算杀：威胁空间搜索（VCF + VCT，迭代加深），能算两步以上的强制链
  if (prof.search) {
    const fw = searchWin(board, size, prof.habit)
    if (fw) return [fw.r, fw.c]
  }

  // 4. 对手能成杀 → hard 单独走这一级：先掐组合点，再退回通用的挡四
  if (prof.seeDoubleThreat) {
    const t = theirs.filter((m) => m.info.winning)
    if (t.length) {
      const b = chooseBlock(t, mine, rng)
      return [b.r, b.c]
    }
  }

  // 5. 预防性防守：对手能造四的点（含活三的延伸点）
  if (prof.blockThreat) {
    const t = theirs.filter((m) => m.info.four > 0)
    if (t.length) {
      const b = chooseBlock(t, mine, rng)
      return [b.r, b.c]
    }
    const t3 = prof.blockOpenThree ? theirs.filter((m) => m.info.openThree > 0) : []
    if (t3.length) {
      const b = chooseBlock(t3, mine, rng)
      return [b.r, b.c]
    }
  }

  // 6. 进攻：自己做活三 / 冲四
  const attacks = mine.filter(
    (m) => (prof.buildFour && m.info.four > 0) || (prof.buildThree && m.info.openThree > 0)
  )
  const atk = pickVaried(attacks, rng, prof.noise)
  if (atk) return [atk.r, atk.c]

  // 7. 静默局面：攻守加权选点（堵对手的好点 = 自己占住它），再叠一份「反制惯用套路」的加成
  const scored = mine.map((m) => ({
    ...m,
    score:
      m.info.score * prof.attack +
      (prof.readOpponent ? scoreAt(theirs, m.r, m.c) * prof.defense : 0) +
      habitBonus(prof.habit, board, size, m.r, m.c),
  }))
  scored.sort((a, b) => b.score - a.score)

  // 7b. hard：在小范围内试一手，看会不会把机会送给对手
  if (prof.avoidRisky) {
    const head = scored.slice(0, 8)
    const safe = head.filter((m) => !isRisky(board, m.r, m.c, size))
    let pool = safe.length ? safe : head

    // hard 再验一层：我这一手下去，你会不会立刻形成「两段杀」
    if (prof.forcedSearch) {
      const deeper = pool.slice(0, 5).filter((m) => {
        board[m.r][m.c] = AI
        const youWin = findForcedWin(board, size, HUMAN, 2, { n: 16 })
        board[m.r][m.c] = EMPTY
        return !youWin
      })
      if (deeper.length) pool = deeper
    }

    const p = pickVaried(pool, rng, prof.noise)
    if (p) return [p.r, p.c]
  }

  const picked = pickVaried(scored, rng, prof.noise)
  if (picked) return [picked.r, picked.c]

  // 兜底：随便挑一个空点，绝不返回 null（调用方拿到 null 会直接卡住不出手）
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY) return [r, c]
    }
  }
  return [0, 0]
}

// 对外入口

// 取 AI 的下一手。options：size 棋盘路数、seed 每局生成一次、moveCount 当前手数、
// profile 对手画像、adaptive 是否启用自适应升降档；返回 [row, col]，满盘无子可下时返回 null
export function getAIMove(board, difficulty = 'normal', options = {}) {
  const size = options.size || board.length || BOARD_SIZE
  // 由「用户选的难度 + 对手画像」合成这一手的实际档位
  const prof = resolveProfile(difficulty, options.profile || null, {
    adaptive: options.adaptive !== false,
  })
  const rng = makeRng(((options.seed || 0) ^ ((options.moveCount || 0) * 0x9e3779b1)) >>> 0)

  try {
    const move = decide(board, prof, size, rng)
    // 最后一道保险：调用方落子前会校验空点，返回重复点等于这一轮不出手
    if (Array.isArray(move) && board[move[0]] && board[move[0]][move[1]] === EMPTY) {
      return move
    }
  } catch (err) {
    console.error('[gomoku] AI 决策异常，退化为随机空点', err)
  }

  const mid = Math.floor(size / 2)
  if (board[mid] && board[mid][mid] === EMPTY) return [mid, mid]
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY) return [r, c]
    }
  }
  // 满盘 = 已和棋，没有合法落点，返回 null 而不是占位坐标（调用方已判 null）
  return null
}
