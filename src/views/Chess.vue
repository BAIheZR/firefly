<template>
  <div class="chess-page">
    <div class="chess-body">
      <div class="chess-card">
        <div class="chess-top">
          <h2 class="chess-title">
            <i class="fa-solid fa-chess"></i> 五子棋
            <span v-if="isMp" class="mp-badge"><i class="fa-solid fa-tower-broadcast"></i> 联机</span>
          </h2>
          <div class="chess-earned" title="本局累计赚取">
            <i class="fa-solid fa-sack-dollar"></i>
            <span>本局赚取：+{{ earnedGoldThisGame }}</span>
          </div>
        </div>

        <!-- 房主/加入者身份（联机时才有） -->
        <div v-if="isMp" class="mp-role-bar">
          <span class="mp-role-tag" :class="mp.selfIsHost ? 'is-black' : 'is-white'">
            <i class="fa-solid fa-circle"></i>
            你执{{ mp.selfIsHost ? '黑（先手）' : '白（后手）' }}
          </span>
          <span class="mp-role-tag is-opponent" v-if="opponent">
            <i class="fa-solid fa-user"></i> 对手：{{ opponent.name }}
          </span>
          <span class="mp-role-tag is-opponent" v-else>
            <i class="fa-solid fa-user-clock"></i> 等待对手加入…
          </span>
        </div>

        <!-- 人物对话气泡（左图右话）：仅单人对 AI 时显示，联机不显示 -->
        <Transition name="bubble-fade">
          <div v-if="!isMp && bubbleVisible" class="chess-speech">
            <img :src="bubbleImg" alt="萤宝" class="speech-img" />
            <div class="speech-bubble">{{ bubbleText }}</div>
          </div>
        </Transition>

        <!-- 顶部控制栏 -->
        <div class="chess-controls" :class="{ 'is-mp': isMp }">
          <div class="difficulty-group" v-if="!isMp">
            <span class="ctrl-label">难度：</span>
            <button
              v-for="d in DIFFICULTIES"
              :key="d.key"
              class="diff-btn"
              :class="{ active: difficulty === d.key, disabled: state !== 'idle' }"
              :disabled="state !== 'idle'"
              @click="setDifficulty(d.key)"
              :title="d.text"
            >
              {{ d.text }}
            </button>
          </div>
          <div class="status-line" :class="{ 'is-player': isMyTurn, 'is-ai': !isMyTurn }">
            <i :class="isMyTurn ? 'fa-solid fa-user' : 'fa-solid fa-hourglass-half'"></i>
            {{ stateLabel }}
          </div>
          <button
            class="btn-primary"
            @click="startNewGame"
            :disabled="mpStartDisabled || state === 'ai' || state === 'finishing'"
          >
            <i class="fa-solid fa-rotate-right"></i>
            {{ startBtnText }}
          </button>
          <button class="btn-secondary" @click="goBackTarget" :disabled="state === 'ai' || state === 'finishing'">
            <i class="fa-solid" :class="isMp ? 'fa-arrow-left' : 'fa-house'"></i>
            {{ isMp ? '返回游戏大厅' : '回主页' }}
          </button>
        </div>

        <!-- 信息条 -->
        <div class="chess-info">
          <div class="info-item"><i class="fa-solid fa-wallet"></i>金币：<b>{{ goldStore.currentGold }}</b></div>
          <div class="info-item" v-if="!isMp"><i class="fa-solid fa-bolt"></i>行动点：<b>{{ actionPointDisplay }}</b></div>
          <div class="info-item"><i class="fa-solid fa-chess-board"></i>步数：<b>{{ moveCount }}</b></div>
          <div class="info-item"><i class="fa-solid fa-table-cells"></i>棋盘：<b>{{ boardSize }}×{{ boardSize }}</b></div>
          <div class="info-item tip">{{ tipText }}</div>
        </div>

        <!-- 棋盘（联机为 32 路大棋盘，格宽固定、容器可滚动拖动） -->
        <div class="board-wrap" :class="{ 'is-mp': isMp }" ref="boardWrapEl">
          <div
            class="board"
            :style="{ '--cell': CELL_PX + 'px', '--size': boardSize }"
            @click="onBoardClick"
            @mousemove="onBoardHover"
            @mouseleave="hoverCell = null"
          >
            <!-- 网格线 -->
            <div class="grid-lines">
              <div v-for="r in boardSize" :key="'h'+r" class="h-line" :style="{ top: (r-1) * CELL_PX + 'px' }"></div>
              <div v-for="c in boardSize" :key="'v'+c" class="v-line" :style="{ left: (c-1) * CELL_PX + 'px' }"></div>
              <!-- 星位（联机大棋盘不设星位） -->
              <div v-for="(p, i) in stars" :key="'s'+i" class="star-dot"
                :style="{ left: p[1] * CELL_PX + 'px', top: p[0] * CELL_PX + 'px' }"></div>
            </div>
            <!-- 棋子 -->
            <template v-for="r in boardSize" :key="'row'+r">
              <div
                v-for="c in boardSize"
                :key="'c'+r+'-'+c"
                class="stone-slot"
                :data-r="r-1"
                :data-c="c-1"
                :style="{ left: (24 + (c-1) * CELL_PX) + 'px', top: (24 + (r-1) * CELL_PX) + 'px' }"
              >
                <div
                  v-if="viewBoard[r-1][c-1] === HUMAN"
                  class="stone stone-black"
                  :class="{ justmoved: lastMove && lastMove[0] === r-1 && lastMove[1] === c-1 }"
                ></div>
                <div
                  v-else-if="viewBoard[r-1][c-1] === AI"
                  class="stone stone-white"
                  :class="{ justmoved: lastMove && lastMove[0] === r-1 && lastMove[1] === c-1 }"
                ></div>
                <!-- 悬浮预览 -->
                <div
                  v-else-if="hoverCell && hoverCell[0] === r-1 && hoverCell[1] === c-1 && canPlaceNow"
                  class="stone stone-preview"
                  :class="myColor === HUMAN ? 'stone-black' : 'stone-white'"
                ></div>
              </div>
            </template>
          </div>
        </div>

        <!-- 结束蒙层 -->
        <Transition name="fade">
          <div v-if="state === 'over'" class="result-overlay" @click="closeOverlay">
            <div class="result-card" @click.stop>
              <div class="result-title" :class="resultTypeClass">
                <i :class="displayIcon"></i>
                {{ displayTitle }}
              </div>
              <div class="result-sub">
                {{ resultSub }}
              </div>
              <div class="result-btns">
                <button
                  v-if="!isMp || mp.selfIsHost"
                  class="btn-primary"
                  @click="startNewGame"
                >
                  {{ isMp ? '开始新一局' : '再来一局' }}
                </button>
                <span v-else class="mp-wait-restart">
                  <i class="fa-solid fa-hourglass-half"></i> 等待房主开始新一局…
                </span>
                <button class="btn-secondary" @click="goBackTarget">
                  {{ isMp ? '返回游戏大厅' : '回主页' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useGoldStore } from '@/config/gold'
import { useInventoryStore } from '@/config/inventory'
import { useMultiplayerStore } from '@/config/multiplayer'
import {
  BOARD_SIZE, MP_BOARD_SIZE, EMPTY, HUMAN, AI,
  createBoard, checkWin, isBoardFull, getAIMove,
} from '@/utils/gomoku'
import { getChessGreeting } from '@/config/greetings'
// 五子棋场景人物图（src/images/game/chess）
import chessHello from '@/images/game/chess/hello.png'
import chessGood from '@/images/game/chess/good.png'
import chessYouVotor from '@/images/game/chess/you_votor.png'
import chessVotor from '@/images/game/chess/votor.png'
import chessWait from '@/images/game/chess/wait.png'

const route = useRoute()
const router = useRouter()
const goldStore = useGoldStore()
const inventoryStore = useInventoryStore()
const mp = useMultiplayerStore()

const DIFFICULTIES = [
  { key: 'easy',   text: '简单' },
  { key: 'normal', text: '平常' },
  { key: 'hard',   text: '难' },
]
const GAME_COST_AP = 10          // 单人每局消耗 10 行动点（联机不消耗）
const PER_MOVE_GOLD = 1          // 每下一步赚 1
const WIN_BONUS_GOLD = 300       // 获胜额外奖励
const BASE_ACTION_POINT = 50
const ACTION_POINT_PER_LEVEL = 10
const MP_CELL_PX = 24            // 联机 32 路棋盘：每格固定 24px，容器内滚动拖动
const SOLO_CELL_PX = 38          // 单人棋盘（桌面端）：每格 38px
const MIN_SOLO_CELL_PX = 16      // 单人棋盘的最小格宽：再小棋子就点不准了
const BOARD_PAD = 24             // 棋盘四周留白（与 chess.css 的 padding 一致，命中判定用）
const SOLO_STARS = [[3,3],[3,11],[11,3],[11,11],[7,7]]  // 15 路五个星位

// 棋盘容器的可用宽度，由 ResizeObserver 量得（见下方 watch(boardWrapEl)）
const boardAvailW = ref(0)

// ===== 模式判定 =====
// 联机模式由大厅页跳转时带上的 ?mp=1 决定，不带参数即单人（行为与原来完全一致）
const isMp = computed(() => route.query.mp === '1')
const boardSize = computed(() => (isMp.value ? MP_BOARD_SIZE : BOARD_SIZE))

// 格宽。桌面端固定 38px，整盘 38×14+48 = 580px；
// 但 375px 手机上原本只能看到约 9 列，必须横向滚动才能下棋 —— 对棋类来说
// 「看不到全盘」是硬伤（看不出自己的连子，也没法判断对手意图）。
// 这里按容器实际宽度反推格宽，让整盘恰好放得下。
//
// 为什么改格宽、而不是给棋盘加 transform: scale 缩放：
// 落子命中判定算的是 (clientX - rect.left) / CELL_PX。用 transform 缩放后
// rect 是缩放后的尺寸、而 CELL_PX 没变，两者不再同尺度，落子位置会系统性地偏移；
// 改格宽则所有派生尺寸（网格线、星位、棋子槽、坐标）都从 CELL_PX 推导，天然一致。
const CELL_PX = computed(() => {
  // 联机 32 路棋盘本来就是「固定格宽 + 容器内滚动拖动」，保持原样
  if (isMp.value) return MP_CELL_PX
  const avail = boardAvailW.value
  if (!avail) return SOLO_CELL_PX   // 还没量到（首帧）：先按桌面值渲染
  const fit = Math.floor((avail - BOARD_PAD * 2) / (boardSize.value - 1))
  return Math.max(MIN_SOLO_CELL_PX, Math.min(SOLO_CELL_PX, fit))
})
const stars = computed(() => (isMp.value ? [] : SOLO_STARS))
// 黑棋固定为 HUMAN，白棋固定为 AI；联机时房主执黑先行、加入者执白
const myColor = computed(() => (isMp.value ? (mp.selfIsHost ? HUMAN : AI) : HUMAN))
const opponent = computed(() => mp.members.find((m) => m.id !== mp.selfId) || null)

// 游戏状态
// idle: 未开始 / player: 对局中 / ai: AI思考中（仅单人） / finishing: 结算等待 / over: 结束
const state = ref('idle')
const difficulty = ref('normal')
// 棋盘数据必须与 boardSize 对齐：初值按当前模式建，否则模板按 boardSize 取值会越界报错（曾导致联机五子棋白屏）
const board = ref(createBoard(isMp.value ? MP_BOARD_SIZE : BOARD_SIZE))
const turn = ref(HUMAN)          // 当前该谁落子（黑始终先行）
const lastMove = ref(null)
const moveCount = ref(0)
const earnedGoldThisGame = ref(0)
const winner = ref(null)         // null / HUMAN / AI / 'draw'
let finishTimer = null
const hoverCell = ref(null)
const boardWrapEl = ref(null)

// 量取棋盘容器可用宽度，供 CELL_PX 反推格宽。
// 用 ResizeObserver 而不是只监听 window.resize：旋屏、窗口改尺寸、
// 以及将来若有侧栏/抽屉改变布局，都能覆盖到。
let boardRo = null
function measureBoardAvail() {
  const el = boardWrapEl.value
  if (!el) return
  // clientWidth 已扣除自身 padding，对滚动容器返回「可视宽度」——正是我们要的
  boardAvailW.value = el.clientWidth
}
watch(
  boardWrapEl,
  (el) => {
    if (boardRo) {
      boardRo.disconnect()
      boardRo = null
    }
    if (!el) return
    measureBoardAvail() // 先量一次，避免等到第一次 resize 才有正确尺寸
    if (typeof ResizeObserver !== 'undefined') {
      boardRo = new ResizeObserver(measureBoardAvail)
      boardRo.observe(el)
    } else {
      window.addEventListener('resize', measureBoardAvail)
    }
  },
  { flush: 'post' } // post：等 DOM 更新完再量，否则拿到的是上一轮的尺寸
)

// 渲染用棋盘：恒为 boardSize×boardSize 的规整二维数组，任何缺口都按空位处理，杜绝越界
const viewBoard = computed(() => {
  const size = boardSize.value
  const src = board.value
  const out = new Array(size)
  for (let r = 0; r < size; r++) {
    const row = src[r]
    const dst = new Array(size)
    for (let c = 0; c < size; c++) {
      dst[c] = (Array.isArray(row) && row[c]) ? row[c] : EMPTY
    }
    out[r] = dst
  }
  return out
})

// 模式切换（单人 15 路 ↔ 联机 32 路）时重建棋盘，避免尺寸不匹配
watch(boardSize, (size) => {
  board.value = createBoard(size)
  lastMove.value = null
  moveCount.value = 0
  earnedGoldThisGame.value = 0
  winner.value = null
  turn.value = HUMAN
  state.value = 'idle'
  hoverCell.value = null
})

const isMyTurn = computed(() => turn.value === myColor.value)
const canPlaceNow = computed(() => state.value === 'player' && isMyTurn.value)
const iWon = computed(() => winner.value !== null && winner.value !== 'draw' && winner.value === myColor.value)

// 单人：人物对话气泡（图片 + 文本）；联机不显示
const bubbleImg = ref(chessHello)
const bubbleText = ref('')
const bubbleVisible = ref(false)
let hideBubbleTimer = null
function sceneImg(scene) {
  switch (scene) {
    case 'you_votor': return chessYouVotor
    case 'votor':     return chessVotor
    case 'wait':      return chessWait
    case 'good':
    case 'think':
    case 'draw':
    case 'place_after': return chessGood
    case 'hello':
    default:          return chessHello
  }
}
function showBubble(scene, opts = {}) {
  if (isMp.value) return
  const { durationMs = 3800, forceText = null } = opts
  bubbleImg.value = sceneImg(scene)
  bubbleText.value = forceText || getChessGreeting(scene) || ''
  bubbleVisible.value = true
  if (hideBubbleTimer) clearTimeout(hideBubbleTimer)
  if (durationMs > 0) {
    hideBubbleTimer = setTimeout(() => { bubbleVisible.value = false }, durationMs)
  }
}
function keepBubble(scene, forceText) { showBubble(scene, { durationMs: 0, forceText }) }

// 单人：空闲 20s → wait 催促气泡（联机不启用）
const IDLE_MS = 20 * 1000
let idleTimer = null
function kickIdle() {
  if (isMp.value) return
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (state.value === 'player' && turn.value === HUMAN) {
      showBubble('wait', { durationMs: 4500 })
    }
  }, IDLE_MS)
}
function onIdleActivity() { kickIdle() }

