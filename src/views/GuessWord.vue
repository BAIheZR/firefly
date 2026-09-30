<template>
  <div class="chess-page guess-word-page">
    <div class="chess-body">
      <div class="chess-card">
        <div class="chess-top">
          <h2 class="chess-title">
            <i class="fa-solid fa-spell-check"></i> 猜字谜
            <span v-if="isMp" class="mp-badge"><i class="fa-solid fa-tower-broadcast"></i> 联机竞速</span>
            <span v-if="isWatcher" class="mp-badge is-watch"><i class="fa-solid fa-eye"></i> 观战中</span>
          </h2>
          <div class="chess-top-right">
            <div class="chess-earned" title="本局赢得的金币">
              <i class="fa-solid fa-sack-dollar"></i>
              <span>当前可得：{{ currentReward }}</span>
            </div>
            <button class="btn-home" @click="goBackTarget" :title="isMp ? '返回游戏大厅' : '返回主页'">
              <i class="fa-solid" :class="isMp ? 'fa-arrow-left' : 'fa-house'"></i>
            </button>
          </div>
        </div>

        <!-- 对手信息（联机时才有） -->
        <div v-if="isMp" class="mp-role-bar">
          <span v-if="isWatcher" class="mp-role-tag is-watcher">
            <i class="fa-solid fa-eye"></i> 观战中 · 你只能看，不能答题
          </span>
          <span v-else class="mp-role-tag is-opponent">
            <i class="fa-solid fa-user"></i> 对手：{{ opponentName }}
          </span>
          <span class="mp-role-tag" :class="roundWinner === 'self' ? 'is-black' : 'is-white'">
            <i class="fa-solid fa-bolt"></i>
            {{ roundResultText }}
          </span>
        </div>

        <!-- 流萤作为提示官（左图右话气泡）：仅单人显示，联机不显示 -->
        <div v-if="!isMp" class="chess-speech">
          <img :src="speechImg" alt="萤宝" class="speech-img" />
          <div class="speech-bubble">{{ bubbleText }}</div>
        </div>

        <!-- 游戏区域 -->
        <div class="guess-stage">
          <!-- 未开始：欢迎卡 -->
          <div v-if="state === 'idle'" class="guess-welcome">
            <div class="welcome-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
            <h3 class="welcome-title">{{ isMp ? '猜字竞速' : '流萤·猜字挑战' }}</h3>
            <p class="welcome-desc">
              <template v-if="isMp">
                两边拿到同一道题同时开猜，先答对的人拿走金币。
                <br />提示条数是双方共享的，谁多要一条提示，两边的赏金一起下降。
                <br />答对或放弃后由桌主出下一题。
              </template>
              <template v-else>
                萤宝会逐条给出提示词，你来猜出正确答案。
                <br />每揭示一条提示，奖励 10 金币（初始 100，最低 10）。
                <br />猜中后自动抽下一题，无上限连续玩。
              </template>
            </p>
            <div class="welcome-meta">
              <span v-if="!isMp" class="meta-tag"><i class="fa-solid fa-bolt"></i> 消耗 10 行动点</span>
              <span v-else class="meta-tag"><i class="fa-solid fa-bolt"></i> 不消耗行动点</span>
              <span class="meta-tag"><i class="fa-solid fa-coins"></i> 初始 100 金币</span>
              <span class="meta-tag"><i class="fa-solid fa-flag-checkered"></i> 同题竞速</span>
            </div>
            <button
              class="btn-primary btn-lg"
              @click="startNewGame"
              :disabled="isMp && (isWatcher || !amTableOwner)"
            >
              <i class="fa-solid fa-play"></i>
              <template v-if="isWatcher">观战中 · 不能开始</template>
              <template v-else-if="isMp && !amTableOwner">等待桌主开始</template>
              <template v-else>开始挑战</template>
            </button>
          </div>

          <!-- 进行中：题板 -->
          <div v-else class="guess-board">
            <div class="board-head">
              <span class="category-badge">
                <i :class="categoryMeta.icon"></i>
                分类：{{ categoryMeta.name }}{{ currentWord.variant ? `（${currentWord.variant}）` : '' }}
              </span>
              <span class="round-badge">第 {{ revealedCount }} / 10 提示 · 第 {{ roundNo }} 题</span>
            </div>

            <!-- 已揭示的提示词 -->
            <div class="hint-list">
              <div
                v-for="(h, i) in revealedHints"
                :key="i"
                class="hint-card"
                :style="{ animationDelay: i * 0.05 + 's' }"
              >
                <div class="hint-no">{{ i + 1 }}</div>
                <div class="hint-text">{{ h }}</div>
              </div>
            </div>

            <!-- 输入与操作 -->
            <div class="input-row">
              <input
                ref="inputRef"
                v-model="answer"
                class="guess-input"
                :placeholder="isWatcher ? '观战中，不能答题' : '输入你的答案，按 Enter 提交'"
                @keydown.enter="submitAnswer"
                :disabled="submitting || roundOver || isWatcher"
              />
              <button
                class="btn-primary"
                @click="submitAnswer"
                :disabled="submitting || roundOver || !answer.trim() || isWatcher"
              >
                <i class="fa-solid fa-paper-plane"></i> 提交
              </button>
              <button
                class="btn-secondary"
                @click="askHint"
                :disabled="roundOver || revealedCount >= 10 || isWatcher"
              >
                <i class="fa-solid fa-lightbulb"></i> 再要一条提示
              </button>
              <button class="btn-ghost" @click="confirmGiveup" :disabled="roundOver || isWatcher">
                <i class="fa-solid fa-flag"></i> 放弃本题
              </button>
            </div>

            <div class="reward-hint">
              <i class="fa-solid fa-coins"></i>
              当前答中可得 <b>{{ currentReward }}</b> 金币（每多一条提示扣 10）
            </div>

            <!-- 联机竞速：本题已被抢答 / 尚未分出的状态 -->
            <div v-if="isMp && roundOver" class="mp-round-over">
              <i class="fa-solid fa-flag-checkered"></i>
              {{ roundWinner === 'self' ? '你已经抢先答对，等房主出下一题…' : '本题已被抢先答对，等房主出下一题…' }}
            </div>

            <!-- 候选答案：仅单人显示，联机已按要求移除 -->
            <div class="candidate-section" v-if="!isMp">
              <div class="candidate-label">
                <i class="fa-solid fa-dice"></i>
                <span>候选答案（点击填入输入框）</span>
              </div>
              <div class="candidate-chips">
                <button
                  v-for="(c, i) in candidates"
                  :key="i"
                  class="candidate-chip"
                  type="button"
                  @click="pickCandidate(c)"
                >
                  {{ c }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 信息条 -->
        <div class="chess-info">
          <div class="info-item"><i class="fa-solid fa-wallet"></i>金币：<b>{{ goldStore.currentGold }}</b></div>
          <div class="info-item" v-if="!isMp"><i class="fa-solid fa-bolt"></i>行动点：<b>{{ actionPointDisplay }}</b></div>
          <div class="info-item" v-if="!isMp"><i class="fa-solid fa-heart"></i>好感度：<b>{{ inventoryStore.affection }}</b></div>
          <div class="info-item tip">{{ isMp ? '同题竞速：先答对的人拿钱，答错不扣' : '越早猜中奖励越多，加油宝宝' }}</div>
        </div>

        <!-- 历史记录：玩家提交过的每一次答案（对错都记） -->
        <div class="history-section" v-if="history.length > 0">
          <div class="history-head">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>答题记录</span>
            <span class="history-count">{{ history.length }} 次提交</span>
            <span class="history-summary">
              答对 <b class="ok">{{ rightCount }}</b> · 答错 <b class="bad">{{ wrongCount }}</b> · 放弃 <b class="bad">{{ giveupCount }}</b> · 累计 <b class="gold">{{ totalGold }}</b> 金币
            </span>
          </div>
          <div class="history-list">
            <div
              v-for="(h, i) in history"
              :key="i"
              class="history-item"
              :class="{
                'is-win': h.type === 'correct',
                'is-wrong': h.type === 'wrong',
                'is-giveup': h.type === 'giveup',
              }"
            >
              <div class="hi-no">#{{ history.length - i }}</div>
              <div class="hi-answer">
                <div class="hi-name">
                  <span class="submit-answer" :class="{ 'is-answer': h.type === 'correct' }">{{ h.submitAnswer }}</span>
                </div>
                <div class="hi-cat">
                  <i :class="CATEGORY_LABELS[h.category].icon"></i>
                  {{ CATEGORY_LABELS[h.category].name }}{{ h.variant ? ` · ${h.variant}` : '' }}
                  <span class="hi-tag">第 {{ h.roundNo }} 题 · 提示 {{ h.hintCount }} 条</span>
                </div>
              </div>
              <div class="hi-meta">
                <div class="hi-row" v-if="h.type === 'correct'">
                  <i class="fa-solid fa-coins"></i>
                  <b class="ok">+{{ h.reward }}</b>
                </div>
                <div class="hi-row" v-else-if="h.type === 'giveup'">
                  <i class="fa-solid fa-flag"></i> 放弃
                </div>
                <div class="hi-row" v-else>
                  <i class="fa-solid fa-circle-xmark"></i> 答错
                </div>
              </div>
              <div class="hi-result">
                <i v-if="h.type === 'correct'" class="fa-solid fa-check ok-icon"></i>
                <i v-else-if="h.type === 'wrong'" class="fa-solid fa-xmark bad-icon"></i>
                <i v-else class="fa-solid fa-flag giveup-icon"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 歧义选择弹框：输入通用名（如「丹恒」「银狼」）对应多个答案时，让玩家选择具体指的是谁 -->
    <div v-if="pickVisible" class="pick-mask" @click.self="cancelPick">
      <div class="pick-box">
        <div class="pick-title">
          <i class="fa-solid fa-circle-question"></i>
          你输入的「{{ pickTyped }}」可能指：
        </div>
        <div class="pick-desc">请选择你要提交的具体答案</div>
        <div class="pick-list">
          <button
            v-for="(c, i) in pickCandidates"
            :key="i"
            class="pick-item"
            type="button"
            @click="confirmPick(c)"
          >
            {{ c.answer }}
            <span v-if="c.variant" class="pick-variant">（{{ c.variant }}）</span>
          </button>
        </div>
        <div class="pick-foot">
          <button class="btn-ghost" type="button" @click="cancelPick">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useGoldStore } from '@/config/gold'
