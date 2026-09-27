<template>
  <div class="notify-page">
    <div class="notify-body">
      <button class="back-btn" title="返回主页" @click="goBack">
        <i class="fa-solid fa-arrow-left"></i>
        <span>返回</span>
      </button>
      <div class="notify-title">签到 &amp; 进阶</div>

      <div class="layout">
        <aside class="sidebar">
          <!-- 角色信息 -->
          <div class="char-card">
            <div class="char-avatar">
              <img v-if="avatarUrl" :src="avatarUrl" alt="头像" />
              <i v-else class="fa-solid fa-user"></i>
            </div>
            <div class="char-info">
              <div class="char-name">{{ username }}</div>
              <div class="char-level">
                <span class="lv-badge">Lv.{{ level }}</span>
                <div class="exp-bar">
                  <div class="exp-fill" :style="{ width: expPercent + '%' }"></div>
                  <span class="exp-text">{{ exp }} / {{ expMax }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 换装卡片 -->
          <div class="outfit-card">
            <div class="outfit-card-header">
              <i class="fa-solid fa-shirt"></i>
              <span class="outfit-card-title">服装</span>
            </div>
            <div class="outfit-card-body">
              <div class="outfit-current">
                <img :src="equippedClothing?.gameImg || fireflyYuan" :alt="equippedClothing?.name || '默认形象'" class="outfit-current-img" />
                <span class="outfit-current-name">{{ equippedClothing ? equippedClothing.name : '默认形象' }}</span>
              </div>
              <button class="outfit-change-btn" @click="openOutfitPicker" title="更换服装">
                <i class="fa-solid fa-arrows-rotate"></i>
                <span>更换服装</span>
              </button>
            </div>
          </div>

          <!-- 金币和签到天数 -->
          <div class="stat-row">
            <div class="stat-mini">
              <i class="fa-solid fa-coins"></i>
              <span>{{ goldStore.currentGold }}</span>
            </div>
            <div class="stat-mini">
              <i class="fa-solid fa-fire"></i>
              <span>{{ consecutiveDays }} 天连签</span>
            </div>
          </div>

          <!-- 快捷传送 -->
          <div class="quick-nav">
            <div class="section-label">快捷传送</div>
            <div class="nav-grid">
              <button class="nav-btn" @click="goTo('/shop')" title="商店">
                <i class="fa-solid fa-store"></i>
                <span>商店</span>
              </button>
              <button class="nav-btn" @click="goTo('/warehouse')" title="仓库">
                <i class="fa-solid fa-warehouse"></i>
                <span>仓库</span>
              </button>
              <button class="nav-btn" @click="goTo('/set')" title="设置">
                <i class="fa-solid fa-gear"></i>
                <span>设置</span>
              </button>
              <button class="nav-btn" @click="goTo('/music')" title="音乐">
                <i class="fa-solid fa-music"></i>
                <span>音乐</span>
              </button>
              <button class="nav-btn nav-btn-wide" @click="goTo('/multiplayer')" title="多人游戏">
                <i class="fa-solid fa-tower-broadcast"></i>
                <span>多人游戏</span>
              </button>
            </div>
          </div>

          <!-- 流萤的记忆 -->
          <div class="memory-entry">
            <button class="memory-entry-btn" @click="showMemory = true" title="查看流萤记住的事情">
              <!-- <i class="fa-solid fa-brain"></i> -->
              <span>流萤的记事本</span>
            </button>
          </div>

          <!-- 永久加成位 -->
          <div class="buff-section">
            <div class="section-label">永久加成</div>
            <div class="buff-slots">
              <div
                v-for="(slot, idx) in permanentBuffs"
                :key="idx"
                class="buff-slot"
                :class="{ empty: !slot }"
                :title="slot ? slot.decoName : '点击添加装饰品'"
              >
                <template v-if="slot">
                  <!-- 装饰品小图标 -->
                  <div class="slot-deco-wrap">
                    <img v-if="isBuffImg(slot.decoIcon)" :src="slot.decoIcon" :alt="slot.decoName" class="slot-deco slot-deco-img" />
                    <i v-else :class="slot.decoIcon || 'fa-solid fa-gem'" class="slot-deco"></i>
                  </div>
                  <!-- 加成类型图标 + 数值 + 名称 -->
                  <div class="slot-detail">
                    <div class="slot-buff-row">
                      <i :class="slot.buffIcon" class="slot-buff-icon"></i>
                      <span class="slot-buff-name">{{ slot.buffName }}</span>
                      <span class="slot-buff-value">+{{ slot.value }}{{ slot.suffix }}</span>
                    </div>
                    <div class="slot-deco-from">来自：{{ slot.decoName }}</div>
                  </div>
                  <!-- 独立移除按钮：点击才移除，不点即取消，不会误删 -->
                  <button type="button" class="slot-remove-btn" @click.stop="handleRemoveBuff(slot.uid)" title="移除该加成">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </template>
                <template v-else>
                  <button type="button" class="slot-empty-btn" @click="openBuffPicker()">
                    <i class="fa-regular fa-square-plus slot-empty-icon"></i>
                    <span class="slot-empty-text">空槽位</span>
                  </button>
                </template>
              </div>
            </div>
          </div>

          <!-- 装饰品选择弹窗 -->
          <div v-if="showBuffPicker" class="buff-picker-mask" @click="showBuffPicker = false">
            <div class="buff-picker" @click.stop>
              <div class="buff-picker-header">
                <span>选择装饰品</span>
                <button class="buff-picker-close" @click="showBuffPicker = false">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div v-if="availableDecorations.length" class="buff-picker-list">
                <div
                  v-for="item in availableDecorations"
                  :key="item.id"
                  class="buff-picker-item"
                  @click="handlePickDecoration(item)"
                >
                  <div class="picker-item-icon">
                    <img v-if="isBuffImg(item.icon)" :src="item.icon" :alt="item.name" class="picker-item-img" />
                    <i v-else :class="item.icon || 'fa-solid fa-gem'"></i>
                  </div>
                  <div class="picker-item-info">
                    <div class="picker-item-name">{{ item.name }}</div>
                    <div class="picker-item-desc">
                      <span>可选：{{ getAllowedTypesText(item) }}</span>
                      <span class="picker-item-count">剩余 x{{ item.remaining }}</span>
                    </div>
                  </div>
                  <i class="fa-solid fa-plus picker-item-add"></i>
                </div>
              </div>
              <div v-else class="buff-picker-empty">
                <i class="fa-regular fa-folder-open"></i>
                <p>暂无可选装饰品</p>
                <p class="buff-picker-hint">前往商店购买或仓库查看拥有的装饰品</p>
              </div>
            </div>
          </div>

          <!-- 加成类型选择弹窗（随机四选一） -->
          <div v-if="showBuffTypePicker" class="buff-picker-mask" @click="closeBuffTypePicker">
            <div class="buff-picker buff-type-picker" @click.stop>
              <div class="buff-picker-header">
                <div class="type-picker-title">
                  <span>激活「{{ pendingDecoration?.name }}」</span>
                  <div class="type-picker-subtitle">{{ pendingDecoration?.allowedBuffTypes ? '限定类型 · 数值 40%~55%，稀有可出 75%/100%' : '从以下加成中选一种（数值 10%~50%）' }}</div>
                </div>
                <button class="buff-picker-close" @click="closeBuffTypePicker">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div class="type-picker-candidates">
                <div
                  v-for="cand in buffCandidates"
                  :key="cand.key"
                  class="type-card"
                  @click="handleSelectBuffType(cand)"
                >
                  <div class="type-card-icon">
                    <i :class="cand.icon"></i>
                  </div>
                  <div class="type-card-info">
                    <div class="type-card-name">{{ cand.name }}</div>
                    <div class="type-card-desc">{{ cand.desc }}</div>
                  </div>
                  <div class="type-card-value">
                    <span class="type-card-num">+{{ cand.value }}{{ cand.suffix }}</span>
                  </div>
                </div>
              </div>
              <div class="type-picker-footer">
                <button class="btn-secondary" @click="rerollCandidates">
                  <i class="fa-solid fa-dice"></i>
                  重新抽取
                  <span v-if="remainingFreeRerolls > 0" class="reroll-cost free">剩 {{ remainingFreeRerolls }} 次免费</span>
                  <span v-else class="reroll-cost">{{ nextRerollCost }} 金币</span>
                </button>
                <span class="type-picker-tip">再次点击装饰品可重新进入本界面</span>
              </div>
            </div>
          </div>

          <!-- 换装弹窗 -->
          <div v-if="showOutfitPicker" class="buff-picker-mask" @click="showOutfitPicker = false">
            <div class="buff-picker outfit-picker" @click.stop>
              <div class="buff-picker-header">
                <span>更换服装</span>
                <button class="buff-picker-close" @click="showOutfitPicker = false">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div class="outfit-picker-list">
                <div
                  v-for="item in outfitOptions"
                  :key="item.isDefault ? '__default__' : item.id"
                  class="outfit-picker-item"
                  :class="{ active: item.isDefault ? equippedClothingId == null : equippedClothingId === item.id }"
                  @click="handleEquipClothing(item)"
                >
                  <img :src="item.gameImg" :alt="item.name" class="outfit-picker-img" />
                  <div class="outfit-picker-info">
                    <div class="outfit-picker-name">{{ item.name }}</div>
                    <div class="outfit-picker-desc">{{ item.desc }}</div>
                  </div>
                  <i v-if="(item.isDefault ? equippedClothingId == null : equippedClothingId === item.id)" class="fa-solid fa-circle-check outfit-picker-check"></i>
                </div>
              </div>
              <div class="outfit-picker-footer">
                <button class="btn-secondary" @click="handleUnequipClothing" :disabled="!equippedClothingId">
                  <i class="fa-solid fa-eraser"></i>
                  脱下服装
                </button>
                <span class="type-picker-tip">穿戴后将在主页展示人物立绘</span>
              </div>
            </div>
          </div>

          <!-- 统计卡片 -->
          <div class="sidebar-stats">
            <div class="sidebar-stat">
              <span class="num">{{ totalSignDays }}</span>
              <span class="label">总签到</span>
            </div>
            <div class="sidebar-stat">
              <span class="num">{{ tasksStore.completedCount }}/{{ tasksStore.totalCount }}</span>
              <span class="label">任务进度</span>
            </div>
          </div>
        </aside>

        <main class="main-content">
          <!-- 签到日历 -->
          <section class="signin-section">
            <div class="section-header">
              <h2><i class="fa-solid fa-calendar-check"></i> 签到日历</h2>
              <div class="signin-actions">
                <button class="btn-secondary" @click="handleMakeupSign" :disabled="!canMakeupSign" title="消耗金币补签昨天">
                  <i class="fa-solid fa-arrow-rotate-left"></i>
                  补签(500金)
                </button>
                <button class="btn-gold" @click="handleSign" :disabled="!canSign">
                  <i class="fa-solid fa-check"></i>
                  {{ signedToday ? '今日已签到' : '今日签到' }}
                </button>
              </div>
            </div>

            <!-- 月份切换 -->
            <div class="calendar-nav">
              <button class="cal-nav-btn" @click="prevMonth" title="上个月">
                <i class="fa-solid fa-chevron-left"></i>
              </button>
              <div class="cal-title">
                <select class="year-select" v-model="viewYear" @change="onYearChange">
                  <option v-for="y in yearOptions" :key="y" :value="y">{{ y }} 年</option>
                </select>
                <select class="month-select" v-model.number="viewMonth" @change="onMonthChange">
                  <option v-for="m in 12" :key="m" :value="m">{{ m }} 月</option>
                </select>
              </div>
              <button class="cal-nav-btn" @click="nextMonth" title="下个月">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
            </div>

            <!-- 星期表头 -->
            <div class="week-header">
              <div v-for="w in weekNames" :key="w" class="week-cell" :class="{ weekend: w === '日' || w === '六' }">{{ w }}</div>
            </div>

            <!-- 日期网格 -->
            <div class="signin-grid calendar-grid">
              <div
                v-for="(cell, idx) in calendarCells"
                :key="idx"
                class="signin-cell cal-cell"
                :class="{
                  empty: !cell.date,
                  signed: cell.signed,
                  today: cell.isToday,
                  weekend: cell.isWeekend,
                  future: cell.isFuture,
                }"
              >
                <template v-if="cell.date">
                  <div class="cell-day">{{ cell.date }}</div>
                  <div v-if="cell.signed" class="cell-check">
                    <i class="fa-solid fa-check"></i>
                  </div>
                  <div v-if="cell.isToday && !cell.signed" class="cell-today-tag">今日</div>
                  <div v-if="cell.isToday && cell.signed" class="cell-today-tag signed-tag">已签</div>
                </template>
              </div>
            </div>
          </section>

          <!-- 任务 -->
          <section class="task-section">
            <div class="section-header">
              <h2><i class="fa-solid fa-trophy"></i> 任务</h2>
              <div class="signin-actions">
                <span class="task-overview">
                  已完成 <b>{{ tasksStore.completedCount }}</b> / {{ tasksStore.totalCount }}
                  &nbsp;·&nbsp;
                  待领取 <b class="claim-num">{{ tasksStore.claimableCount }}</b>
                </span>
                <button class="btn-gold" @click="handleClaimAll" :disabled="tasksStore.claimableCount === 0">
                  <i class="fa-solid fa-gift"></i>
                  一键领取
                </button>
              </div>
            </div>

            <!-- 分类标签 -->
            <div class="cat-tabs">
              <button
                v-for="cat in tasksStore.categoryMeta"
                :key="cat.key"
                class="cat-tab"
                :class="{ active: activeCategory === cat.key }"
                @click="activeCategory = cat.key"
              >
                <i :class="cat.icon"></i>
                <span>{{ cat.name }}</span>
              </button>
            </div>

            <!-- 任务列表 -->
            <div class="task-list adv-task-list">
              <div v-for="task in displayedTasks" :key="task.id" class="task-item adv-task-item" :class="{ claimed: task.isClaimed }">
                <div class="task-icon" :class="task.category">
                  <i :class="task.icon"></i>
                </div>
                <div class="task-info">
                  <div class="task-name-row">
                    <span class="task-name">{{ task.name }}</span>
                    <span v-if="!task.isClaimed && task.isCompleted" class="done-badge"><i class="fa-solid fa-circle-check"></i> 可领取</span>
                  </div>
                  <div class="task-desc">{{ task.desc }}</div>
                  <div class="task-progress-bar">
                    <div class="task-progress-fill" :style="{ width: task.percent + '%' }"></div>
                    <span class="task-progress-text">
                      {{ task.current }} / {{ task.target }} {{ taskUnit(task) }}
                      <span v-if="taskUnitHint(task)" class="task-progress-hint">（{{ taskUnitHint(task) }}）</span>
                      · {{ task.percent }}%
                    </span>
                  </div>
                </div>
                <div class="task-right">
                  <div class="task-reward">
                    <div class="reward-line">
                      <i class="fa-solid fa-coins"></i>
                      <span>+{{ task.reward }}</span>
                    </div>
                    <div v-if="task.rewardExp" class="reward-line exp-line">
                      <i class="fa-solid fa-star"></i>
                      <span>+{{ task.rewardExp }} 经验</span>
                    </div>
                  </div>
                  <button
                    class="btn-claim-small"
                    :class="{ ready: task.canClaim }"
                    :disabled="!task.canClaim"
                    @click="handleClaimTask(task.id)"
                  >
                    <i v-if="task.isClaimed" class="fa-solid fa-check-double"></i>
                    <i v-else-if="task.canClaim" class="fa-solid fa-gift"></i>
                    <i v-else class="fa-solid fa-lock"></i>
                    <span>{{ task.isClaimed ? '已领取' : (task.canClaim ? '领取' : '未完成') }}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 底部公告 -->
          <section class="announcement">
            <div class="announce-icon">
              <i class="fa-solid fa-bullhorn"></i>
            </div>
            <div class="announce-content">
              <div class="announce-title">{{ announcement.title }}</div>
              <div class="announce-text">{{ announcement.text }}</div>
            </div>
          </section>
        </main>
      </div>

      <!-- Toast -->
      <div v-if="toast.show" class="toast" :class="toast.type">
        <i :class="toast.icon"></i>
        <span>{{ toast.text }}</span>
      </div>

      <!-- 流萤的记忆弹窗 -->
      <MemoryViewer v-model="showMemory" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useInventoryStore, changeAffection } from '@/config/inventory'