onBeforeUnmount(() => {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
  if (finishTimer) { clearTimeout(finishTimer); finishTimer = null }
  if (boardRo) { boardRo.disconnect(); boardRo = null }
  window.removeEventListener('resize', measureBoardAvail)
  window.removeEventListener('mousemove', onIdleActivity)
  window.removeEventListener('keydown', onIdleActivity)
  window.removeEventListener('click', onIdleActivity)
  window.removeEventListener('touchstart', onIdleActivity)
  if (offGame) { offGame(); offGame = null }
})

const stateLabel = computed(() => {
  if (isMp.value) {
    if (state.value === 'idle') return mp.selfIsHost ? '点击开始对局（房主执黑先行）' : '等待房主开始对局'
    if (state.value === 'finishing') return '对局结束，结算中…'
    if (state.value === 'over') {
      if (winner.value === 'draw') return '和棋'
      return iWon.value ? '恭喜，你胜利了！' : '对手获胜'
    }
    return isMyTurn.value
      ? `你的回合（${myColor.value === HUMAN ? '黑' : '白'}）`
      : '等待对方落子…'
  }
  if (state.value === 'idle') return '点击右上角开始一局（消耗 10 行动点）'
  if (state.value === 'finishing') return '对局结束，结算中…'
  if (state.value === 'player') return '你的回合（黑）'
  if (state.value === 'ai')     return '萤宝思考中…（白）'
  if (winner.value === 'draw')  return '和棋'
  if (winner.value === HUMAN)   return '恭喜，你胜利了！'
  if (winner.value === AI)      return '萤宝获胜，需要再来一把吗'
  return ''
})