import { useInventoryStore } from '@/config/inventory'
import { useMultiplayerStore } from '@/config/multiplayer'
import { useUserStore } from '@/config/user'
import { WORD_BANK, CATEGORY_LABELS, rewardForHintCount } from '@/config/guessWord'
import { getGuessGreeting } from '@/config/greetings'

import helloImg from '@/images/game/chess/hello.png'
import goodImg from '@/images/game/chess/good.png'
import youVotorImg from '@/images/game/chess/you_votor.png'
import votorImg from '@/images/game/chess/votor.png'
import waitImg from '@/images/game/chess/wait.png'

const route = useRoute()
const router = useRouter()
const goldStore = useGoldStore()
const inventoryStore = useInventoryStore()
const mp = useMultiplayerStore()
const userStore = useUserStore()

// 联机模式由大厅带 ?mp=1 进入；不带参数即单人，行为与原来一致
const isMp = computed(() => route.query.mp === '1')
// ?watch=1 = 联机观战：只跟着看题和广播，不能答题
const isWatcher = computed(() => isMp.value && route.query.watch === '1')
// 出题/开局的权力在这一桌的桌主身上，不是房间房主（房间里可能同时开着好几桌）
const amTableOwner = computed(() => mp.amTableOwner)
// 同桌的另一个人（房间里可能有好几桌，不能再用「房间里的另一个人」）
const opponentName = computed(
  () => mp.mySession?.seats.find((p) => p.id !== mp.selfId)?.name || '等待对手…'
)

