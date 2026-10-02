<template>
  <div class="ww-page" :class="{ 'is-day': isDayPhase }">
    <!-- is-wide：对局中把页面拉宽到 1440，并把频道/广播/在场信息搬到卡片外面当侧栏 -->
    <div class="ww-body" :class="{ 'is-wide': started }">
      <div class="ww-card">
        <!--  顶栏  -->
        <div class="ww-top">
          <h2 class="ww-title">
            <i class="fa-solid fa-fire-flame-simple"></i> {{ TERMS.gameName }}
            <small>{{ TERMS.subTitle }}</small>
          </h2>
          <div class="ww-top-right">
            <span v-if="isMp" class="ww-badge is-mp"><i class="fa-solid fa-tower-broadcast"></i> 联机</span>
            <span v-if="isWatcher" class="ww-badge is-watch"><i class="fa-solid fa-eye"></i> 观战中</span>
            <span v-else-if="spectator" class="ww-badge"><i class="fa-solid fa-eye"></i> 旁观</span>
            <span class="ww-badge is-judge">
              <!-- 判官固定是帕姆本人，所以徽章就直接用它的头像，没有第二种形态 -->
              <img class="ww-badge-face" :src="PM_AVATAR" alt="帕姆" draggable="false" />
              {{ TERMS.judge }} · 帕姆
            </span>
            <span v-if="started" class="ww-badge is-round">
              <i class="fa-solid fa-moon"></i> 第 {{ view.round }} 夜
            </span>
            <span class="ww-badge">
              <i class="fa-solid fa-sack-dollar"></i> {{ goldStore.currentGold }}
            </span>
            <button class="ww-btn is-ghost is-sm" @click="onBack">
              <i class="fa-solid" :class="isMp ? 'fa-arrow-left' : 'fa-house'"></i>
              {{ isMp ? '返回大厅' : '返回主页' }}
            </button>
          </div>
        </div>

        <!--  开场：确认牌面 + 开始（判官固定由帕姆担任，这里不再有模式选择）  -->
        <template v-if="!started">
          <div class="ww-hero">
            <img :src="speakImg" alt="流萤" />
            <div class="ww-hero-bubble">{{ bubbleText }}</div>
          </div>

          <div v-if="isMp && !authority" class="ww-action" style="margin-top: 14px">
            <div class="ww-action-title"><i class="fa-solid fa-hourglass-half"></i> 等房主开始</div>
            <div class="ww-action-hint">房主发牌后，你就能看到自己这一局的身份。</div>
          </div>

          <template v-else>
            <div v-if="isMp && shortBy > 0" class="ww-action" style="margin-top: 14px">
              <div class="ww-action-title"><i class="fa-solid fa-user-plus"></i> 人数不足</div>
              <div class="ww-action-hint">
                本局是 {{ BASE_TOTAL }} 人局，房间里能坐下的只有 {{ seatCapacity }} 人，还差 {{ shortBy }} 人。
              </div>
              <div class="ww-action-choices">
                <button
                  class="ww-btn is-sm"
                  :class="fillWithAI ? 'is-primary' : 'is-ghost'"
                  type="button"
                  @click="fillWithAI = !fillWithAI"
                >
                  <i class="fa-solid" :class="fillWithAI ? 'fa-square-check' : 'fa-square'"></i>
                  用 AI 乘客补位
                </button>
              </div>
              <div class="ww-action-hint" style="margin-top: 8px">
                {{ fillWithAI
                  ? '会把空出来的座位交给 AI 乘客，凑满 6 人立刻开局。'
                  : '不补位的话，需要再等 ' + shortBy + ' 个人进房间。' }}
              </div>
            </div>

            <div class="ww-choice" style="margin-top: 16px; text-align: center">
              <button class="ww-btn is-primary" :disabled="!canStart" @click="startGame">
                <i class="fa-solid fa-play"></i> {{ startBtnText }}
              </button>
            </div>
            <!-- 牌面一行带过 —— 原来那整块「玩法」已经删掉，这里只留本局到底发了什么牌 -->
            <div class="ww-action-hint" style="text-align: center; margin-top: 8px">
              本局牌面 · {{ setupLine }}
            </div>
            <div v-if="!isMp" class="ww-action-hint" style="text-align: center; margin-top: 4px">
              单人模式消耗 10 行动点，剩下的座位由 AI 乘客补上。
            </div>
          </template>
        </template>

        <!--  对局中  -->
        <template v-else>
          <div class="ww-phase" :class="{ 'is-waiting': waitingMe }">
            <div class="ww-phase-icon"><i :class="phaseIcon"></i></div>
            <div class="ww-phase-main">
              <div class="ww-phase-name">
                {{ phaseLabel }}
                <!-- 夜晚分步：把「现在第几步、谁在行动」直接写在阶段名后面 -->
                <span v-if="nightStepLabel" class="ww-step-chip">
                  <i class="fa-solid fa-shoe-prints"></i> 第 {{ nightStepNo }} 步 · {{ nightStepLabel }}
                </span>
              </div>
              <div class="ww-phase-sub">
                <span v-if="prevPhaseLabel" class="ww-prev">
                  <i class="fa-solid fa-arrow-left-long"></i> 刚才：{{ prevPhaseLabel }}
                </span>
                <span>{{ phaseSub }}</span>
              </div>
            </div>
            <!-- 单人模式下轮到你了：不要再让人对着倒计时发呆，直接写明「在等你」 -->
            <div v-if="waitingMe" class="ww-waiting">
              <i class="fa-solid fa-hourglass-half"></i> 梦境暂停中 · 等你
            </div>
            <div v-else-if="remain > 0" class="ww-timer" :class="{ 'is-urgent': remain <= 10 }">{{ remain }}s</div>
            <!-- 单人模式只有一个真人（AI 判官不会替你决定），所以给一个直接推阶段的出口。
                 它同时也是「防挂机」的官方按钮：不点，帕姆就一直停在这里。 -->
            <button
              v-if="canSkipPhase"
              class="ww-btn is-sm"
              :class="waitingMe ? 'is-primary' : 'is-ghost'"
              @click="onSkipPhase"
            >
              <i class="fa-solid fa-forward-step"></i> {{ waitingMe ? '这一步先过' : '跳过' }}
            </button>
            <div v-if="view.deadline && !waitingMe" class="ww-bar">
              <i :style="{ width: phaseProgress + '%' }"></i>
            </div>
          </div>

          <!-- 卡片内只剩「座位 + 发言 + 身份/行动」；频道/广播/在场信息已搬到卡片外的侧栏 -->
          <div class="ww-stage-main">
            <WolfSeatGrid
                :players="view.players"
                :alive="view.alive"
                :self-id="myId"
                :my-role="myRole"
                :mate-ids="mateIds"
                :lit-id="litIdForDisplay"
                :revealed="seatRevealed"
                :vote-counts="voteCounts"
                :pickable="canPickSeat"
                :picked-id="seatPickedId"
                :self-avatar="selfAvatar"
                @pick="onSeatPick"
              />

              <!-- 轮到你时的唯一提示条。
                   投票 / 轮流发言 / 遗言 / 反击 的出口都收在这里 ——
                   卡片里不再有独立的「发言面板」，所有话一律到右侧频道去说（用户要求）。 -->
              <div v-if="myTurn" class="ww-action is-mine-turn">
                <div class="ww-action-title">
                  <i class="fa-solid" :class="myTurn.icon"></i> {{ myTurn.title }}
                </div>
                <div class="ww-action-hint">{{ myTurn.hint }}</div>
                <div v-if="myTurn.buttons.length" class="ww-action-choices">
                  <button
                    v-for="b in myTurn.buttons"
                    :key="b.key"
                    class="ww-btn is-sm"
                    :class="b.cls"
                    @click="b.run()"
                  >
                    <i class="fa-solid" :class="b.icon"></i> {{ b.label }}
                  </button>
                </div>
              </div>

              <!-- 夜晚无事可做 / 已行动完 -->
              <div v-if="waitingOthers" class="ww-action is-plain">
                <div class="ww-action-title" style="color: var(--ww-text-dim)">
                  <i class="fa-solid fa-hourglass-half"></i> {{ waitingText }}
                </div>
              </div>

              <WolfSelfPanel
                :role-key="myRole"
                :hidden="isMp && !view.me"
                :private-info="view.me || {}"
                :pending="myPending"
                :targets="targets"
                :players="view.players"
                :picked-id="pickedId"
                :alive-self="view.alive.includes(myId)"
                :phase-label="phaseShortLabel"
                :feed="view.feed"
                @act="onAct"
              />

              <!-- 赛后复盘（只在结算后出现）
                   对局进行中这些信息一律不下发 —— 引擎 getSnapshot 只在 phase === OVER
                   时才放行 allRoles / judgeInfo / seerHistory / nightLog。
                   结算弹窗上的「查看赛后复盘」按钮就是把它翻出来看。 -->
              <template v-if="view.phase === PHASE.OVER">
                <div class="ww-feed">
                  <div class="ww-feed-title"><i class="fa-solid fa-table-columns"></i> 赛后复盘 · 全部身份</div>
                  <div class="ww-reveal-grid">
                    <div
                      v-for="p in replaySeats"
                      :key="p.id"
                      class="ww-reveal-item"
                      :class="{ 'is-wolf': isWolfFn(p.role), 'is-dead': !view.alive.includes(p.id) }"
                    >
                      <span class="ww-avatar-dot">{{ p.seat }}</span>
                      <span>{{ p.name }}</span>
                      <b style="margin-left: auto; color: var(--ww-gold)">{{ p.label }}</b>
                    </div>
                  </div>
                </div>

                <!-- 最后一夜到底发生了什么（谁被骇入 / 谁被感应 / 谁被照亮） -->
                <div class="ww-feed">
                  <div class="ww-feed-title"><i class="fa-solid fa-eye"></i> 赛后复盘 · 最后一夜</div>
                  <div class="ww-judge-grid">
                    <div class="ww-judge-row is-kill">
                      <span class="ww-judge-key"><i class="fa-solid fa-user-ninja"></i> 银狼{{ TERMS.kill }}</span>
                      <b>{{ replayRow.kill }}</b>
                    </div>
                    <div class="ww-judge-row is-seer">
                      <span class="ww-judge-key"><i class="fa-solid fa-glasses"></i> 瓦尔特{{ TERMS.seerCheck }}</span>
                      <b>{{ replayRow.seer }}</b>
                    </div>
                    <div class="ww-judge-row is-witch">
                      <span class="ww-judge-key"><i class="fa-solid fa-mug-hot"></i> 姬子调饮</span>
                      <b>{{ replayRow.witch }}</b>
                    </div>
                    <div class="ww-judge-row is-firefly">
                      <span class="ww-judge-key"><i class="fa-solid fa-fire-flame-simple"></i> 流萤{{ TERMS.fireflyLight }}</span>
                      <b>{{ replayRow.firefly }}</b>
                    </div>
                  </div>

                  <!-- 瓦尔特整局验过谁、验出来是好人还是坏人 -->
                  <div class="ww-feed-title" style="margin-top: 12px">
                    <i class="fa-solid fa-book"></i> 赛后复盘 · 瓦尔特验过谁
                  </div>
                  <div class="ww-feed-list">
                    <div v-if="!seerHistoryRows.length" class="ww-chat-empty">瓦尔特一整局都没有感应过任何人</div>
                    <div
                      v-for="s in seerHistoryRows"
                      :key="s.key"
                      class="ww-line-item"
                      :class="s.tone"
                    >{{ s.text }}</div>
                  </div>
                </div>

                <!-- 逐夜的行动日志 -->
                <div class="ww-feed">
                  <div class="ww-feed-title"><i class="fa-solid fa-scroll"></i> 赛后复盘 · 夜间行动日志</div>
                  <div class="ww-feed-list">
                    <div v-if="!replayLog.length" class="ww-chat-empty">这一局没有任何夜间行动记录</div>
                    <div v-for="l in replayLog" :key="l.id" class="ww-line-item">{{ l.text }}</div>
                  </div>
                </div>

                <!-- 复盘看完了，给一个出口（弹窗这时已经收起来了） -->
                <div class="ww-choice" style="margin-top: 16px; text-align: center">
                  <button v-if="canRestart" class="ww-btn is-primary" @click="backToStart">
                    <i class="fa-solid fa-rotate-right"></i> 再来一局
                  </button>
                </div>
              </template>
          </div>
        </template>
      </div>

      <!--  频道 + 在场信息 —— 刻意放在 .ww-card 之外（用户要求）：
           卡片只装「对局本身」，信息流单独成栏，页面因此能铺到 1440px 而不是被卡片挤成一条。
           列车广播（帕姆的播报）已按用户要求搬回卡片内，见 WolfSelfPanel 里的 .ww-feed-cast。  -->
      <aside v-if="started" class="ww-sidebar">
              <div class="ww-feed">
                <div class="ww-feed-title">
                  <i class="fa-solid fa-comments"></i> 频道
                  <span style="margin-left: auto; font-weight: 400">（{{ chatHint }}）</span>
                </div>
                <WolfChat
                  :messages="view.chat"
                  :channels="channels"
                  :self-id="myId"
                  :can-send="canChat"
                  :dead-ids="deadIds"
                  :firefly-ids="fireflyIds"
                  @send="onSendChat"
                />
              </div>

              <div class="ww-info">
                <div><i class="fa-solid fa-users"></i> 在场 <b>{{ view.alive.length }}</b> / {{ seatCount }}</div>
                <!-- 开拓者进度 = 狼人的胜利进度条，公开可见（只是数量，不暴露谁是谁） -->
                <div v-if="view.villagers.total > 0" class="is-villager">
                  <i class="fa-solid fa-user-astronaut"></i> {{ TERMS.villagerName }}剩余
                  <b>{{ view.villagers.left }}</b> / {{ view.villagers.total }}
                  <em v-if="view.villagers.left === 0">已全被抓走</em>
                </div>
                <div v-if="myRole"><i class="fa-solid fa-id-badge"></i> 你的身份：<b>{{ myRoleName }}</b></div>
                <div v-if="isMp"><i class="fa-solid fa-key"></i> 房间 <b>{{ mp.roomCode }}</b></div>
                <div class="is-tip">{{ infoTip }}</div>
              </div>
      </aside>
    </div>

    <!--  结算  -->
    <div v-if="overlay === 'over'" class="ww-overlay">
      <div class="ww-modal">
        <div class="ww-modal-title">
          <i class="fa-solid" :class="iWin ? 'fa-trophy' : 'fa-moon'"></i>
          {{ resultTitle }}
        </div>
        <div class="ww-modal-sub">{{ resultSub }}</div>

        <div v-if="rewardResult" class="ww-reward-list">
          <div v-for="(it, i) in rewardResult.items" :key="i" class="ww-reward-row">
            <span>{{ it.label }}</span><b>+{{ it.amount }}</b>
          </div>
          <div class="ww-reward-total">
            <span>合计</span><b>+{{ rewardResult.total }} 金币</b>
          </div>
        </div>

        <div v-if="revealList.length" class="ww-reveal-grid">
          <div
            v-for="r in revealList"
            :key="r.id"
            class="ww-reveal-item"
            :class="{ 'is-wolf': isWolfFn(r.role), 'is-dead': !view.alive.includes(r.id) }"
          >
            <span class="ww-avatar-dot">{{ r.seat }}</span>
            <span>{{ r.name }}</span>
            <b style="margin-left: auto; color: var(--ww-gold)">{{ r.label }}</b>
          </div>
        </div>

        <div class="ww-modal-btns">
          <button class="ww-btn" @click="openReplay">
            <i class="fa-solid fa-scroll"></i> 查看赛后复盘
          </button>
          <button v-if="canRestart" class="ww-btn is-primary" @click="backToStart">
            <i class="fa-solid fa-rotate-right"></i> 再来一局
          </button>
          <button class="ww-btn" @click="onBack">
            <i class="fa-solid fa-arrow-left"></i> {{ isMp ? '返回大厅' : '返回主页' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 流萤离场：全屏暗一下 -->
    <div v-if="fireflyFade" class="ww-firefly-fade"></div>
  </div>
</template>

<script setup>
//  萤火夜话 · 视图层

import { computed } from 'vue'
import { useMultiplayerStore } from '@/config/multiplayer'
import { useGoldStore } from '@/config/gold'
import {
  ROLES, ROLE, PHASE, PHASE_MS, SPEAK_MS, TERMS, BASE_TOTAL, isWolfRole, PM_AVATAR,
  NIGHT_STEPS, NIGHT_STEP_LABEL, NIGHT_STEP_MS,
} from '@/config/werewolf'
import { useWerewolfMatch } from '@/composables/useWerewolfMatch'
// 喊话的角色图统一用五子棋那套 hello.png（用户指定），不再用狼人目录里的小头像
import speakImg from '@/images/game/chess/hello.png'
import WolfSeatGrid from '@/components/werewolf/WolfSeatGrid.vue'
import WolfSelfPanel from '@/components/werewolf/WolfSelfPanel.vue'
import WolfChat from '@/components/werewolf/WolfChat.vue'

const mp = useMultiplayerStore()
const goldStore = useGoldStore()

const {
  view, started, overlay, fillWithAI, rewardResult, fireflyFade,
  pickedId, nowTs, bubbleText,
  isMp, authority, myId, isWatcher,
  seatCapacity, shortBy, canStart, startBtnText, setupLine, waitingMe,
  startGame, onAct, onSeatPick, onSendChat,
  onSpeak, doSkipSpeak, skipPhase,
  onBack, backToStart,
} = useWerewolfMatch()

// 每位玩家的发言时长（秒），文案里要引，跟引擎共用同一个数
const SPEAK_SEC = Math.round(SPEAK_MS / 1000)

//  基础派生 
const isDayPhase = computed(() =>
  [PHASE.DAY, PHASE.LAST_WORDS, PHASE.SPEAKING, PHASE.DISCUSS, PHASE.VOTE, PHASE.HUNTER].includes(view.phase)
)
const myRole = computed(() => view.me?.roleKey || '')
const myRoleName = computed(() => {
  const r = ROLES[myRole.value]
  return r ? `${r.name}·${r.title}` : '旁观者'
})
const isWolfSelf = computed(() => isWolfRole(myRole.value))
const mateIds = computed(() => (isWolfSelf.value ? view.me?.mates || [] : []))
const spectator = computed(() => started.value && !myRole.value)
const seatCount = computed(() => view.players.length)
const seatRevealed = computed(() => view.allRoles || view.reveal)
const canRestart = computed(() => !isMp.value || authority.value)
const isWolfFn = (r) => isWolfRole(r)

// 玩家自己设定的头像（设置页写入的 avatarData，data URL）。
// 快照里只带 AI 头像，真人头像不下发 —— 所以「自己那一张」在这里本地取。
const selfAvatar = (() => {
  try { return localStorage.getItem('avatarData') || '' } catch (e) { return '' }
})()

// 萤火标记只让「流萤本人」看见（判官是帕姆，不需要在座位上标）
const litIdForDisplay = computed(() =>
  myRole.value === ROLE.FIREFLY ? view.me?.fireflyInfo?.litId || '' : ''
)

// 旁观者没有身份、也没有待办动作（快照里本来就不给他发身份）
const myPending = computed(() =>
  isWatcher.value ? '' : view.phase === PHASE.NIGHT ? view.me?.pending || '' : ''
)

const targets = computed(() => {
  const lastLit = view.me?.fireflyInfo?.lastLitId || ''
  const mates = mateIds.value
  return view.players
    .filter((p) => p.id !== myId.value && view.alive.includes(p.id))
    .map((p) => {
      let disabled = false
      let reason = ''
      let mark = ''
      // 银狼现在可以骇入同伴（同类）—— 不再禁用，只打个「同伴」标记提醒一下
      if (myPending.value === 'wolf-kill' && mates.includes(p.id)) mark = '同伴'
      if (myPending.value === 'firefly-light' && p.id === lastLit) {
        disabled = true
        reason = '不能连续两晚照亮同一人'
      }
      return { id: p.id, name: p.name, seat: p.seat, disabled, reason, mark }
    })
})

const voteCounts = computed(() => {
  const out = {}
  Object.keys(view.votes).forEach((voter) => {
    const t = view.votes[voter]
    if (!t) return
    out[t] = (out[t] || 0) + 1
  })
  return out
})

const nameOf = (id) => view.players.find((p) => p.id === id)?.name || '？'

//  遗言 / 轮流发言 
const speaking = computed(() => view.speaking || null)
const currentSpeakerName = computed(() => (speaking.value?.current ? nameOf(speaking.value.current) : ''))
const isMySpeakTurn = computed(() => !!speaking.value?.current && speaking.value.current === myId.value)
// 「第 N / M 位」（发完了不让它显示成 M+1 / M）
const speakPos = computed(() => {
  const sp = speaking.value
  if (!sp) return ''
  return `第 ${Math.min(sp.index + 1, sp.order.length)} / ${sp.order.length} 位`
})

//  投票：改票 / 弃票 
// 平票重投时「投与不投」都要能表达，所以单独给一个弃票出口。
const myVoteId = computed(() => view.votes[myId.value] || '')
const hasVoted = computed(() => view.votes[myId.value] !== undefined)
const myVoteName = computed(() => (myVoteId.value ? nameOf(myVoteId.value) : ''))
const onAbstain = () => onAct({ action: 'vote', targetId: '' })

// 反击：放下这一枪
const onHunterPass = () => onAct({ action: 'hunter-pass' })

//  轮到你了吗 —— 卡片里唯一的那条提示条 
const myTurn = computed(() => {
  const me = myId.value
  const alive = view.alive.includes(me)

  // 夜晚分步：轮到你的那一步
  if (view.phase === PHASE.NIGHT && alive && myPending.value) {
    const need = {
      'wolf-kill': `点一名乘客的座位「${TERMS.kill}」他；不想动手就走身份面板里的「本夜不动手」。`,
      'seer-check': `点一名乘客的座位完成${TERMS.seerCheck}，你会得知他属于哪个阵营；不想验就走身份面板里的「本夜不感应」。`,
      witch: '用身份面板里的咖啡 / 毒咖啡，或者选「本夜都不用」。',
      'firefly-light': '点一名乘客的座位，把萤火留在他那里；不想照就走身份面板里的「本夜不照亮」。',
    }[myPending.value] || '做出你这一步的选择。'
    return {
      icon: 'fa-solid fa-hand-pointer',
      title: `轮到你 · ${NIGHT_STEP_LABEL[view.nightStep] || TERMS.night}`,
      hint: need,
      buttons: [],
    }
  }

  // 反击：丹恒已经离场，所以不能用 alive 判断
  if (view.phase === PHASE.HUNTER && view.me?.hunterPending) {
    return {
      icon: 'fa-solid fa-dragon',
      title: `轮到你发动「${TERMS.hunterShoot}」`,
      hint: '点一名乘客的座位，他会与你一同离场；也可以放下这一枪。',
      buttons: [
        { key: 'pass', label: '放下这一枪', icon: 'fa-solid fa-ban', cls: 'is-ghost', run: onHunterPass },
      ],
    }
  }

  if (isMySpeakTurn.value) {
    const last = speaking.value?.mode === 'lastwords'
    return {
      icon: last ? 'fa-solid fa-comment-dots' : 'fa-solid fa-microphone-lines',
      title: last ? `遗言 · 轮到你（${speakPos.value}）` : `轮流发言 · 轮到你（${speakPos.value}）`,
      hint: `直接到右侧「${TERMS.publicChannel}」频道里说 —— 所有的话都在频道里出。说完自动轮到下一位。`,
      buttons: [
        { key: 'skip', label: '这次不说', icon: 'fa-solid fa-forward-step', cls: 'is-ghost', run: doSkipSpeak },
      ],
    }
  }

  if (view.phase === PHASE.VOTE && alive) {
    return {
      icon: 'fa-solid fa-gavel',
      title: myVoteName.value
        ? `已投给 ${myVoteName.value}`
        : (hasVoted.value ? '本轮弃票' : `${TERMS.vote} · 还没投`),
      hint: '点座位投票，可以反复改票；不想投就点弃票。',
      buttons: [
        { key: 'abstain', label: '弃票', icon: 'fa-solid fa-ban', cls: 'is-ghost', run: onAbstain },
      ],
    }
  }

  if (view.phase === PHASE.DISCUSS && alive) {
    return {
      icon: 'fa-solid fa-comments',
      title: `${TERMS.discuss}阶段`,
      hint: `在右侧「${TERMS.publicChannel}」说一句，梦境才会继续往下走。`,
      buttons: canSkipPhase.value
        ? [{ key: 'skip', label: '没什么好说的', icon: 'fa-solid fa-forward-step', cls: 'is-ghost', run: onSkipPhase }]
        : [],
    }
  }

  return null
})

//  单人模式的阶段跳过
const canSkipPhase = computed(
  () =>
    started.value &&
    !isMp.value &&
    !isWatcher.value &&
    view.phase !== PHASE.OVER &&
    view.phase !== PHASE.IDLE
)
const onSkipPhase = () => skipPhase()

// 座位上的选中标记：投票阶段看「我投给了谁」，夜里看「我刚点了谁」
const seatPickedId = computed(() =>
  view.phase === PHASE.VOTE ? view.votes[myId.value] || '' : pickedId.value
)

const canPickSeat = computed(() => {
  if (isWatcher.value) return false   // 旁观者点不动任何座位
  // 反击：丹恒此刻已经离场，所以必须放在 alive 判断之前
  if (view.phase === PHASE.HUNTER) return !!view.me?.hunterPending
  if (!view.alive.includes(myId.value)) return false
  if (view.phase === PHASE.VOTE) return true
  if (view.phase === PHASE.NIGHT && myPending.value && myPending.value !== 'witch') return true
  return false
})

// 什么时候能说话
const canChat = computed(() => {
  if (isWatcher.value) return false   // 旁观者只听不说
  if (view.phase === PHASE.LAST_WORDS || view.phase === PHASE.SPEAKING) {
    return view.speaking?.current === myId.value
  }
  return view.phase === PHASE.DISCUSS && view.alive.includes(myId.value)
})
const deadIds = computed(() =>
  view.players.filter((p) => !view.alive.includes(p.id)).map((p) => p.id)
)
const fireflyIds = computed(() => {
  const src = view.allRoles || view.reveal || {}
  return Object.keys(src).filter((id) => src[id] === ROLE.FIREFLY)
})

const channels = computed(() => {
  const list = [{ key: 'day', label: TERMS.publicChannel, icon: 'fa-solid fa-tower-broadcast' }]
  if (isWolfSelf.value && view.alive.includes(myId.value)) {
    list.push({ key: 'wolf', label: TERMS.wolfChannel, icon: 'fa-solid fa-lock' })
  }
  return list
})

// 频道标题右边那句提示：现在是哪一段、能不能说话、轮到谁
const chatHint = computed(() => {
  if (view.phase === PHASE.DISCUSS) return '自由发言中'
  if (view.phase === PHASE.LAST_WORDS || view.phase === PHASE.SPEAKING) {
    return isMySpeakTurn.value
      ? '轮到你了，说点什么'
      : `等轮到你（现在轮到 ${currentSpeakerName.value || '…'}）`
  }
  if (view.phase === PHASE.VOTE) return '投票请在座位上点'
  if (view.phase === PHASE.NIGHT) return '白天才能发言'
  return `只有${TERMS.discuss}阶段能自由发言`
})

//  阶段文案 
const phaseLabel = computed(() => {
  switch (view.phase) {
    case PHASE.NIGHT: return `${TERMS.night} · 第 ${view.round} 夜`
    case PHASE.DAY: return `${TERMS.day} · 第 ${view.round} 天`
    case PHASE.LAST_WORDS: return '遗言 · 昨夜离场的乘客'
    case PHASE.SPEAKING: return '轮流发言'
    case PHASE.DISCUSS: return `${TERMS.discuss}阶段 · 自由发言`
    case PHASE.VOTE: return view.voteRound > 1 ? `${TERMS.vote} · 平票重投（第 ${view.voteRound} 轮）` : `${TERMS.vote} · ${TERMS.exile}`
    case PHASE.HUNTER: return `${TERMS.hunterShoot} · 丹恒的最后一击`
    case PHASE.OVER: return '本局结束'
    default: return '等待开始'
  }
})

const phaseIcon = computed(() => {
  switch (view.phase) {
    case PHASE.NIGHT: return 'fa-solid fa-moon'
    case PHASE.DAY: return 'fa-solid fa-sun'
    case PHASE.LAST_WORDS: return 'fa-solid fa-comment-dots'
    case PHASE.SPEAKING: return 'fa-solid fa-microphone-lines'
    case PHASE.DISCUSS: return 'fa-solid fa-comments'
    case PHASE.VOTE: return 'fa-solid fa-gavel'
    case PHASE.HUNTER: return 'fa-solid fa-dragon'
    default: return 'fa-solid fa-star'
  }
})

const phaseSub = computed(() => {
  switch (view.phase) {
    case PHASE.NIGHT:
      return `按顺序出手：银狼${TERMS.kill} → 瓦尔特${TERMS.seerCheck} → 姬子调饮 → 流萤${TERMS.fireflyLight}`
    case PHASE.DAY: return view.feed.slice(-1)[0]?.text || '公布昨夜的结果'
    case PHASE.LAST_WORDS: return '谁被骇入谁先开口 —— 遗言说完了才轮到活人'
    case PHASE.SPEAKING: return `按座位顺序轮流发言，每人 ${SPEAK_SEC} 秒`
    case PHASE.DISCUSS: return '自由发言，谁都可以说，说说你怀疑谁'
    case PHASE.VOTE: return view.voteRound > 1 ? '平票重投：可以改投任何人，也可以弃票' : '点座位投票，可以改票，也可以弃票'
    case PHASE.HUNTER: return `丹恒被${TERMS.exile} —— 他可以指定一名乘客与他一同离场`
    default: return ''
  }
})

//  夜间分步 / 上一阶段 
// 「现在是第几步、这一步归谁」——用户要求把夜间顺序显式摆出来。
const nightStepLabel = computed(() =>
  (view.phase === PHASE.NIGHT ? NIGHT_STEP_LABEL[view.nightStep] || '' : '')
)
const nightStepNo = computed(() => {
  if (view.nightStep === 'done') return NIGHT_STEPS.length
  const i = NIGHT_STEPS.indexOf(view.nightStep)
  return i < 0 ? 0 : i + 1
})
// 「刚才是什么阶段」——夜里显示到具体哪一步（比如「入梦 · 银狼 · 骇入」）
const prevPhaseLabel = computed(() => {
  const p = view.prevPhase
  if (!p) return ''
  if (p === PHASE.NIGHT) {
    const s = view.prevNightStep
    return s && NIGHT_STEP_LABEL[s] ? `${TERMS.night} · ${NIGHT_STEP_LABEL[s]}` : TERMS.night
  }
  const map = {
    [PHASE.DAY]: TERMS.day,
    [PHASE.LAST_WORDS]: '遗言',
    [PHASE.SPEAKING]: '轮流发言',
    [PHASE.DISCUSS]: TERMS.discuss,
    [PHASE.VOTE]: TERMS.vote,
    [PHASE.HUNTER]: TERMS.hunterShoot,
    [PHASE.OVER]: '本局结束',
    [PHASE.IDLE]: '等待开始',
  }
  return map[p] || p
})

const phaseShortLabel = computed(() => (view.phase === PHASE.NIGHT ? TERMS.night : TERMS.day))

const remain = computed(() => {
  if (!view.deadline) return 0
  return Math.max(0, Math.ceil((view.deadline - nowTs.value) / 1000))
})

// 进度条的分母：夜晚按「当前这一步」算（每一步各有各的限时），其余阶段按 PHASE_MS
const phaseTotalMs = computed(() => {
  if (view.phase === PHASE.NIGHT) return NIGHT_STEP_MS[view.nightStep] || PHASE_MS[PHASE.NIGHT]
  return PHASE_MS[view.phase] || 0
})

const phaseProgress = computed(() => {
  const total = phaseTotalMs.value
  if (!total || !view.deadline) return 100
  return Math.max(0, Math.min(100, ((view.deadline - nowTs.value) / total) * 100))
})

const waitingOthers = computed(
  () => started.value && view.phase === PHASE.NIGHT && !!myRole.value && view.alive.includes(myId.value) && !myPending.value
)

const waitingText = computed(() => {
  if (!view.alive.includes(myId.value)) return '你已经离场，只能旁观了'
  if (myRole.value === ROLE.VILLAGER) return `你是${TERMS.survivor}，${TERMS.night}里没有要做的事`
  return '你今晚的事已经做完了，等其他人'
})

const infoTip = computed(() => {
  if (view.phase === PHASE.VOTE) return view.voteRound > 1 ? '平票重投：可以改投，也可以弃票' : '点座位投票，会立刻公布票型'
  if (view.phase === PHASE.DISCUSS) return `在${TERMS.publicChannel}里发言 —— 所有的话都在频道里出`
  if (view.phase === PHASE.LAST_WORDS || view.phase === PHASE.SPEAKING) return '轮到你时，直接在频道里说'
  if (view.phase === PHASE.HUNTER) return `点座位发动${TERMS.hunterShoot}`
  if (view.phase === PHASE.NIGHT) return `${TERMS.night}中：银狼 → 瓦尔特 → 姬子 → 流萤，按顺序出手`
  if (!isMp.value && started.value) return '单人模式下你不推进，帕姆就一直停在这里（防挂机）'
  return ''
})

//  结算 
const iWin = computed(() => {
  if (!view.winner) return false
  return ROLES[myRole.value]?.camp === view.winner
})

const resultTitle = computed(() => {
  if (!view.winner) return '这一局结束了'
  return iWin.value ? '列车到站 · 你赢了' : '梦醒之后 · 你输了'
})

const resultSub = computed(() => {
  const base = view.winner === 'hunt'
    ? (view.huntReason === 'villagers'
      ? `${TERMS.teamHunt}抓走了场上的全部${TERMS.villagerName}。`
      : `${TERMS.teamHunt}取得了人数优势。`)
    : `${TERMS.teamTrain}清除了所有${TERMS.teamHunt}。`
  if (view.me?.roleKey) return `${base}你的身份是 ${myRoleName.value}。`
  return `${base}你在本局旁观。`
})

// 结算弹窗点「查看赛后复盘」→ 收起弹窗，露出卡片里的复盘面板
function openReplay() {
  overlay.value = ''
}

const revealList = computed(() =>
  view.players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    role: view.reveal[p.id] || '',
    label: ROLES[view.reveal[p.id]]?.name || '未知',
  }))
)

