// 人物问候语文案库（融合 text.md 规范）
// 场景：每日登录时段 / 特殊节日 / 签到反馈 / 好感度阶段 / 悬浮入口 / 点击人物
// 所有触发在 Home.vue 统一节流 6 秒（每条文字每隔 6s 才能重新触发）

// ===== 每日登录时段问候（按现实时间，当天首次登录显示一次） =====
const GREETINGS_BY_PERIOD = {
  morningEarly: ['早上好啊宝宝，今天你也起的很早呢'],   // 06:00 - 09:59
  morningLate:  ['早上好啊宝宝，吃饭了吗'],              // 10:00 - 10:59
  noon:         ['中午好啊，宝宝，吃中午饭了吗'],         // 11:00 - 13:59
  afternoon:    ['到中午了呢，今天你想要做什么呢'],        // 14:00 - 17:59
  evening:      ['这么晚才上线吗，宝宝你今天过的怎么样'],  // 18:00 - 05:59
}

// ===== 特殊节日（按公历 月-日） =====
const FESTIVAL_GREETINGS = {
  '01-01': ['新年快乐！新的一年也要一起度过哦'],
  '02-14': ['情人节快乐，今天可以只陪着我吗？'],
  '03-14': ['白色情人节快乐～今天我准备了回礼'],
  '05-20': ['520快乐，有些话想对你说很久了…'],
  '10-24': ['今天是程序员节，辛苦写代码的你啦'],
  '12-24': ['平安夜快乐，给你准备了苹果'],
  '12-25': ['圣诞快乐！今晚一起过吗？'],
  '12-31': ['跨年啦，今年最后一天也要在一起'],
}

// ===== 签到反馈 =====
const SIGN_GREETINGS = [
  '谢谢你来找我签到，今天也要加油哦',
  '签到完成啦，我会一直记着你的',
  '又见面啦，签到别忘了，我也别忘了',
  '每日签到，每日陪伴，约定好了',
]

// ===== 好感度阶段反馈（按好感度区间，跨入新区间时触发） =====
const AFFECTION_STAGE_GREETINGS = [
  { min: 0,    max: 199,  lines: ['我们…才刚认识吧，请多关照'] },
  { min: 200,  max: 499,  lines: ['好像越来越了解你了呢'] },
  { min: 500,  max: 999,  lines: ['和你在一起的时间总是过得很快'] },
  { min: 1000, max: 1999, lines: ['已经离不开你了，你知道吗？'] },
  { min: 2000, max: Infinity, lines: ['无论何时何地，我都在你身边'] },
]

// ===== 悬浮入口反馈 =====
const HOVER_GREETINGS = {
  gameEntry:  ['今天阳光真好，你想玩点什么呢'],
  idle:       ['这么快就开始挂机了吗'],
  launchGame: ['想开始玩崩铁了吗，可以哦，我在游戏里面很期待和你的见面呢'],
}

// ===== 点击人物反馈（连续点击≥10次触发） =====
const CLICK_GREETINGS = ['别点了宝宝，有点痒']

// ===== 五子棋场景对话（Chess 页面左图右气泡） =====
// scene: hello=进入页面 / good=AI回合开始（轮到萤宝）/ you_votor=玩家赢 / votor=萤宝赢
//        draw=和棋 / think=AI思考中 / place_after=玩家落子后萤宝小鼓励
const CHESS_GREETINGS = {
  hello:      ['宝宝，想要和我下五子棋吗', '准备好了吗宝宝，我要开始啦', '陪你下棋真好，我们开始吧'],
  good:       ['宝宝到我咯', '嗯，让我看看该下哪呢', '该我啦，我要认真咯'],
  you_votor:  ['宝宝你很棒哦，你赢了呢', '哇好厉害！宝宝赢了我~', '居然输给宝宝啦，下次我不会输的'],
  votor:      ['怎么样，宝宝，我下五子棋厉害吧', '嘿嘿，侥幸赢了宝宝', '承让啦宝宝，要不我们再来一把？'],
  draw:       ['和棋呢，宝宝，平局也不错嘛', '不分伯仲，这局真有意思'],
  think:      ['唔，让我想想…', '这一步该下哪里好呢', '思考中，宝宝别催我哦~'],
  place_after:['不错的一步呢，宝宝', '嗯，这步有点意思，我要跟上了'],
  wait:       ['宝宝快点吧，我等的花都没了', '宝宝你在想什么呀，要抓紧哦~', '再不下棋，我就先去喝口水啦'],
}