const BASE_ACTION_POINT = 50
const ACTION_POINT_PER_LEVEL = 10
// 行动点（与 Home/notify/Chess 保持同一口径：当前 = 上限 + 物品加成 + 恢复累计）
const actionPointDisplay = computed(() => {
  let level = 0
  try {
    const p = JSON.parse(localStorage.getItem('player_level_data') || '{}')
    if (typeof p.level === 'number') level = p.level
  } catch (e) {}
  const cap = BASE_ACTION_POINT + level * ACTION_POINT_PER_LEVEL
  const cur = cap + (inventoryStore.actionBonus || 0) + (inventoryStore.actionRecover || 0)
  return `${cur} / ${cap}`
})

//  游戏状态 
// state: 'idle' | 'playing'
const state = ref('idle')
const currentWord = ref(null)
const currentIndex = ref(-1)        // 当前题在题库中的下标（联机同步用）
const revealedHints = ref([])
const answer = ref('')
const submitting = ref(false)
const roundNo = ref(0)
const inputRef = ref(null)
// 歧义选择：输入通用名命中多个答案时弹出选择框
const pickVisible = ref(false)
const pickTyped = ref('')
const pickCandidates = ref([])
// 联机竞速：本题归属 ''=未分出 | 'self' | 'other'
const roundWinner = ref('')
const roundOver = computed(() => isMp.value && roundWinner.value !== '')