import { useGoldStore } from '@/config/gold'
import { useUserStore } from '@/config/user'
import { useTasksStore } from '@/config/tasks'
import { useToastStore } from '@/config/toast'
import { getSignGreeting } from '@/config/greetings'
import MemoryViewer from '@/components/MemoryViewer.vue'
import fireflyYuan from '@/images/game/firefly_yuan.png'

const router = useRouter()
const store = useInventoryStore()
const goldStore = useGoldStore()
const userStore = useUserStore()
const tasksStore = useTasksStore()
const toastStore = useToastStore()

onMounted(() => {
  store.loadData()
  goldStore.loadData()
  userStore.loadData()
  tasksStore.loadData()
  loadSigninData()
  loadSelectedBuffs()
  syncBuffStats()
  // 同步服装/物品数量到任务统计
  syncInventoryStats()
  // 每日首次上线 +10 好感度
  checkDailyLogin()
})

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}

const goTo = (path) => {
  router.push(path)
}

// 流萤的记忆
const showMemory = ref(false)

//玩家信息
const username = computed(() => userStore.currentUser || '玩家')
const avatarUrl = computed(() => {
  const saved = localStorage.getItem('avatarData')
  return saved || ''
})
const LEVEL_KEY = 'player_level_data'

const loadLevelData = () => {
  const saved = localStorage.getItem(LEVEL_KEY)
  if (saved) {
    try {
      const p = JSON.parse(saved)
      level.value = p.level ?? 0
      exp.value = p.exp ?? 0
    } catch (e) {
      console.warn('读取等级数据失败')
    }
  }
}
const saveLevelData = () => {
  localStorage.setItem(LEVEL_KEY, JSON.stringify({
    level: level.value,
    exp: exp.value,
  }))
}