// ===== 猜字游戏场景对话（GuessWord 页面左图右气泡） =====
// scene: hello=进入页面 / start=开始一局 / hint=揭示新提示 / wrong=猜错 / correct=猜对（早）/ win_late=猜对（晚）
//        lose=提示用完没猜中 / giveup=玩家放弃
const GUESS_GREETINGS = {
  hello:     ['宝宝，来玩猜字吗？我给你提示词，你猜答案', '我当提示官，你来猜，准备好啦吗'],
  start:     ['好的宝宝，开始啦，第一提示给你', '认真听哦宝宝，提示来咯'],
  hint:      ['再给你一条提示，好好想想', '嗯，再想想，宝宝加油', '来啦，新提示：', '别急，再看看这条'],
  wrong:     ['不对哦宝宝，再试试', '不是这个，再想想看？', '差一点啦，宝宝继续'],
  correct:   ['宝宝你太厉害了！这么早猜出来啦', '答对啦宝宝！我都被你猜穿了', '好聪明！宝宝真棒'],
  win_late:  ['宝宝终于猜到啦，奖励有点少哦', '终于猜中啦，下次要更快哦'],
  lose:      ['这次没猜对呢，正确答案是「{answer}」', '可惜啦，正确答案是「{answer}」，下次加油'],
  giveup:    ['宝宝这就放弃了吗？正确答案是「{answer}」', '没关系，答案是「{answer}」，下次再来'],
}

// ===== 工具函数 =====
function pickRandom(arr) {
  if (!arr || arr.length === 0) return ''
  return arr[Math.floor(Math.random() * arr.length)]
}

// 根据 hour 返回时段 key
function getTimePeriod(hour) {
  if (hour >= 6 && hour < 10) return 'morningEarly'
  if (hour >= 10 && hour < 11) return 'morningLate'
  if (hour >= 11 && hour < 14) return 'noon'
  if (hour >= 14 && hour < 18) return 'afternoon'
  return 'evening' // 18:00 - 05:59
}

function getMonthDay() {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${m}-${d}`
}

// ===== 对外取用函数 =====

// 每日登录问候：节日优先，否则按时段
export function getLoginGreeting() {
  const md = getMonthDay()
  if (FESTIVAL_GREETINGS[md]) return pickRandom(FESTIVAL_GREETINGS[md])
  const period = getTimePeriod(new Date().getHours())
  return pickRandom(GREETINGS_BY_PERIOD[period])
}

// 签到反馈
export function getSignGreeting() {
  return pickRandom(SIGN_GREETINGS)
}

// 好感度阶段反馈
export function getAffectionGreeting(affection) {
  const stage = AFFECTION_STAGE_GREETINGS.find(s => affection >= s.min && affection <= s.max)
  return stage ? pickRandom(stage.lines) : null
}

// 好感度阶段索引（跨阈值检测）
export function getAffectionStage(affection) {
  const idx = AFFECTION_STAGE_GREETINGS.findIndex(s => affection >= s.min && affection <= s.max)
  return idx < 0 ? 0 : idx
}

// 悬浮入口反馈：type = 'gameEntry' | 'idle' | 'launchGame'
export function getHoverGreeting(type) {
  return pickRandom(HOVER_GREETINGS[type])
}

// 点击人物反馈
export function getClickGreeting() {
  return pickRandom(CLICK_GREETINGS)
}

// 五子棋场景对话
// scene: hello | good | you_votor | votor | draw | think | place_after
export function getChessGreeting(scene) {
  return pickRandom(CHESS_GREETINGS[scene])
}

// 猜字游戏场景对话
// scene: hello | start | hint | wrong | correct | win_late | lose | giveup
// 可选 fill: { answer: '正确答案' } 用于 lose/giveup 场景的占位符替换
export function getGuessGreeting(scene, fill) {
  let line = pickRandom(GUESS_GREETINGS[scene])
  if (fill && typeof line === 'string') {
    line = line.replace(/\{answer\}/g, fill.answer || '')
  }
  return line
}