const roundResultText = computed(() => {
  if (roundWinner.value === 'self') return '本题你赢了'
  if (roundWinner.value === 'other') return '本题被抢先'
  return '本题进行中'
})

// 候选答案（仅单人使用）
const candidates = ref([])

// 历史记录
const history = ref([])
const rightCount = computed(() => history.value.filter(h => h.type === 'correct').length)
const wrongCount = computed(() => history.value.filter(h => h.type === 'wrong').length)
const giveupCount = computed(() => history.value.filter(h => h.type === 'giveup').length)
const totalGold = computed(() => history.value.reduce((s, h) => s + (h.reward || 0), 0))

// 萤宝气泡（仅单人显示）
const bubbleText = ref('')
const speechImg = ref(helloImg)
let bubbleTimer = null

function setBubble(text, img, persist = false) {
  bubbleText.value = text
  speechImg.value = img
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (!persist) {
    bubbleTimer = setTimeout(() => {
      if (state.value === 'playing') {
        bubbleText.value = '宝宝慢慢想，我在这里陪你哦'
        speechImg.value = goodImg
      } else if (state.value === 'idle') {
        bubbleText.value = getGuessGreeting('hello')
        speechImg.value = helloImg
      }
    }, 6000)
  }
}

const revealedCount = computed(() => revealedHints.value.length)
const currentReward = computed(() => rewardForHintCount(revealedCount.value))
const categoryMeta = computed(() => {
  if (!currentWord.value) return { name: '', icon: '' }
  return CATEGORY_LABELS[currentWord.value.category] || { name: '未知', icon: 'fa-solid fa-question' }
})

//  候选答案生成（仅单人） 
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildCandidates(correctWord) {
  const others = WORD_BANK
    .filter(w => w !== correctWord && w.answer !== correctWord.answer)
    .map(w => w.answer)
  const uniqueOthers = [...new Set(others)]
  const distract = shuffle(uniqueOthers).slice(0, 8)
  const includeAnswer = Math.random() < 0.5
  if (includeAnswer) {
    return shuffle([correctWord.answer, ...distract])
  }
  return distract
}