const level = ref(0)
const exp = ref(0)
// 升级所需经验每级递增
const expMax = computed(() => (level.value + 1) * 100)
const expPercent = computed(() => expMax.value > 0 ? Math.floor((exp.value / expMax.value) * 100) : 0)

const addExp = (gain) => {
  if (gain <= 0) return
  exp.value += gain
  while (exp.value >= expMax.value) {
    exp.value -= expMax.value
    level.value += 1
    showToast(`升级了！当前等级 Lv.${level.value}`, 'success', 'fa-solid fa-arrow-trend-up')
  }
  saveLevelData()
}

//签到
const SIGNIN_KEY = 'signin_calendar_data'
const consecutiveDays = ref(0)
const totalSignDays = ref(0)
const signedToday = ref(false)
const lastSignDate = ref('')
const signedDates = ref(new Set())

const dateToKey = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const loadSigninData = () => {
  loadLevelData()
  const saved = localStorage.getItem(SIGNIN_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      consecutiveDays.value = parsed.consecutiveDays || 0
      totalSignDays.value = parsed.totalSignDays || 0
      lastSignDate.value = parsed.lastSignDate || ''
      signedDates.value = new Set(parsed.signedDates || [])
    } catch (e) {
      console.warn('读取签到数据失败')
    }
  }
  // 跨天检查：把 signedToday 重置
  const todayKey = dateToKey(new Date())
  signedToday.value = signedDates.value.has(todayKey)

  // 同步到任务 store
  tasksStore.setStat('totalSignDays', totalSignDays.value)
}

