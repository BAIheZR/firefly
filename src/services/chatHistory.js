// AI 聊天记忆服务层
const CURRENT_KEY = 'ai_chat_current'
const MEMORY_KEY = 'ai_chat_memory'

// 阈值常量（集中管理）
// 每次请求携带的最近原文消息条数（短期滑动窗口）
export const CONTEXT_WINDOW = 20
// 当前会话消息达到该条数时，触发一次记忆整理：窗口外旧消息提取记忆卡
export const SUMMARY_TRIGGER = 24
// 注入上下文的近期事件卡条数；超出后最老的事件压缩进往事纪要
export const EVENT_INJECT_LIMIT = 30
// 记忆卡标签
export const FACT_TAGS = ['profile', 'preference', 'promise', 'event', 'other']
// 注入时全量携带的标签（稳定事实，数量少）
export const ALWAYS_INJECT_TAGS = ['profile', 'preference', 'promise']
// 当前会话：消息原文永久保留不再裁剪，summarizedCount 之前的消息已沉淀为长期记忆卡
export function loadCurrentChat() {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    if (!raw) return { messages: [], summarizedCount: 0 }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return { messages: parsed, summarizedCount: 0 } // 旧版纯数组格式兼容
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      summarizedCount: typeof parsed.summarizedCount === 'number' ? parsed.summarizedCount : 0,
    }
  } catch (e) {
    return { messages: [], summarizedCount: 0 }
  }
}

export function saveCurrentChat(messages, summarizedCount = 0) {
  if (!Array.isArray(messages)) return
  localStorage.setItem(CURRENT_KEY, JSON.stringify({ messages, summarizedCount }))
}

export function clearCurrentChat() {
  localStorage.removeItem(CURRENT_KEY)
}

// 长期记忆：{ summary, chronicle, facts: [{ id, text, tag, at, archived }], milestones: [{ key, title, at }], updatedAt }
// milestones 是好感度跨阶段时记录的「关系历程」，供记事本展示与对话注入
export function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    const facts = Array.isArray(obj.facts)
      ? obj.facts
          .filter((f) => f && typeof f.text === 'string')
          .map((f) => ({
            id: typeof f.id === 'number' ? f.id : Date.now() + Math.floor(Math.random() * 1000),
            text: f.text,
            tag: FACT_TAGS.includes(f.tag) ? f.tag : 'other',
            at: typeof f.at === 'number' ? f.at : Date.now(),
            archived: !!f.archived,
          }))
      : []
    const milestones = Array.isArray(obj.milestones)
      ? obj.milestones
          .filter((m) => m && typeof m.key === 'string' && typeof m.title === 'string')
          .map((m) => ({
            key: m.key,
            title: m.title,
            at: typeof m.at === 'number' ? m.at : Date.now(),
          }))
      : []
    return {
      summary: typeof obj.summary === 'string' ? obj.summary : '',
      chronicle: typeof obj.chronicle === 'string' ? obj.chronicle : '',
      facts,
      milestones,
      updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
    }
  } catch (e) {
    return { summary: '', chronicle: '', facts: [], milestones: [], updatedAt: 0 }
  }
}

export function saveMemory(memory) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify({ ...memory, updatedAt: Date.now() }))
}

// 合并 AI 提取的新记忆卡：作废过时卡（按文本包含匹配）→ 追加新卡
export function mergeFacts(existingFacts, newFacts, obsoleteTexts = []) {
  const obsolete = (obsoleteTexts || []).map((t) => String(t || '').trim()).filter(Boolean)
  let facts = existingFacts.filter((f) => {
    if (f.archived) return true // 已归档卡不参与作废逻辑
    return !obsolete.some((o) => o && (f.text.includes(o) || o.includes(f.text)))
  })
  const now = Date.now()
  const add = (newFacts || [])
    .map((f) => ({ text: String(f?.text || '').trim(), tag: f?.tag }))
    .filter((f) => f.text)
    // 去重：与现有未归档卡文本高度重合则跳过
    .filter((f) => !facts.some((x) => !x.archived && (x.text.includes(f.text) || f.text.includes(x.text))))
    .map((f, i) => ({
      id: now + i + Math.floor(Math.random() * 1000),
      text: f.text,
      tag: FACT_TAGS.includes(f.tag) ? f.tag : 'other',
      at: now,
      archived: false,
    }))
  return [...facts, ...add]
}

