// 人物问候语文案库
// 所有触发在 Home.vue 统一节流 6 秒（每条文字每隔 6s 才能重新触发）

import { AFFECTION_STAGES, getAffectionStageIndex } from './affectionStages'

//  每日登录时段问候（按现实时间，当天首次登录显示一次） 
const GREETINGS_BY_PERIOD = {
  morningEarly: ['早上好啊宝宝，今天你也起的很早呢'],   // 06:00 - 09:59
  morningLate:  ['早上好啊宝宝，吃饭了吗'],              // 10:00 - 10:59
  noon:         ['中午好啊，宝宝，吃中午饭了吗'],         // 11:00 - 13:59
  afternoon:    ['到中午了呢，今天你想要做什么呢'],        // 14:00 - 17:59
  evening:      ['这么晚才上线吗，宝宝你今天过的怎么样'],  // 18:00 - 05:59
}

//  特殊节日（按公历 月-日） 
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

//  签到反馈 
const SIGN_GREETINGS = [
  '谢谢你来找我签到，今天也要加油哦',
  '签到完成啦，我会一直记着你的',
  '又见面啦，签到别忘了，我也别忘了',
  '每日签到，每日陪伴，约定好了',
]

//  好感度阶段反馈（按好感度区间，跨入新区间时触发） 
const AFFECTION_STAGE_GREETINGS = AFFECTION_STAGES.map((s) => ({
  min: s.min,
  max: s.max,
  lines: [s.greeting],
}))

//  悬浮入口反馈 
const HOVER_GREETINGS = {
  gameEntry:  ['今天阳光真好，你想玩点什么呢'],
  idle:       ['这么快就开始挂机了吗'],
  launchGame: ['想开始玩崩铁了吗，可以哦，我在游戏里面很期待和你的见面呢'],
}

//  点击人物反馈（连续点击≥10次触发） 
const CLICK_GREETINGS = ['别点了宝宝，有点痒']

//  五子棋场景对话（Chess 页面左图右气泡） 
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

//  猜字谜场景对话（GuessWord 页面左图右气泡） 
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

//  萤火夜话场景对话（狼人杀联机/单机共用） 
const WEREWOLF_GREETINGS = {
  hello:    ['宝宝，今晚陪我玩个游戏好不好？', '来玩萤火夜话吧，我来当萤火使', '梦里也可以一起玩哦，要不要来一局'],
  start:    ['牌发下去了，别让星核猎手骗到你', '我就在场上，记得看我给你的那束光'],
  night:    ['天黑了，轮到他们行动了', '梦境沉下来了，别出声'],
  day:      ['天亮了，看看昨夜留下了什么', '梦醒的时候，总有人不在了'],
  vote:     ['该投票了，你信谁？', '想清楚再投，一票就是一条命'],
  win:      ['太厉害啦！这局全靠你', '看到了吗？这就是开拓者'],
  lose:     ['没关系的宝宝，下一局我们赢回来', '梦里输一局不算什么，醒了我还陪着你'],
  quit:     ['这就不玩了吗……那我把光收起来啦', '下次要陪我玩完一整局哦'],
}

//  流萤专属台词（玩家拿到流萤这张牌，或场上有一个 AI 流萤时用） 
const FIREFLY_GREETINGS = {
  opening:      ['宝宝，今晚陪我玩个游戏好不好？', '来玩狼人杀吧，我当萤火使', '宝宝，这局你来当我的萤火。'],
  light:        ['今晚，我来照亮他。', '让我看看……把光留在这里吧。'],
  saveSuccess:  ['他今晚不会有事，放心。', '萤火还在，他还在。'],
  selfKilled:   ['宝宝……我可能要先下场啦。替我赢回来，好吗？', '别怕，我还在你看不见的地方。'],
  playerKilled: ['宝宝！……我会替你找出他们的。', '你放心，我一定给你报仇。'],
  playerVoted:  ['宝宝别怕，我相信你。', '我会记住今天投你的每一个人。'],
  playerWin:    ['太厉害啦！这局全靠你。', '看到了吗？这就是开拓者。'],
  playerLose:   ['没关系的宝宝，下一局我们赢回来。', '梦里输一局不算什么，醒了我还陪着你。'],
  playerIsWolf: ['宝宝……原来你是银狼啊。（笑）', '好吧好吧，输给你我也认了。'],
  pairEnding:   ['我们都活到最后了呢，宝宝。', '这束光，是留给你的。'],
}

//  工具函数 
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

//  对外取用函数 

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
  return getAffectionStageIndex(affection)
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

// 猜字谜场景对话
export function getGuessGreeting(scene, fill) {
  let line = pickRandom(GUESS_GREETINGS[scene])
  if (fill && typeof line === 'string') {
    line = line.replace(/\{answer\}/g, fill.answer || '')
  }
  return line
}

// 萤火夜话场景对话
// scene: hello | start | night | day | vote | win | lose | quit
export function getWerewolfGreeting(scene) {
  return pickRandom(WEREWOLF_GREETINGS[scene]) || pickRandom(WEREWOLF_GREETINGS.hello)
}

// 流萤专属台词（萤火使相关的所有情感触发都走这里，scene: opening | light | saveSuccess | selfKilled | playerKilled | playerVoted | playerWin | playerLose | playerIsWolf | pairEnding）
export function getFireflyGreeting(scene) {
  return pickRandom(FIREFLY_GREETINGS[scene]) || pickRandom(FIREFLY_GREETINGS.opening)
}