const saveSigninData = () => {
  localStorage.setItem(SIGNIN_KEY, JSON.stringify({
    consecutiveDays: consecutiveDays.value,
    totalSignDays: totalSignDays.value,
    signedToday: signedToday.value,
    lastSignDate: lastSignDate.value,
    signedDates: Array.from(signedDates.value),
  }))
}

// 判断 lastDate 的下一天是不是今天（未断签）
const isYesterday = (lastDateStr, today) => {
  if (!lastDateStr) return false
  const last = new Date(lastDateStr)
  last.setHours(0, 0, 0, 0)
  const y = new Date(today)
  y.setHours(0, 0, 0, 0)
  const diff = Math.floor((y - last) / (1000 * 60 * 60 * 24))
  return diff === 1
}

// 每日首次上线 +10 好感度（记录最后上线日期，跨天则触发一次）
const LOGIN_KEY = 'last_login_date'
const checkDailyLogin = () => {
  const today = dateToKey(new Date())
  const last = localStorage.getItem(LOGIN_KEY)
  if (last !== today) {
    changeAffection(10)
    localStorage.setItem(LOGIN_KEY, today)
    showToast('每日上线 +10 好感度', 'success', 'fa-solid fa-heart')
  }
}

const canSign = computed(() => !signedToday.value)
const canMakeupSign = computed(() => {
  //500金补签
  if (signedToday.value) return false
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yKey = dateToKey(yesterday)
  if (signedDates.value.has(yKey)) return false
  return goldStore.currentGold >= 500
})