const startBtnText = computed(() => {
  if (!isMp.value) return state.value === 'idle' ? `开始（消耗 ${GAME_COST_AP} 行动点）` : '重新开始'
  if (!mp.selfIsHost) return '等待房主开始'
  return state.value === 'idle' ? '开始对局' : '重新开始'
})
const mpStartDisabled = computed(() => isMp.value && !mp.selfIsHost)

const tipText = computed(() => (
  isMp.value
    ? `房主执黑先行，自行落子每步 +${PER_MOVE_GOLD} 金币，胜利额外 +${WIN_BONUS_GOLD}（不消耗行动点）`
    : `玩家执黑先行，每落一子 +${PER_MOVE_GOLD} 金币（胜利则额外 +${WIN_BONUS_GOLD}）`
))

const resultTitle = computed(() => {
  if (winner.value === 'draw') return '和棋'
  if (winner.value === HUMAN) return `你胜利了！奖励 +${WIN_BONUS_GOLD} 金币`
  if (winner.value === AI) return '萤宝获胜，需要再来一把吗'
  return ''
})
const mpResultTitle = computed(() => {
  if (winner.value === 'draw') return '和棋'
  return iWon.value ? `你赢了！奖励 +${WIN_BONUS_GOLD} 金币` : '对手获胜'
})
const displayTitle = computed(() => (isMp.value ? mpResultTitle.value : resultTitle.value))
const resultSub = computed(() => `本局共 ${moveCount.value} 步，累计赚取 +${earnedGoldThisGame.value} 金币`)
const resultIcon = computed(() => {
  if (winner.value === 'draw') return 'fa-solid fa-handshake'
  if (winner.value === HUMAN) return 'fa-solid fa-trophy'
  return 'fa-solid fa-robot'
})
const mpResultIcon = computed(() => {
  if (winner.value === 'draw') return 'fa-solid fa-handshake'
  return iWon.value ? 'fa-solid fa-trophy' : 'fa-solid fa-flag'
})
const displayIcon = computed(() => (isMp.value ? mpResultIcon.value : resultIcon.value))
const resultTypeClass = computed(() => {
  if (winner.value === 'draw') return 'is-draw'
  if (isMp.value) return iWon.value ? 'is-win' : 'is-lose'
  if (winner.value === HUMAN) return 'is-win'
  return 'is-lose'
})

