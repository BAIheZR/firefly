// 五子棋 AI 与核心规则（棋盘 15×15）
// 约定：board[row][col]，0=空，1=黑（玩家），2=白（AI）
// 难度：easy / normal / hard

export const BOARD_SIZE = 15
// 联机棋盘路数（真人对战用大棋盘；单人对 AI 仍走 15 路）
export const MP_BOARD_SIZE = 32
export const EMPTY = 0
export const HUMAN = 1 // 黑棋（单人=玩家，联机=房主）
export const AI = 2    // 白棋（单人=AI，联机=加入者）

// 说明：以下三个基础函数支持自定义路数 size，默认 15 路（保持单人行为不变）。
// getAIMove 仅用于单人对 AI，固定按 BOARD_SIZE 计算，未参数化。

// ===== 胜负判定 =====
export function checkWin(board, row, col, player, size = BOARD_SIZE) {
  const dirs = [
    [0, 1],   // 横向
    [1, 0],   // 纵向
    [1, 1],   // \ 斜
    [1, -1],  // / 斜
  ]
  for (const [dr, dc] of dirs) {
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

export function createBoard(size = BOARD_SIZE) {
  return Array.from({ length: size }, () => new Array(size).fill(EMPTY))
}

// ===== 候选点生成：只枚举已有棋子周围 radius 内的空点 =====
function generateCandidates(board, radius = 2) {
  const set = new Set()
  let anyStone = false
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === EMPTY) continue
      anyStone = true
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue
          if (board[nr][nc] !== EMPTY) continue
          set.add(nr * BOARD_SIZE + nc)
        }
      }
    }
  }
  if (!anyStone) {
    const mid = Math.floor(BOARD_SIZE / 2)
    return [[mid, mid]]
  }
  return Array.from(set).map(v => [Math.floor(v / BOARD_SIZE), v % BOARD_SIZE])
}

// ===== 评分：按型计算（连5/活4/眠4/活3/眠3/活2/眠2） =====
// 对每个方向统计 [player连子数, 左右两端是否为空/边界/对手]：
//   两端空=活、一端空=眠、两端堵=0分
const SHAPE_SCORE = {
  FIVE: 10000000,
  OPEN_FOUR: 1000000,
  FOUR: 50000,   // 冲四 / 眠四
  OPEN_THREE: 10000,
  THREE: 800,    // 眠三
  OPEN_TWO: 500,
  TWO: 80,       // 眠二
  OPEN_ONE: 10,
  ONE: 2,
}

function evalLine(cells, player) {
  // cells: length 9, centered on candidate. 但我们用完整直线扫描。
  // 改为简单方案：对每个方向沿整条线扫，用正则化 "xxoxooox.." 匹配型。
  // 这里用"滑动窗口"——把线转成字符串（.=空, 1=黑, 2=白），匹配 player 的型。
  let score = 0
  const self = String(player)
  const opp = String(player === 1 ? 2 : 1)
  const line = cells.map(v => v === 0 ? '.' : (v === player ? self : 'x')).join('')
  const patterns = [
    { re: new RegExp(`${self}{5}`),                  score: SHAPE_SCORE.FIVE },
    { re: new RegExp(`\\.${self}{4}\\.`),            score: SHAPE_SCORE.OPEN_FOUR },
    { re: new RegExp(`(x)${self}{4}\\.|\\.${self}{4}(x)`), score: SHAPE_SCORE.FOUR },
    { re: new RegExp(`\\.${self}{3}\\.`),            score: SHAPE_SCORE.OPEN_THREE },
    { re: new RegExp(`x${self}{3}\\.\\.`),           score: SHAPE_SCORE.THREE },
    { re: new RegExp(`\\.\\.${self}{3}x`),           score: SHAPE_SCORE.THREE },
    { re: new RegExp(`\\.${self}{2}\\.`),            score: SHAPE_SCORE.OPEN_TWO },
    { re: new RegExp(`\\.${self}\\.`),               score: SHAPE_SCORE.OPEN_ONE },
  ]
  for (const p of patterns) {
    const m = line.match(p.re)
    if (m) score += p.score
  }
  return score
  // avoid unused vars warnings
  void opp
}

