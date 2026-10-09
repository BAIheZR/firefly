// 好感度的「每日获取上限」：按来源分桶累计，跨日自动清零。
//
// 为什么要它：聊天 / 玩游戏 / 猜字谜这些可以无限刷的动作，如果不限每日上限，
// 玩家一晚就能把好感刷到顶，长线养成直接失效。所以每个来源给一个「每天最多给多少」。
//
// 存储：localStorage['affection_daily'] = { date: '2026-10-08', gained: { chat: 12, game: 8 } }
// 只记「日期 + 每个来源已发多少」，跨日整个丢弃重来 —— 不需要定时器。
import { changeAffection } from '@/config/inventory'

const KEY = 'affection_daily'

//  每日任务（方案 A：引导性小额额外奖励） 
// 不做「任务进度 + 手动领奖」那一套 —— 那要改造 tasks store 的成就逻辑。
// 改成挂在每日额度上：**某个来源当天累计刚好跨过阈值**时，额外补一份好感。
// 好处：零新增存储、天然和已有来源联动、玩家不用去点"领奖"。
//
// 配平：这三项合计 +18/天。加上按次额度 70 + 签到 15~45 + 挂机约 10
// → 日均约 113~143 → 约 14~18 天到 2000，落在「2-3 周」目标内。
export const DAILY_TASKS = [
  { cap: 'chat',  threshold: 10, affection: 7, name: '和流萤聊聊' },  // 聊到 10 点额度
  { cap: 'game',  threshold: 8,  affection: 7, name: '陪她玩一局' },  // 玩到 8 点额度
  { cap: 'guess', threshold: 5,  affection: 4, name: '一起猜字谜' },  // 猜对第一题
]

// 本来源当天累计从 before 涨到 after，刚好跨过某个任务的阈值 → 补发那份好感
function grantDailyTaskBonus(key, before, after) {
  DAILY_TASKS.forEach((t) => {
    if (t.cap !== key) return
    if (before < t.threshold && after >= t.threshold) {
      try {
        changeAffection(t.affection)
      } catch (e) {
        /* 环境不支持（测试 / 未初始化 pinia）就跳过，别影响主流程 */
      }
    }
  })
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (raw && raw.date === today() && raw.gained && typeof raw.gained === 'object') return raw
  } catch (e) {
    /* 数据损坏就当成新的一天 */
  }
  return { date: today(), gained: {} }
}

// 某来源今天还剩多少额度
export function dailyQuota(key, cap) {
  const all = readAll()
  const used = Number(all.gained[key]) || 0
  return Math.max(0, cap - used)
}

// 申请发放 want 点：返回「实际能发多少」（自动截断到剩余额度），并把这一笔记上。
// 调用方拿到返回值后再去 changeAffection(grant) —— 返回 0 就说明今天这个来源已满，什么都别发。
export function takeDailyQuota(key, cap, want) {
  const grant = Math.min(Math.max(0, Number(want) || 0), dailyQuota(key, cap))
  if (grant <= 0) return 0
  const all = readAll()
  const before = Number(all.gained[key]) || 0
  all.gained[key] = before + grant
  all.date = today()
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch (e) {
    /* 隐私模式 / 配额满：忽略，本次照常发放 */
  }
  // 本次刚好跨过「每日任务」的阈值 → 额外补一份好感（方案 A 的小额引导奖励）
  grantDailyTaskBonus(key, before, all.gained[key])
  return grant
}

// 每个来源的每日上限（集中在这里，方便调平衡）
export const DAILY_CAPS = {
  chat: 20,   // 和流萤聊天
  guess: 20,  // 猜字谜答对
  game: 30,   // 玩小游戏（胜/负不同值，共用这个桶）
}