//日历
const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth() + 1) // 1-12
const weekNames = ['日', '一', '二', '三', '四', '五', '六']

const yearOptions = computed(() => {
  const y = now.getFullYear()
  return [y - 2, y - 1, y, y + 1, y + 2]
})

const onYearChange = () => { /* v-model 自动生效 */ }
const onMonthChange = () => { /* v-model 自动生效 */ }

const prevMonth = () => {
  if (viewMonth.value === 1) {
    viewMonth.value = 12
    viewYear.value -= 1
  } else {
    viewMonth.value -= 1
  }
}
const nextMonth = () => {
  if (viewMonth.value === 12) {
    viewMonth.value = 1
    viewYear.value += 1
  } else {
    viewMonth.value += 1
  }
}

const todayKey = computed(() => dateToKey(new Date()))

const calendarCells = computed(() => {
  const y = viewYear.value
  const m = viewMonth.value
  const firstDay = new Date(y, m - 1, 1)
  const firstWeekday = firstDay.getDay()
  const daysInMonth = new Date(y, m, 0).getDate()

  const cells = []
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ date: null })
  }
  //日期
  const today = new Date()
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(y, m - 1, d)
    const key = dateToKey(cellDate)
    const weekday = cellDate.getDay()
    const isWeekend = weekday === 0 || weekday === 6
    const isToday = (y === today.getFullYear() && m === today.getMonth() + 1 && d === today.getDate())
    const isFuture = cellDate > new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
    cells.push({
      date: d,
      key,
      signed: signedDates.value.has(key),
      isToday,
      isWeekend,
      isFuture,
    })
  }
  return cells
})

//签到，补签
const SIGN_REWARDS = [100, 150, 200, 150, 200, 300, 500]
const getSignReward = (consecutive) => {
  // 每 7 天一轮回，超过 7 天按 7 天奖励 + 每月满签奖励加成
  const idx = Math.min(consecutive - 1, 6)
  return SIGN_REWARDS[idx] || 100
}

const handleSign = () => {
  if (!canSign.value) return
  const today = new Date()
  const tKey = dateToKey(today)
  if (isYesterday(lastSignDate.value, today)) {
    consecutiveDays.value += 1
  } else {
    consecutiveDays.value = 1
  }
  totalSignDays.value += 1
  signedToday.value = true
  lastSignDate.value = tKey
  signedDates.value.add(tKey)

  const goldReward = getSignReward(consecutiveDays.value)
  goldStore.addGold(goldReward, '签到奖励')

  // 同步到任务+经验
  tasksStore.addStat('totalSignDays', 1)
  addExp(10)
  // 签到 +10 好感度
  changeAffection(10)

  saveSigninData()
  saveLevelData()
  // notify 无人物图，用右上角 Toast 显示签到反馈台词
  toastStore.showToast(getSignGreeting())
  showToast(`签到成功！获得 ${goldReward} 金币 + 10 经验 + 10 好感度（连签 ${consecutiveDays.value} 天）`, 'success', 'fa-solid fa-circle-check')
}