function getLines(board) {
  const lines = []
  // 行
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row = []
    for (let c = 0; c < BOARD_SIZE; c++) row.push(board[r][c])
    lines.push(row)
  }
  // 列
  for (let c = 0; c < BOARD_SIZE; c++) {
    const col = []
    for (let r = 0; r < BOARD_SIZE; r++) col.push(board[r][c])
    lines.push(col)
  }
  // 左下 -> 右上（\）
  for (let k = 0; k < 2 * BOARD_SIZE - 1; k++) {
    const diag = []
    for (let r = 0; r < BOARD_SIZE; r++) {
      const c = k - r
      if (c >= 0 && c < BOARD_SIZE) diag.push(board[r][c])
    }
    if (diag.length >= 5) lines.push(diag)
  }
  // 右下 -> 左上（/）
  for (let k = 0; k < 2 * BOARD_SIZE - 1; k++) {
    const diag = []
    for (let r = 0; r < BOARD_SIZE; r++) {
      const c = r - (BOARD_SIZE - 1 - k)
      if (c >= 0 && c < BOARD_SIZE) diag.push(board[r][c])
    }
    if (diag.length >= 5) lines.push(diag)
  }
  return lines
}

// 局面评估：AI(HUMAN) - 对手，用于 minimax / 贪心
// attackWeight/defenseWeight：难度调进攻与防守权重
function evaluateBoard(board, attackWeight = 1, defenseWeight = 1) {
  const lines = getLines(board)
  let aiScore = 0, huScore = 0
  for (const ln of lines) {
    aiScore += evalLine(ln, AI)
    huScore += evalLine(ln, HUMAN)
  }
  // 当玩家有活四/冲四，防守必须放大权重（硬阻止）
  if (huScore >= SHAPE_SCORE.OPEN_FOUR) defenseWeight = Math.max(defenseWeight, 100)
  return Math.round(aiScore * attackWeight - huScore * defenseWeight)
}

// ===== 不同难度 =====

// 简单：80% 走"玩家棋子旁边的空"，20% 随机；偶尔挡玩家
function pickEasy(board) {
  const cands = generateCandidates(board, 1)
  // 20% 纯随机（从候选里抽）
  if (Math.random() < 0.2) {
    return cands[Math.floor(Math.random() * cands.length)]
  }
  // 80% 贪心：评估时偏随机（评估 + 小噪声）
  let best = cands[0], bestS = -Infinity
  for (const [r, c] of cands) {
    board[r][c] = AI
    const s = evaluateBoard(board, 0.6, 0.8) + Math.random() * 300
    board[r][c] = EMPTY
    if (s > bestS) { bestS = s; best = [r, c] }
  }
  return best
}

// 平常：纯启发式贪心，攻守平衡
function pickNormal(board) {
  const cands = generateCandidates(board, 2)
  let best = cands[0], bestS = -Infinity
  for (const [r, c] of cands) {
    board[r][c] = AI
    const s = evaluateBoard(board, 1, 1)
    board[r][c] = EMPTY
    if (s > bestS) { bestS = s; best = [r, c] }
  }
  return best
}

// 难：Minimax 深度 2 + Alpha-Beta 剪枝 + 候选点取 Top-N
function pickHard(board) {
  const cands = generateCandidates(board, 2)
  // 快速评估取前 10 个候选，降低搜索复杂度
  const scored = cands.map(([r, c]) => {
    board[r][c] = AI
    const s = evaluateBoard(board, 1, 1.1)
    board[r][c] = EMPTY
    return { r, c, s }
  })
  scored.sort((a, b) => b.s - a.s)
  const top = scored.slice(0, 10).map(x => [x.r, x.c])

  function minimax(depth, isMax, alpha, beta) {
    if (depth === 0) return evaluateBoard(board, 1, 1.2)
    const cs = isMax ? top : generateCandidates(board, 2).slice(0, 8)
    if (cs.length === 0) return evaluateBoard(board, 1, 1.2)
    if (isMax) {
      let value = -Infinity
      for (const [r, c] of cs) {
        if (board[r][c] !== EMPTY) continue
        board[r][c] = AI
        value = Math.max(value, minimax(depth - 1, false, alpha, beta))
        board[r][c] = EMPTY
        alpha = Math.max(alpha, value)
        if (alpha >= beta) break
      }
      return value
    } else {
      let value = Infinity
      for (const [r, c] of cs) {
        if (board[r][c] !== EMPTY) continue
        board[r][c] = HUMAN
        value = Math.min(value, minimax(depth - 1, true, alpha, beta))
        board[r][c] = EMPTY
        beta = Math.min(beta, value)
        if (alpha >= beta) break
      }
      return value
    }
  }

  let best = top[0], bestS = -Infinity
  for (const [r, c] of top) {
    board[r][c] = AI
    const s = minimax(2, false, -Infinity, Infinity)
    board[r][c] = EMPTY
    if (s > bestS) { bestS = s; best = [r, c] }
  }
  return best
}

// ===== 对外入口 =====
// difficulty: 'easy' | 'normal' | 'hard'
export function getAIMove(board, difficulty = 'normal') {
  switch (difficulty) {
    case 'easy':   return pickEasy(board)
    case 'hard':   return pickHard(board)
    default:       return pickNormal(board)
  }
}