watch([currentWord], () => {
  if (isMp.value) {
    candidates.value = []
    return
  }
  candidates.value = currentWord.value ? buildCandidates(currentWord.value) : []
}, { immediate: true })

function pickCandidate(c) {
  if (state.value !== 'playing' || roundOver.value) return
  answer.value = c
  nextTick(() => inputRef.value?.focus())
}

//  提示条数（幂等，联机双方共享） 
function applyHintCount(count) {
  if (!currentWord.value) return
  const max = currentWord.value.hints.length
  const n = Math.max(1, Math.min(Number(count) || 1, max))
  revealedHints.value = currentWord.value.hints.slice(0, n)
}

//  游戏流程 
function startNewGame() {
  if (isMp.value) {
    if (isWatcher.value) {
      ElMessage.info('你在观战，不能开始新一局')
      return
    }
    // 出题权在这一桌的桌主身上，不是房间房主
    if (!amTableOwner.value) {
      ElMessage.info('只有桌主可以开始新一局')
      return
    }
    if (!mp.connected) {
      ElMessage.warning('与房间的连接已断开')
      return
    }
    history.value = []
    roundNo.value = 0
    drawQuestion()
    return
  }
  // 单人：消耗 10 行动点
  const r = inventoryStore.spendActionPoint(10)
  if (!r.success) {
    ElMessage.warning(r.msg || '行动点不足')
    return
  }
  history.value = []
  roundNo.value = 0
  ElMessage.success('挑战开始，消耗 10 行动点')
  drawLocalQuestion()
  setBubble(getGuessGreeting('start'), goodImg)
}

// 房主抽题并广播给对手
function drawQuestion() {
  const idx = Math.floor(Math.random() * WORD_BANK.length)
  applyQuestion(idx, roundNo.value + 1, 1)
  mp.sendGame({ kind: 'gw:question', wordIndex: idx, roundNo: roundNo.value, hintCount: 1 })
}

// 单人抽题
function drawLocalQuestion() {
  const idx = Math.floor(Math.random() * WORD_BANK.length)
  applyQuestion(idx, roundNo.value + 1, 1)
}

// 应用一道题目（幂等，联机双方由消息驱动）
function applyQuestion(idx, no, hintCount) {
  const word = WORD_BANK[idx]
  if (!word) return
  currentIndex.value = idx
  currentWord.value = word
  roundNo.value = no
  answer.value = ''
  roundWinner.value = ''
  applyHintCount(hintCount || 1)
  state.value = 'playing'
  nextTick(() => inputRef.value?.focus())
}

function askHint() {
  if (!currentWord.value || roundOver.value) return
  if (revealedCount.value >= currentWord.value.hints.length) {
    ElMessage.info('所有提示都已揭示完毕')
    return
  }
  const next = revealedCount.value + 1
  applyHintCount(next)
  // 联机：提示双方共享，避免两边条数不一致导致赏金不同
  if (isMp.value) {
    mp.sendGame({ kind: 'gw:hint', count: next })
  } else {
    setBubble(`${getGuessGreeting('hint')}「${currentWord.value.hints[next - 1]}」`, goodImg)
  }
}

// 答案归一化：去空格/中点/连接符，转小写，便于宽松比对
const normalizeStr = (s) => String(s || '').replace(/[\s·•\-_=+]/g, '').toLowerCase()