const handleMakeupSign = () => {
  if (!canMakeupSign.value) return
  //扣500金币补签
  if (goldStore.currentGold < 500) {
    showToast('金币不足，补签需要 500 金币', 'error', 'fa-solid fa-circle-xmark')
    return
  }
  if (!goldStore.spendGold(500, '补签昨天')) {
    showToast('金币不足，补签需要 500 金币', 'error', 'fa-solid fa-circle-xmark')
    return
  }

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yKey = dateToKey(yesterday)

  // 补签昨天
  signedDates.value.add(yKey)
  consecutiveDays.value += 1
  totalSignDays.value += 1
  signedToday.value = false
  lastSignDate.value = yKey

  const goldReward = getSignReward(consecutiveDays.value)
  goldStore.addGold(goldReward, '补签奖励')

  tasksStore.addStat('totalSignDays', 1)
  addExp(8)

  saveSigninData()
  saveLevelData()
  showToast(`补签成功！获得 ${goldReward} 金币 + 8 经验（连签 ${consecutiveDays.value} 天）`, 'success', 'fa-solid fa-arrow-rotate-left')
}

// 永久加成位（最多10个）
const MAX_BUFFS = 10
const BUFF_KEY = 'player_selected_buffs'
// 判断 icon 是否为图片（非字体图标）
const isBuffImg = (icon) => icon && typeof icon === 'string' && !icon.startsWith('fa')

// 四种加成类型定义
const BUFF_TYPES = [
  { key: 'affection', name: '好感度增长', icon: 'fa-solid fa-heart',  desc: '好感度获取速度提升', suffix: '%' },
  { key: 'ap',        name: '行动点恢复', icon: 'fa-solid fa-bolt',   desc: '每日行动点恢复量增加', suffix: '%' },
  { key: 'gold',      name: '金币获取',   icon: 'fa-solid fa-coins',  desc: '所有金币收益提升', suffix: '%' },
  { key: 'luck',      name: '运气值增加', icon: 'fa-solid fa-clover', desc: '运气加成提升抽奖、掉落等概率', suffix: '%' },
]

// 一般装饰品（钟表小子，全类型可选）：10~50 随机
const randBuffValue = () => Math.floor(Math.random() * 41) + 10
// 限定类型装饰品：常规 40~55 随机；稀有极值 75（0.1%）/ 100（0.08%）
const randLimitedValue = () => {
  const r = Math.random() * 100
  if (r < 0.08) return 100
  if (r < 0.18) return 75
  return Math.floor(Math.random() * 16) + 40
}

// 为指定装饰品生成候选加成：按 allowedBuffTypes 限定可选类型，数值按档位
const buffCandidates = ref([])
const generateCandidates = (deco) => {
  const allowed = deco?.allowedBuffTypes
  const types = (allowed && allowed.length)
    ? BUFF_TYPES.filter(t => allowed.includes(t.key))
    : BUFF_TYPES
  const rand = allowed ? randLimitedValue : randBuffValue
  return types.map(b => ({ ...b, value: rand() }))
}
// 装饰品可选类型的展示文案
const getAllowedTypesText = (deco) => {
  const allowed = deco?.allowedBuffTypes
  if (!allowed || !allowed.length) return '好感度 / 行动点 / 金币 / 运气（全类型）'
  return BUFF_TYPES.filter(t => allowed.includes(t.key)).map(t => t.name).join(' / ')
}

// 玩家已配置的加成槽位：[{ uid, decorationId, typeKey, value }]
const selectedBuffs = ref([])

const loadSelectedBuffs = () => {
  const saved = localStorage.getItem(BUFF_KEY)
  let list = []
  if (saved) {
    try {
      list = JSON.parse(saved) || []
    } catch (e) {
      list = []
    }
  }
  // 加载后清理无效条目：对应装饰品不存在或数量不足的加成
  const usedCountMap = {}
  const cleaned = []
  list.forEach(sb => {
    const deco = getDecorationById(sb.decorationId)
    if (!deco) return // 装饰品不存在，丢弃
    const ownedQty = deco.count || 0
    const used = usedCountMap[sb.decorationId] || 0
    if (used >= ownedQty) return // 该装饰品的可用数量已被占满，丢弃多余的
    usedCountMap[sb.decorationId] = used + 1
    cleaned.push(sb)
  })
  if (cleaned.length !== list.length) {
    // 有清理，写回本地存储
    selectedBuffs.value = cleaned
    saveSelectedBuffs()
  } else {
    selectedBuffs.value = list
  }
}
const saveSelectedBuffs = () => {
  localStorage.setItem(BUFF_KEY, JSON.stringify(selectedBuffs.value))
}

// 获取装饰品详情（通过 id）
const getDecorationById = (id) => store.ownedDecorations.find(item => item.id === id) || null

// 已配置的加成列表（附带装饰品详情 + 加成类型信息）
const buffList = computed(() => {
  return selectedBuffs.value
    .map(sb => {
      const deco = getDecorationById(sb.decorationId)
      if (!deco) return null
      const typeInfo = BUFF_TYPES.find(t => t.key === sb.typeKey) || BUFF_TYPES[0]
      return {
        uid: sb.uid,
        decorationId: sb.decorationId,
        typeKey: sb.typeKey,
        value: sb.value,
        decoName: deco.name,
        decoIcon: deco.icon,
        buffName: typeInfo.name,
        buffIcon: typeInfo.icon,
        buffDesc: typeInfo.desc,
        suffix: typeInfo.suffix,
      }
    })
    .filter(Boolean)
})

