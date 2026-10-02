// 好感度阶段定义（单一数据源）：key 稳定标识（勿改）、min/max 好感度闭区间、title 阶段名、
// call 流萤对开拓者的称呼、tone 语气倾向（注入对话用）、greeting 跨档台词、color 主题色
export const AFFECTION_STAGES = [
  { key: 'stranger', min: 0,    max: 199,      title: '初识', call: '开拓者', tone: '礼貌而略微疏离，仍在小心翼翼地靠近',       greeting: '我们…才刚认识吧，请多关照',     color: '#8aa0b4' },
  { key: 'familiar', min: 200,  max: 499,      title: '熟悉', call: '开拓者', tone: '温和自然，会主动关心你的近况',             greeting: '好像越来越了解你了呢',         color: '#5aa9c9' },
  { key: 'close',    min: 500,  max: 999,      title: '亲近', call: '开拓者', tone: '亲昵放松，偶尔会撒娇、开点小玩笑',         greeting: '和你在一起的时间总是过得很快', color: '#3FA98A' },
  { key: 'intimate', min: 1000, max: 1999,     title: '心动', call: '宝宝',   tone: '依恋而羞于直白，会格外在意你的情绪',       greeting: '已经离不开你了，你知道吗？',   color: '#e08fb0' },
  { key: 'beloved',  min: 2000, max: Infinity, title: '挚爱', call: '宝宝',   tone: '毫无保留的温柔，把你当作唯一的归处',       greeting: '无论何时何地，我都在你身边',   color: '#d1668c' },
]

// 好感度 → 阶段索引（0 起）；非数字或越界时按最低档兜底
export function getAffectionStageIndex(affection) {
  const a = Number(affection)
  const v = Number.isFinite(a) ? a : 0
  const idx = AFFECTION_STAGES.findIndex((s) => v >= s.min && v <= s.max)
  return idx < 0 ? 0 : idx
}

// 好感度 → 阶段信息对象
export function getAffectionStageInfo(affection) {
  return AFFECTION_STAGES[getAffectionStageIndex(affection)]
}

// 好感度 → 到下一阶段的进度（记事本进度条用）
// 返回 { stage, next, ratio(0~1), remain(距下一档还差多少数值) }
export function getAffectionProgress(affection) {
  const a = Number(affection)
  const v = Number.isFinite(a) ? a : 0
  const idx = getAffectionStageIndex(v)
  const stage = AFFECTION_STAGES[idx]
  const next = AFFECTION_STAGES[idx + 1] || null
  if (!next) return { stage, next: null, ratio: 1, remain: 0 }
  const span = next.min - stage.min
  const ratio = span > 0 ? Math.min(1, Math.max(0, (v - stage.min) / span)) : 0
  return { stage, next, ratio, remain: Math.max(0, next.min - v) }
}