// 猜中处理（单人/联机）
function markCorrect(submitAns) {
  const reward = currentReward.value
  goldStore.addGold(reward, 'guess_word')
  history.value.unshift({
    type: 'correct',
    submitAnswer: submitAns,
    correctAnswer: currentWord.value.answer,
    category: currentWord.value.category,
    variant: currentWord.value.variant || '',
    hintCount: revealedCount.value,
    reward,
    roundNo: roundNo.value,
  })
  submitting.value = false
  const early = revealedCount.value <= 5
  setBubble(early ? getGuessGreeting('correct') : getGuessGreeting('win_late'), youVotorImg)

  if (isMp.value) {
    roundWinner.value = 'self'
    ElMessage.success(`猜中啦！奖励 ${reward} 金币，等待房主出下一题`)
    mp.sendGame({ kind: 'gw:correct', name: userStore.currentUser })
    // 房主自己抢到时，负责出下一题
    if (amTableOwner.value) hostScheduleNext()
    return
  }

  ElMessage.success(`猜中啦！奖励 ${reward} 金币，下一题来咯`)
  setTimeout(() => {
    drawLocalQuestion()
    setBubble('宝宝真棒，下一题来啦，加油', goodImg)
  }, 1200)
}

// 答错处理
function markWrong(submitAns) {
  history.value.unshift({
    type: 'wrong',
    submitAnswer: submitAns,
    correctAnswer: currentWord.value.answer,
    category: currentWord.value.category,
    variant: currentWord.value.variant || '',
    hintCount: revealedCount.value,
    reward: 0,
    roundNo: roundNo.value,
  })
  setBubble(getGuessGreeting('wrong'), waitImg)
  ElMessage.error('不对哦，再试试')
  answer.value = ''
  submitting.value = false
  setTimeout(() => inputRef.value?.focus(), 50)
}

function submitAnswer() {
  // 旁观者不能答题（入口按钮也是禁用的，这里再兜一道）
  if (isWatcher.value) return
  if (state.value !== 'playing' || submitting.value || roundOver.value) return
  const ans = answer.value.trim()
  if (!ans) return
  submitting.value = true
  const norm = normalizeStr(ans)

  // 1. 与当前题答案精确匹配 → 直接猜中
  if (norm === normalizeStr(currentWord.value.answer)) {
    return markCorrect(ans)
  }

  // 2. 收集输入命中的所有候选（匹配答案本身，或匹配 aliases 里的通用名）
  const candidates = WORD_BANK.filter((w) => {
    if (normalizeStr(w.answer) === norm) return true
    if (w.aliases && w.aliases.some((a) => normalizeStr(a) === norm)) return true
    return false
  })

  if (candidates.length === 0) {
    return markWrong(ans)
  }

  if (candidates.length === 1) {
    // 唯一候选：若它就是当前题，则算猜中（用玩家输入文本记录），否则答错
    if (candidates[0].answer === currentWord.value.answer) return markCorrect(ans)
    return markWrong(ans)
  }

  // 3. 多个候选（如输入「丹恒」命中 丹恒/丹恒·饮月/丹恒·腾荒）→ 弹框让玩家选具体指谁
  pickTyped.value = ans
  pickCandidates.value = candidates
  pickVisible.value = true
  submitting.value = false
}

// 歧义选择框：确认选择某个候选
function confirmPick(c) {
  pickVisible.value = false
  submitting.value = true
  const chosen = c.answer
  if (normalizeStr(chosen) === normalizeStr(currentWord.value.answer)) {
    // 玩家从列表里选对了
    return markCorrect(chosen)
  }
  return markWrong(chosen)
}

// 歧义选择框：取消
function cancelPick() {
  pickVisible.value = false
  pickCandidates.value = []
  answer.value = ''
  setTimeout(() => inputRef.value?.focus(), 50)
}

async function confirmGiveup() {
  if (state.value !== 'playing' || roundOver.value) return
  try {
    await ElMessageBox.confirm('真的要放弃本题吗？正确答案会公布，但不会获得奖励。', '放弃本题', {
      confirmButtonText: '放弃',
      cancelButtonText: '继续猜',
      type: 'warning',
    })
  } catch (_) {
    return
  }
  giveupLocal()
  if (isMp.value) {
    mp.sendGame({ kind: 'gw:giveup', name: userStore.currentUser })
    if (amTableOwner.value) hostScheduleNext()
  } else {
    setTimeout(() => {
      drawLocalQuestion()
      setBubble('宝宝别气馁，下一题来啦', goodImg)
    }, 1500)
  }
}