// 仓库中的装饰品可使用次数（含数量 - 已占用）
const availableDecorations = computed(() => {
  return store.ownedDecorations
    .map(item => {
      const used = selectedBuffs.value.filter(sb => sb.decorationId === item.id).length
      return { ...item, used, remaining: (item.count || 0) - used }
    })
    .filter(item => item.remaining > 0)
})

// 已配置的加成 + 1个空槽位（未满10个时）
const permanentBuffs = computed(() => {
  const filled = buffList.value
  if (filled.length >= MAX_BUFFS) return filled
  return [...filled, null]
})

// ===== 装饰品选择弹窗 =====
const showBuffPicker = ref(false)
const openBuffPicker = () => {
  if (selectedBuffs.value.length >= MAX_BUFFS) {
    showToast('加成槽位已满', 'info', 'fa-solid fa-circle-info')
    return
  }
  showBuffPicker.value = true
}
// 选择了装饰品 → 进入加成选择
const pendingDecoration = ref(null)
const handlePickDecoration = (item) => {
  if (selectedBuffs.value.length >= MAX_BUFFS) return
  pendingDecoration.value = item
  buffCandidates.value = generateCandidates(item)
  showBuffPicker.value = false
  showBuffTypePicker.value = true
}

// ===== 加成类型选择弹窗 =====
const showBuffTypePicker = ref(false)
// 重新抽取：每日前 5 次免费，超出后首次 100 金币，之后每次 +20% 递增
const REROLL_KEY = 'player_buff_reroll'
const FREE_REROLLS = 5
const REROLL_BASE_COST = 100
const REROLL_GROWTH = 1.2
const todayStr = () => new Date().toISOString().slice(0, 10)
const loadRerollState = () => {
  let st = { date: todayStr(), count: 0 }
  try {
    const raw = localStorage.getItem(REROLL_KEY)
    if (raw) st = JSON.parse(raw) || st
  } catch (e) {}
  if (st.date !== todayStr()) st = { date: todayStr(), count: 0 }
  return st
}
const rerollState = ref(loadRerollState())
const saveRerollState = () => localStorage.setItem(REROLL_KEY, JSON.stringify(rerollState.value))
// 第 count 次（0 起）的费用：<5 免费；否则 100 × 1.2^(count-5)
const rerollCostAt = (count) => count < FREE_REROLLS ? 0 : Math.round(REROLL_BASE_COST * Math.pow(REROLL_GROWTH, count - FREE_REROLLS))
const nextRerollCost = computed(() => rerollCostAt(rerollState.value.count))
const remainingFreeRerolls = computed(() => Math.max(0, FREE_REROLLS - rerollState.value.count))
const rerollCandidates = () => {
  const cost = nextRerollCost.value
  if (cost > 0 && !goldStore.spendGold(cost, '重新抽取加成')) {
    showToast('金币不足，无法重新抽取', 'error', 'fa-solid fa-circle-xmark')
    return
  }
  rerollState.value.count += 1
  saveRerollState()
  buffCandidates.value = generateCandidates(pendingDecoration.value)
}
// 确定选择某个加成 → 写入槽位
const handleSelectBuffType = (cand) => {
  if (!pendingDecoration.value) return
  if (selectedBuffs.value.length >= MAX_BUFFS) return
  const newBuff = {
    uid: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    decorationId: pendingDecoration.value.id,
    typeKey: cand.key,
    value: cand.value,
  }
  selectedBuffs.value.push(newBuff)
  saveSelectedBuffs()
  syncBuffStats()
  showBuffTypePicker.value = false
  showToast(
    `已激活「${pendingDecoration.value.name}」：${cand.name} +${cand.value}${cand.suffix}`,
    'success',
    'fa-solid fa-circle-check'
  )
  pendingDecoration.value = null
}
const closeBuffTypePicker = () => {
  showBuffTypePicker.value = false
  pendingDecoration.value = null
}

// 同步当前装备加成数到任务统计（使用过滤后的有效加成数量）
const syncBuffStats = () => {
  tasksStore.setStat('totalBuffsEquipped', buffList.value.length)
}