// 行动点（单人口径，与 Home/notify 保持一致）
const actionPointDisplay = computed(() => {
  let level = 0
  try {
    const p = JSON.parse(localStorage.getItem('player_level_data') || '{}')
    if (typeof p.level === 'number') level = p.level
  } catch (e) {}
  return BASE_ACTION_POINT + level * ACTION_POINT_PER_LEVEL
       + (inventoryStore.actionBonus || 0) + (inventoryStore.actionRecover || 0)
})

// 难度切换（只能在 idle，仅单人）
function setDifficulty(k) {
  if (isMp.value || state.value !== 'idle') return
  difficulty.value = k
}

function addMoveGold(amount) {
  const ok = goldStore.addGold(amount, '五子棋落子')
  if (ok) earnedGoldThisGame.value += amount
}

// 重置棋盘（本地立即生效；联机时由 start/restart 消息驱动双方同步重置）
function resetBoardLocal() {
  board.value = createBoard(boardSize.value)
  lastMove.value = null
  moveCount.value = 0
  earnedGoldThisGame.value = 0
  winner.value = null
  turn.value = HUMAN
  state.value = 'player'
}

// 开始新局
function startNewGame() {
  if (isMp.value) {
    if (!mp.selfIsHost) {
      ElMessage.info('只有房主可以开始新一局')
      return
    }
    if (!mp.connected) {
      ElMessage.warning('与房间的连接已断开')
      return
    }
    // 房主本地先重置，再通知对方
    const isFirst = state.value === 'idle'
    resetBoardLocal()
    mp.sendGame({ kind: isFirst ? 'chess:start' : 'chess:restart' })
    return
  }
  // 单人：消耗行动点
  const res = inventoryStore.spendActionPoint(GAME_COST_AP)
  if (!res.success) {
    alert(`${res.msg}。挂机等待或使用物品补充行动点吧～`)
    return
  }
  resetBoardLocal()
  showBubble('hello', { durationMs: 3200, forceText: '开始啦宝宝，执黑先行哦' })
}