// 放弃本题（本地公布答案 + 记历史）
function giveupLocal() {
  if (!currentWord.value) return
  const ans = currentWord.value.answer
  history.value.unshift({
    type: 'giveup',
    submitAnswer: '（放弃）',
    correctAnswer: ans,
    category: currentWord.value.category,
    variant: currentWord.value.variant || '',
    hintCount: revealedCount.value,
    reward: 0,
    roundNo: roundNo.value,
  })
  if (isMp.value) {
    roundWinner.value = roundWinner.value || 'other'
  }
  setBubble(getGuessGreeting('giveup', { answer: ans }), votorImg)
  ElMessage.warning(`正确答案是「${ans}」`)
  if (!isMp.value) {
    state.value = 'playing'
  }
}

//  联机消息 
let offGame = null
let hostNextTimer = null

// 桌主：延时出下一题（双方都答完/放弃后）
function hostScheduleNext(delay = 2600) {
  if (!amTableOwner.value) return
  if (hostNextTimer) clearTimeout(hostNextTimer)
  hostNextTimer = setTimeout(() => { drawQuestion() }, delay)
}

function onMpMessage(data, fromId) {
  switch (data.kind) {
    // 这一桌凑齐人了：桌主自动出第一题（先到先得、满员即开）
    case 'mp:session-start':
      if (isWatcher.value || !amTableOwner.value) return
      if (state.value === 'idle') startNewGame()
      break
    case 'gw:question':
      applyQuestion(data.wordIndex, data.roundNo || (roundNo.value + 1), data.hintCount || 1)
      break
    case 'gw:hint':
      applyHintCount(data.count)
      break
    case 'gw:correct':
      // 对手抢先答对：公布答案，等桌主出下一题
      if (roundWinner.value === 'self') break
      roundWinner.value = 'other'
      ElMessage.warning(`${data.name} 抢先答对了！正确答案是「${currentWord.value?.answer}」`)
      if (amTableOwner.value) hostScheduleNext()
      break
    case 'gw:giveup':
      if (roundWinner.value === 'self') break
      roundWinner.value = 'other'
      ElMessage.info(`${data.name} 放弃了本题，正确答案是「${currentWord.value?.answer}」`)
      if (amTableOwner.value) hostScheduleNext()
      break
    case 'mp:sync-request':
      // 中途进入对局页（含观战者）→ 桌主补发当前题目与提示进度
      if (amTableOwner.value && state.value !== 'idle') {
        mp.sendGame({
          kind: 'gw:question',
          wordIndex: currentIndex.value,
          roundNo: roundNo.value,
          hintCount: revealedCount.value,
        }, fromId)
      }
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
    // 直接刷新页面时 store 里的桌号会丢，从地址栏补回来
    mp.restoreSession(route.query.sid || '', route.query.watch === '1')
    offGame = mp.onGame(onMpMessage)
    // 向**这一桌的桌主**索要当前题目（不再是房间房主）
    const ownerId = mp.mySession?.ownerId || mp.hostId
    if (ownerId && ownerId !== mp.selfId) mp.sendGame({ kind: 'mp:sync-request' }, ownerId)
    return
  }

  setBubble(getGuessGreeting('hello'), helloImg)
})

onBeforeUnmount(() => {
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (hostNextTimer) { clearTimeout(hostNextTimer); hostNextTimer = null }
  if (offGame) { offGame(); offGame = null }
  // 离开对局页 = 离开这一桌
  if (isMp.value) mp.leaveSession()
})

// 返回：联机回游戏大厅，单人回主页
function goBackTarget() {
  if (isMp.value) router.push('/multiplayer')
  else router.push('/')
}
</script>

<style src="@/assets/styles/chess.css"></style>
<style scoped src="@/assets/styles/GuessWord.css"></style>