// 需要压缩进往事纪要的事件卡：未归档事件卡超过注入上限时，取最老的若干张
export function pickEventsToArchive(facts) {
  const activeEvents = facts
    .filter((f) => f.tag === 'event' && !f.archived)
    .sort((a, b) => a.at - b.at)
  const overflow = activeEvents.length - EVENT_INJECT_LIMIT
  return overflow > 0 ? activeEvents.slice(0, overflow) : []
}

//  记忆卡编辑（供记事本使用；纯函数，入参出参都是 facts 数组，不改原数组） 
// 改写某张卡的文字（空文本视为无效，原样返回）
export function updateFactText(facts, id, text) {
  const t = String(text || '').trim()
  if (!t) return facts
  return facts.map((f) => (f.id === id ? { ...f, text: t } : f))
}

// 删除某张卡
export function removeFact(facts, id) {
  return facts.filter((f) => f.id !== id)
}

// 归档 / 恢复某张卡（归档卡不进注入，但永久保留）
export function toggleFactArchived(facts, id) {
  return facts.map((f) => (f.id === id ? { ...f, archived: !f.archived } : f))
}

//  关系里程碑（好感度跨阶段时写入，形成「关系历程」） 
// stageInfo 取 affectionStages.js 的 key / title；按 key 去重，同一阶段只记一次
export function appendMilestone(memory, stageInfo) {
  if (!memory || !stageInfo) return memory
  const key = stageInfo.key
  const title = stageInfo.title
  if (!key || !title) return memory
  const list = Array.isArray(memory.milestones) ? memory.milestones : []
  if (list.some((m) => m.key === key)) {
    memory.milestones = list
    return memory
  }
  memory.milestones = [...list, { key, title, at: Date.now() }]
  return memory
}

// 组装注入 system prompt 的记忆文本（分层：关系状态 + 档案卡 + 近期事件 + 往事纪要 + 近期摘要）
// relationText：由调用方按实时好感度生成的关系描述（可空）
export function buildMemoryText(memory, relationText = '') {
  const rel = String(relationText || '').trim()
  if (!memory) return rel ? `【与开拓者的关系】\n${rel}` : ''
  const parts = []
  if (rel) {
    parts.push('【与开拓者的关系】')
    parts.push(rel)
  }
  const stable = memory.facts.filter((f) => !f.archived && ALWAYS_INJECT_TAGS.includes(f.tag))
  if (stable.length) {
    const labelMap = { profile: '关于开拓者', preference: '喜好', promise: '约定' }
    for (const tag of ALWAYS_INJECT_TAGS) {
      const items = stable.filter((f) => f.tag === tag)
      if (items.length) {
        parts.push(`【${labelMap[tag]}】`)
        parts.push(...items.map((f) => `- ${f.text}`))
      }
    }
  }
  const recentEvents = memory.facts
    .filter((f) => f.tag === 'event' && !f.archived)
    .sort((a, b) => b.at - a.at)
    .slice(0, EVENT_INJECT_LIMIT)
    .sort((a, b) => a.at - b.at)
  if (recentEvents.length) {
    parts.push('【近期发生的事】')
    parts.push(...recentEvents.map((f) => `- ${f.text}`))
  }
  if (memory.chronicle) {
    parts.push('【往事纪要】')
    parts.push(memory.chronicle)
  }
  if (memory.summary) {
    parts.push('【最近的相处脉络】')
    parts.push(memory.summary)
  }
  return parts.join('\n')
}