function onBoardClick(e) {
  if (!canPlaceNow.value) return
  const [r, c] = hitCell(e)
  if (r == null) return
  if (board.value[r][c] !== EMPTY) return
  placeStone(r, c, myColor.value)
  // 联机：把自己的落子同步给对方
  if (isMp.value) {
    mp.sendGame({ kind: 'chess:move', r, c, player: myColor.value })
  }
}

function onBoardHover(e) {
  const [r, c] = hitCell(e)
  hoverCell.value = (r == null) ? null : [r, c]
}

function hitCell(e) {
  const root = e.currentTarget
  const rect = root.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const cell = CELL_PX.value
  // 交点位于 padding + n*cell 处，取最近的交点（旧算法按 cell=38 时的偏置凑出来，换格宽就会整体偏一格）
  const c = Math.round((x - BOARD_PAD) / cell)
  const r = Math.round((y - BOARD_PAD) / cell)
  if (r < 0 || r >= boardSize.value || c < 0 || c >= boardSize.value) return [null, null]
  return [r, c]
}

// 落子核心：本地落子与对方落子都走这里
function placeStone(r, c, player) {
  if (board.value[r][c] !== EMPTY) return
  board.value[r][c] = player
  lastMove.value = [r, c]
  moveCount.value += 1
  kickIdle()

  // 只有自己下的子才加金币（联机中对方落子不加自己的）
  if (player === myColor.value) addMoveGold(PER_MOVE_GOLD)

  const size = boardSize.value
  if (checkWin(board.value, r, c, player, size)) {
    winner.value = player
    if (player === myColor.value) {
      const ok = goldStore.addGold(WIN_BONUS_GOLD, '五子棋胜利奖励')
      if (ok) earnedGoldThisGame.value += WIN_BONUS_GOLD
      showBubble('you_votor', { durationMs: 6000 })
    } else {
      showBubble('votor', { durationMs: 6000 })
    }
    scheduleResult(isMp.value ? 1200 : 3000)
    return
  }
  if (isBoardFull(board.value, size)) {
    winner.value = 'draw'
    showBubble('draw', { durationMs: 5000 })
    scheduleResult(isMp.value ? 1200 : 3000)
    return
  }
  turn.value = player === HUMAN ? AI : HUMAN

  if (isMp.value) {
    state.value = 'player'
    return
  }
  // 单人：换手后交给 AI
  if (turn.value === AI) {
    state.value = 'ai'
    showBubble('good', { durationMs: 0 })
    nextTick(runAI)
  } else {
    showBubble('place_after', { durationMs: 2600 })
    state.value = 'player'
  }
}