// 赛后复盘的全员身份板（数据来自 view.allRoles，只有结算时才下发）
const replaySeats = computed(() =>
  view.players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    role: view.allRoles?.[p.id] || '',
    label: ROLES[view.allRoles?.[p.id]]?.name || '未知',
  }))
)

// 逐夜行动日志：取最后 60 条就够复盘了（引擎侧留 120 条）
const replayLog = computed(() => (view.nightLog || []).slice(-60))

//  赛后复盘素材 
// 最后一夜：谁被骇入 / 瓦尔特验了谁 / 姬子用了什么 / 流萤照亮了谁（view.judgeInfo 仅在对局结束后才有值）
const replayRow = computed(() => {
  const g = view.judgeInfo || {}
  const who = (seat, name) => (name ? `${seat} 号 ${name}` : '—')
  const witch = []
  if (g.witchSave) witch.push(`用${TERMS.witchSave}救人`)
  if (g.witchPoisonName) {
    witch.push(`${TERMS.witchPoison} → ${g.witchPoisonSeat} 号 ${g.witchPoisonName}`)
  }
  return {
    kill: g.killName ? who(g.killSeat, g.killName) : '本夜没有定刀',
    seer: g.seerName
      ? `${who(g.seerSeat, g.seerName)} → ${g.seerTeamLabel || '未知'}`
      : '本夜没有感应',
    witch: witch.length ? witch.join(' · ') : '本夜没有调饮',
    firefly: g.fireflyName ? who(g.fireflySeat, g.fireflyName) : '本夜没有照亮',
  }
})

// 瓦尔特整局验过谁 —— 复盘时一眼看到每一次的「好人 / 坏人」
const seerHistoryRows = computed(() =>
  (view.seerHistory || []).map((h) => {
    const p = view.players.find((x) => x.id === h.targetId)
    const isWolf = h.team === 'hunt'
    return {
      key: `s${h.round}-${h.targetId}`,
      tone: isWolf ? 'is-bad' : 'is-good',
      text: `第 ${h.round} 夜：${p?.seat ?? ''} 号 ${p?.name || h.targetId} → `
        + (isWolf ? `${TERMS.teamHunt}（坏人）` : `${TERMS.teamTrain}（好人）`),
    }
  })
)
</script>

<style src="@/assets/styles/werewolf.css"></style>