// 移除加成（按 uid）—— 先弹确认框，确认后才移除
const handleRemoveBuff = async (uid) => {
  const target = buffList.value.find(sb => sb.uid === uid)
  const label = target
    ? `${target.decoName}（${target.buffName} +${target.value}${target.suffix}）`
    : '该加成'
  try {
    await ElMessageBox.confirm(
      `确认移除「${label}」吗？移除后需要重新抽取加成数值。`,
      '移除加成',
      {
        confirmButtonText: '确认移除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return // 取消移除
  }
  selectedBuffs.value = selectedBuffs.value.filter(sb => sb.uid !== uid)
  saveSelectedBuffs()
  syncBuffStats()
  showToast('已移除加成', 'info', 'fa-solid fa-circle-info')
}

// ===== 换装 =====
const equippedClothing = computed(() => store.equippedClothing)
const equippedClothingId = computed(() => store.equippedClothingId)
const equippableClothings = computed(() => store.equippableClothings)
// 默认形象配置（未穿戴任何皮肤时使用 firefly_yuan）
const DEFAULT_OUTFIT = {
  id: null,
  name: '默认形象',
  desc: '没有购入任何皮肤时的原始形象',
  gameImg: fireflyYuan,
  isDefault: true,
}
// 选择器列表 = 默认形象 + 已拥有可穿戴服装
const outfitOptions = computed(() => [DEFAULT_OUTFIT, ...equippableClothings.value])
const showOutfitPicker = ref(false)

const openOutfitPicker = () => {
  showOutfitPicker.value = true
}

const handleEquipClothing = (item) => {
  let res
  if (item.isDefault) {
    res = store.unequipClothing()
  } else {
    res = store.equipClothing(item.id)
  }
  if (!res.success) {
    showToast(res.msg || '穿戴失败', 'error', 'fa-solid fa-circle-xmark')
    return
  }
  showOutfitPicker.value = false
  showToast(res.msg, 'success', 'fa-solid fa-shirt')
}

const handleUnequipClothing = () => {
  const res = store.unequipClothing()
  showOutfitPicker.value = false
  showToast(res.msg, 'info', 'fa-solid fa-eraser')
}

//进阶任务
const activeCategory = ref('sign')

const displayedTasks = computed(() => tasksStore.tasksByCategory(activeCategory.value))

// 每个任务卡的进度单位（显示在「current / target」右边，让用户一眼看懂是什么）
const TASK_UNIT_MAP = {
  // 签到
  sign_1:   { unit: '次', hint: '' },
  sign_2:   { unit: '件', hint: '装备加成' },
  sign_3:   { unit: '件', hint: '装备加成' },
  sign_4:   { unit: '件', hint: '装备加成' },
  sign_7:   { unit: '天', hint: '累计签到' },
  sign_30:  { unit: '天', hint: '累计签到' },
  sign_100: { unit: '天', hint: '累计签到' },
  // 商店
  shop_1:          { unit: '件', hint: '累计购买' },
  shop_10:         { unit: '件', hint: '累计购买' },
  shop_gold_5000:  { unit: '金币', hint: '累计消费' },
  // 服装/物品
  cloth_1:   { unit: '件', hint: '拥有服装' },
  cloth_5:   { unit: '件', hint: '拥有服装' },
  item_20:   { unit: '件', hint: '拥有物品' },
  // 音乐
  music_1: { unit: '次', hint: '导入音乐' },
  music_2: { unit: '分钟', hint: '累计听歌' },
  music_3: { unit: '分钟', hint: '累计听歌' },
}
const taskUnit = (task) => {
  const meta = TASK_UNIT_MAP[task.id]
  return meta?.unit || ''
}
const taskUnitHint = (task) => {
  const meta = TASK_UNIT_MAP[task.id]
  return meta?.hint || ''
}

const handleClaimTask = (taskId) => {
  const res = tasksStore.claimTask(taskId, store)
  if (!res.success) {
    showToast(res.msg || '领取失败', 'error', 'fa-solid fa-circle-xmark')
    return
  }
  if (res.rewardExp) addExp(res.rewardExp)
  showToast(res.msg, 'success', 'fa-solid fa-gift')
}

const handleClaimAll = () => {
  const res = tasksStore.claimAll(store)
  if (res.totalExp) addExp(res.totalExp)
  showToast(res.msg, res.success ? 'success' : 'info', res.success ? 'fa-solid fa-gift' : 'fa-solid fa-circle-info')
}

// 同步仓库数据到任务统计
const syncInventoryStats = () => {
  //计算服装数量，物品总数量
  let clothCount = 0
  let itemCount = 0
  const inv = store.inventory || {}
  Object.entries(inv).forEach(([id, qty]) => {
    const idNum = Number(id)
    if (idNum >= 100 && idNum < 200) {
      clothCount += qty > 0 ? 1 : 0
    } else if (idNum >= 1 && idNum < 100) {
      itemCount += qty || 0
    }
  })
  tasksStore.setStat('totalClothCount', clothCount)
  tasksStore.setStat('totalItemCount', itemCount)
}

//公告
const announcement = ref({
  title: '系统公告',
  text: '这是更新：1.增加ai记忆功能，商店新增物品和装饰品，新增首页专属背景配置\n2.添加同意条款和多人联机\n3.添加模型，适配鼠标跟随\n4.增加报错弹框功能,ico变换\n5.部分功能正在测试中。。。\n 6.修复部分bug',
})

// Toast
const toast = reactive({
  show: false,
  text: '',
  type: 'info',
  icon: 'fa-solid fa-circle-info',
})

let toastTimer = null
const showToast = (text, type = 'info', icon = 'fa-solid fa-circle-info') => {
  toast.text = text
  toast.type = type
  toast.icon = icon
  toast.show = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.show = false
  }, 2500)
}
</script>

<style scoped src="@/assets/styles/notify.css"></style>