function scheduleResult(delayMs) {
  state.value = 'finishing'
  if (finishTimer) clearTimeout(finishTimer)
  finishTimer = setTimeout(() => {
    state.value = 'over'
    finishTimer = null
  }, delayMs)
}

// AI 至少思考 1.5s（仅单人）
const AI_THINK_MIN_MS = 1500
function runAI() {
  const thinkStarted = Date.now()
  const switchTimer = setTimeout(() => {
    if (state.value === 'ai') keepBubble('think')
  }, 800)
  setTimeout(() => {
    if (switchTimer) clearTimeout(switchTimer)
    if (state.value !== 'ai') return
    try {
      const [r, c] = getAIMove(board.value, difficulty.value)
      if (r == null || c == null) return
      if (board.value[r][c] !== EMPTY) return
      const elapsed = Date.now() - thinkStarted
      const doPlace = () => placeStone(r, c, AI)
      if (elapsed >= AI_THINK_MIN_MS) {
        doPlace()
      } else {
        setTimeout(doPlace, AI_THINK_MIN_MS - elapsed)
      }
    } catch (err) {
      console.error('AI 落子异常', err)
    }
  }, AI_THINK_MIN_MS)
}

// ===== 联机消息 =====
let offGame = null

function sendState(to) {
  mp.sendGame({
    kind: 'chess:state',
    board: board.value,
    turn: turn.value,
    moveCount: moveCount.value,
    winner: winner.value,
    state: state.value,
  }, to)
}

