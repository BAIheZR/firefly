const KEY = 'gomoku_profile'
const ADAPTIVE_KEY = 'gomoku_adaptive'
const VERSION = 1

// 趋势只看最近 12 局；太远古的战绩不该影响现在
const RECENT_MAX = 12
// 至少要打过这么多局，才谈得上「了解你」（少于这个数一律不调整，避免开局就乱变）
export const MIN_GAMES_FOR_ADAPT = 3
// 同一首手出现这么多次，才算「惯用开局」
const HABIT_MIN_COUNT = 3
// 方向偏好要占这么多比例才算「主导方向」
const HABIT_DIR_RATIO = 0.5
// 双威胁取胜达到这么多次 → 画像里标记「此人会用组合威胁」
const DOUBLE_THREAT_ALERT = 2

export function emptyProfile() {
  return {
    version: VERSION,
    games: 0,
    results: [],                 // 最近 RECENT_MAX 局：'human' | 'ai' | 'draw'
    humanWins: 0,
    aiWins: 0,
    draws: 0,
    openings: {},                // 玩家第 1 手 "r,c" → 次数
    openingDirs: [0, 0, 0, 0],   // 与 gomoku.js 的 DIRS 对齐：[0]横 [1]竖 [2]\ [3]/
    doubleThreatWins: 0,         // 玩家靠双威胁（活三组合/四三…）取胜的次数
    totalMoves: 0,               // 累计步数（用于算平均局步数）
    updatedAt: 0,
  }
}

function toNum(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function toObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

// 读取画像。任何异常都回退到空白画像，绝不让存档问题影响下棋
export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyProfile()
    const p = JSON.parse(raw)
    const base = emptyProfile()
    return {
      ...base,
      games: toNum(p.games),
      results: Array.isArray(p.results) ? p.results.slice(-RECENT_MAX) : [],
      humanWins: toNum(p.humanWins),
      aiWins: toNum(p.aiWins),
      draws: toNum(p.draws),
      openings: toObj(p.openings),
      openingDirs:
        Array.isArray(p.openingDirs) && p.openingDirs.length === 4
          ? p.openingDirs.map(toNum)
          : [0, 0, 0, 0],
      doubleThreatWins: toNum(p.doubleThreatWins),
      totalMoves: toNum(p.totalMoves),
      updatedAt: toNum(p.updatedAt),
    }
  } catch (e) {
    return emptyProfile()
  }
}

export function saveProfile(profile) {
  if (!profile) return
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...profile, version: VERSION, updatedAt: Date.now() })
    )
  } catch (e) {
    // 隐私模式 / 超出配额：静默失败，不影响对局本身
  }
}

export function resetProfile() {
  try {
    localStorage.removeItem(KEY)
  } catch (e) { /* ignore */ }
}

//  自适应开关（设备级偏好，不随存档槽走）
// 默认开启。关掉后 AI 完全按你选的难度来，不做任何升降档。
export function loadAdaptive() {
  try {
    const raw = localStorage.getItem(ADAPTIVE_KEY)
    return raw === null ? true : raw === '1'
  } catch (e) {
    return true
  }
}

export function saveAdaptive(on) {
  try {
    localStorage.setItem(ADAPTIVE_KEY, on ? '1' : '0')
  } catch (e) { /* ignore */ }
}

//  记录：开局首手 
// 玩家落第一手时调用，用于统计「惯用开局」
export function recordOpening(profile, r, c) {
  if (!profile || r == null || c == null) return profile
  const k = `${r},${c}`
  profile.openings[k] = (profile.openings[k] || 0) + 1
  return profile
}

//  记录：一局结束 
// winner: 'human' | 'ai' | 'draw'
// moves: 本局总步数
// winDirection: 玩家取胜那条线的方向索引（-1 表示未知/非玩家胜）
// byDoubleThreat: 玩家这局是否靠组合威胁（而非单纯连四）取胜
export function recordGame(profile, { winner, moves = 0, winDirection = -1, byDoubleThreat = false }) {
  if (!profile) return profile
  profile.games += 1
  profile.totalMoves += moves

  if (winner === 'human') profile.humanWins += 1
  else if (winner === 'ai') profile.aiWins += 1
  else profile.draws += 1

  if (winner === 'human') {
    if (byDoubleThreat) profile.doubleThreatWins += 1
    if (winDirection >= 0 && winDirection < 4) profile.openingDirs[winDirection] += 1
  }

  profile.results = [...profile.results, winner].slice(-RECENT_MAX)
  saveProfile(profile)
  return profile
}

//  分析：从画像里读出「该怎么调整 AI」
// 返回 { ready, humanRate, tierShift, habit, comboAware }
//   ready      画像是否已足够可信（局数够）
//   humanRate  最近一批对局的玩家胜率
//   tierShift  +1 加强 / 0 不变 / -1 收手
//   habit      { r, c, count, dir } 惯用开局点与主导方向；无习惯则为 null
//   comboAware 是否已学到「此人会用双威胁」
export function analyzeProfile(profile) {
  const idle = { ready: false, humanRate: 0, tierShift: 0, habit: null, comboAware: false }
  if (!profile) return idle
  const games = toNum(profile.games)
  if (games < MIN_GAMES_FOR_ADAPT) return idle

  const recent = (profile.results || []).slice(-RECENT_MAX)
  const humanWins = recent.filter((r) => r === 'human').length
  const humanRate = recent.length ? humanWins / recent.length : 0

  let tierShift = 0
  if (humanRate >= 0.7) tierShift = 1
  else if (humanRate <= 0.25) tierShift = -1

  return {
    ready: true,
    humanRate,
    tierShift,
    habit: buildHabit(profile),
    comboAware: toNum(profile.doubleThreatWins) >= DOUBLE_THREAT_ALERT,
  }
}

function buildHabit(profile) {
  const entries = Object.entries(toObj(profile.openings))
  if (!entries.length) return null
  entries.sort((a, b) => b[1] - a[1])
  const [key, count] = entries[0]
  if (count < HABIT_MIN_COUNT) return null

  const parts = String(key).split(',')
  const r = Number(parts[0])
  const c = Number(parts[1])
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null

  const dirs = profile.openingDirs || [0, 0, 0, 0]
  const sum = dirs.reduce((a, b) => a + b, 0)
  let dir = -1
  if (sum >= 4) {
    let mi = 0
    for (let i = 1; i < 4; i++) if (dirs[i] > dirs[mi]) mi = i
    if (dirs[mi] / sum >= HABIT_DIR_RATIO) dir = mi
  }
  return { r, c, count, dir }
}

//  给界面看的简短描述 
export function describeProfile(profile) {
  const a = analyzeProfile(profile)
  if (!a.ready) {
    const n = toNum(profile?.games)
    return `AI 正在观察你（已对局 ${n}/${MIN_GAMES_FOR_ADAPT}）`
  }
  const parts = [`最近胜率 ${Math.round(a.humanRate * 100)}%`]
  if (a.tierShift > 0) parts.push('AI 已加强')
  else if (a.tierShift < 0) parts.push('AI 已收手')
  else parts.push('强度持平')
  if (a.habit) {
    parts.push(`记住你的惯用开局 (${a.habit.r + 1},${a.habit.c + 1})`)
    if (a.habit.dir >= 0) parts.push(`方向:${['横', '竖', '斜\\', '斜/'][a.habit.dir]}`)
  }
  if (a.comboAware) parts.push('已提防你的组合威胁')
  return parts.join(' · ')
}