function applyState(d) {
  if (!Array.isArray(d.board) || d.board.length !== boardSize.value) return
  board.value = d.board
  turn.value = d.turn === AI ? AI : HUMAN
  moveCount.value = d.moveCount || 0
  winner.value = d.winner ?? null
  state.value = d.state === 'over' ? 'over' : (d.state === 'idle' ? 'idle' : 'player')
}

function onMpMessage(data, fromId) {
  switch (data.kind) {
    case 'chess:start':
    case 'chess:restart':
      resetBoardLocal()
      ElMessage.info('房主开始了新一局')
      break
    case 'chess:move':
      // 对方落子：直接套用，不再回发，避免消息循环
      if (typeof data.r !== 'number' || typeof data.c !== 'number') return
      if (!board.value[data.r] || board.value[data.r][data.c] !== EMPTY) return
      placeStone(data.r, data.c, data.player === AI ? AI : HUMAN)
      break
    case 'chess:state':
      applyState(data)
      break
    case 'mp:sync-request':
      // 房主给新进对局页的成员补发当前局面
      if (mp.selfIsHost) sendState(fromId)
      break
    case 'mp:member-joined':
      // 对局进行中有人进房 → 房主主动下发局面
      if (mp.selfIsHost && state.value !== 'idle') sendState(data.member.id)
      break
    case 'mp:room-closed':
      ElMessage.warning('房主已关闭房间')
      goBackTarget()
      break
    default:
      break
  }
}

onMounted(() => {
  goldStore.loadData()
  inventoryStore.loadData()

  if (isMp.value) {
    if (!mp.connected) {
      ElMessage.warning('尚未连接到房间，请先回到大厅创建或加入房间')
      router.replace('/multiplayer')
      return
    }
    offGame = mp.onGame(onMpMessage)
    // 中途进入对局页 → 向房主索要当前局面快照
    if (!mp.selfIsHost) mp.sendGame({ kind: 'mp:sync-request' }, mp.hostId || null)
    return
  }

  // 单人：打招呼 + 空闲催促
  showBubble('hello', { durationMs: 4500 })
  window.addEventListener('mousemove', onIdleActivity)
  window.addEventListener('keydown', onIdleActivity)
  window.addEventListener('click', onIdleActivity)
  window.addEventListener('touchstart', onIdleActivity)
  kickIdle()
})

// 实时同步 inventoryStore 的存档落盘（单人手动的扣减，避免页面切换时丢失）
watch(
  () => [inventoryStore.actionRecover, inventoryStore.actionBonus],
  () => inventoryStore.saveData()
)

// 返回：联机回游戏大厅（连接在 store 里，不会断），单人回主页
function goBackTarget() {
  if (isMp.value) router.push('/multiplayer')
  else router.push('/')
}
function closeOverlay() {
  // 蒙层点击不关闭，避免误操作漏掉结果
}
</script>

<style scoped src="@/assets/styles/chess.css"></style>
