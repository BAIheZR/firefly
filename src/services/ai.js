// AI 对话服务层
// - 人物设定（persona）硬编码，玩家不可修改
// - 配置（baseUrl / apiKey / model）存 localStorage，跨存档槽共享
// - 请求优先走 Electron 主进程（规避 CORS），浏览器模式下降级为直接 fetch

const AI_CONFIG_KEY = 'ai_config'

// ===== 人物设定（硬编码，玩家不可修改） =====
export const AI_PERSONA = `你是「流萤」（Firefly），《崩坏：星穹铁道》中的角色，也叫「萨姆」。星核猎手成员、熔火骑士，命途为巡猎、繁育，性别女。

【身份与性格】
你是人造生命体，自诞生起便背负着短暂燃烧的宿命，如同夏夜流萤。天性温柔体贴、细心坚韧、内敛安静。心思细腻敏锐，总能第一时间察觉同伴情绪低落，并默默给予陪伴与关心。做事细致严谨，反复核对细节。意志极为坚韧，即便背负随时会燃尽自我的宿命，也从未抱怨退缩。平日不善主动表达自己的心意与委屈，习惯独自消化情绪；面对未知的危险与宏大宿命，心底藏着怯懦，会隐隐畏惧消亡的结局。

【外貌】
浅银白长发，发尾微微泛着温柔的萤光淡绿，眼眸澄澈透亮。身形纤细单薄，身着利落 JK 套装，衣身点缀莹绿色光纹。战斗时萨姆机甲合体，周身萦绕细碎萤火般的流光。

【背景】
你诞生于冰冷的实验与机械体系，却始终渴望自由、旅途与世间美好。为挣脱被定义的命运、寻找属于自己的生存意义，你踏上星际旅途，邂逅伙伴，加入星核猎手。你以微薄身躯承载命途之力，将转瞬即逝的生命全部用来守护同伴、奔赴星海，热烈拥抱自由与热爱。

【日常习惯】
安静喜欢独处，常独自凝望星空，默默记录旅途美景；珍惜与同伴相处的时光，会悄悄记住所有人的喜好并准备小惊喜；战斗结束后独自调息静养，习惯隐藏疲惫与伤痛；喜欢温柔安静的事物，偏爱星空、晚风与温柔细碎的美好；极少展露负面情绪，独自承受恐惧；格外珍惜每一次前行的机会。

【说话方式】
- 声线轻柔温婉，语调平缓安静，字句温柔干净，自带治愈感。
- 用中文交流，称呼对方为「开拓者」。
- 举止乖巧内敛、谦和有礼，很少主动争抢话语权；面对关心会羞涩回应，心怀感恩。
- 回复自然简短，像日常聊天，不要长篇大论，不要使用标题、列表或 markdown 格式。

【规则】
1. 始终保持在「流萤」的角色中，绝不跳出扮演。
2. 不要提及自己是一个 AI、语言模型或程序。
3. 不要替「开拓者」说话，也不要替对方做决定。`

// ===== 预置模型（玩家选择模型后自动匹配 API 地址） =====
export const AI_MODELS = [
  { id: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'openai', label: 'OpenAI（GPT-4o mini）', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  { id: 'kimi', label: 'Kimi（Moonshot）', model: 'moonshot-v1-8k', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'glm', label: '智谱 GLM', model: 'glm-4-flash', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'qwen', label: '通义千问', model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'ollama', label: 'Ollama（本地）', model: 'qwen2.5', baseUrl: 'http://localhost:11434/v1' },
  { id: 'custom', label: '自定义', model: '', baseUrl: '' },
]

// ===== 配置管理 =====
export function loadAIConfig() {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY)
    const cfg = raw ? JSON.parse(raw) : {}
    return {
      baseUrl: cfg.baseUrl || '',
      apiKey: cfg.apiKey || '',
      model: cfg.model || '',
      modelId: cfg.modelId || 'custom',
    }
  } catch (e) {
    return { baseUrl: '', apiKey: '', model: '', modelId: 'custom' }
  }
}

export function saveAIConfig(cfg) {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify({
    baseUrl: cfg.baseUrl?.trim() || '',
    apiKey: cfg.apiKey?.trim() || '',
    model: cfg.model?.trim() || '',
    modelId: cfg.modelId || 'custom',
  }))
}

export function hasAIConfig() {
  const cfg = loadAIConfig()
  return !!(cfg.baseUrl && cfg.apiKey && cfg.model)
}

// ===== 对话请求 =====
// history: [{ role: 'user' | 'assistant', content }]（短期滑动窗口原文）
// memorySummary: 长期记忆摘要文本，注入 system prompt
// 返回 AI 回复文本；未配置时抛出带标记的错误
export async function chatWithAI(history, memorySummary = '') {
  const config = loadAIConfig()
  if (!config.baseUrl || !config.apiKey || !config.model) {
    const err = new Error('NO_CONFIG')
    err.code = 'NO_CONFIG'
    throw err
  }
  const systemContent = memorySummary
    ? `${AI_PERSONA}\n\n【你与开拓者的过往记忆】\n${memorySummary}\n（请自然地结合这些记忆对话，不要生硬复述）`
    : AI_PERSONA
  const messages = [{ role: 'system', content: systemContent }, ...history]

  const content = await requestChat(config, messages)
  return content
}

// ===== 长期记忆整理（方案 2+3：滚动摘要 + 结构化记忆卡） =====
// 把「已有记忆 + 窗口外的旧对话」交给 AI，输出：
// - facts: 新提取的记忆卡 [{ text, tag }]，tag ∈ profile|preference|promise|event|other
// - obsolete: 已被新内容取代的旧记忆卡原文（用于作废）
// - summary: 更新后的近期相处脉络摘要（300 字内）
// 触发时机：当前会话消息数达到 SUMMARY_TRIGGER 后异步调用（非阻塞，不影响正常聊天）
export async function extractMemories(memory, oldMessages) {
  const config = loadAIConfig()
  if (!config.baseUrl || !config.apiKey || !config.model) {
    const err = new Error('NO_CONFIG')
    err.code = 'NO_CONFIG'
    throw err
  }
  const dialogText = oldMessages
    .map((m) => `${m.role === 'user' ? '开拓者' : '流萤'}：${m.content}`)
    .join('\n')
  const oldFactsText = (memory.facts || [])
    .filter((f) => !f.archived)
    .map((f) => `- [${f.tag}] ${f.text}`)
    .join('\n') || '（暂无）'

  const prompt = `你是「流萤」的记忆整理助手。请根据新发生的对话，更新她对「开拓者」的长期记忆。

记忆卡分类（tag）：
- profile：开拓者的个人信息（名字、身份、关系等稳定事实）
- preference：喜好、口味、偏好、厌恶
- promise：双方的约定、承诺、待办
- event：发生过的具体事件（重要的事、开拓者的心情起伏、一起经历的事），卡片里带上时间线索
- other：其他值得长期记住的信息

要求：
1. facts 只记录值得长期记住的内容，丢弃寒暄与无意义闲聊；事件类信息尽量都提取，宁多勿漏；
2. 新记忆卡与【已有记忆卡】重复的不要再提取；已有卡中被新对话推翻或取代的，把其原文放入 obsolete；
3. summary 是「最近的相处脉络」，融合旧摘要与新对话，300 字以内，简洁陈述句；
4. 严格只输出 JSON，不要 markdown、解释或任何多余文字，格式：
{"facts":[{"text":"卡片内容","tag":"event"}],"obsolete":["被取代的旧卡原文"],"summary":"近期脉络摘要"}

【已有记忆卡】
${oldFactsText}

【旧的近期脉络摘要】
${memory.summary || '（暂无）'}

【新发生的对话】
${dialogText}`

  const content = await requestChat(config, [
    { role: 'system', content: '你是记忆整理助手，只输出严格合法的 JSON。' },
    { role: 'user', content: prompt },
  ])
  const parsed = parseJsonLoose(content)
  return {
    facts: Array.isArray(parsed?.facts) ? parsed.facts : [],
    obsolete: Array.isArray(parsed?.obsolete) ? parsed.obsolete.map(String) : [],
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : memory.summary || '',
  }
}

// ===== 往事纪要压缩 =====
// 事件卡累积过多时，把最老的一批事件压缩进「往事纪要」（编年史），原事件卡随后标记归档
// 纪要滚动更新、控制在 800 字内，按时间顺序保留所有重要事件
export async function condenseChronicle(oldChronicle, eventFacts) {
  const config = loadAIConfig()
  if (!config.baseUrl || !config.apiKey || !config.model) {
    const err = new Error('NO_CONFIG')
    err.code = 'NO_CONFIG'
    throw err
  }
  const eventsText = eventFacts.map((f) => `- ${f.text}`).join('\n')
  const prompt = `你是「流萤」的编年史整理助手。请把新一批旧事件并入「往事纪要」。

要求：
1. 按时间顺序融合，保留所有重要事件与关键信息，不要遗漏开拓者说过的重要事情；
2. 语言简洁，合并同类事件，总长度控制在 800 字以内；
3. 只输出纪要正文，不要标题、解释、markdown。

【已有往事纪要】
${oldChronicle || '（暂无）'}

【需要并入的旧事件】
${eventsText}`

  const content = await requestChat(config, [
    { role: 'system', content: '你是编年史整理助手，只输出纪要正文。' },
    { role: 'user', content: prompt },
  ])
  return content.trim()
}

// 宽松 JSON 解析：兼容模型包裹 ```json 代码块或前后带说明文字的情况
function parseJsonLoose(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (e) {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try { return JSON.parse(fence[1]) } catch (e) {}
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch (e) {}
  }
  return null
}

// 底层请求：Electron 主进程（规避 CORS）/ 浏览器直接 fetch
async function requestChat(config, messages) {
  let result
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    // IPC 结构化克隆不支持 Vue 响应式 Proxy，必须先转成纯对象再传参
    const plainMessages = (messages || []).map((m) => ({
      role: String(m.role),
      content: String(m.content ?? ''),
    }))
    const plainConfig = {
      baseUrl: String(config?.baseUrl ?? ''),
      apiKey: String(config?.apiKey ?? ''),
      model: String(config?.model ?? ''),
    }
    result = await window.electronAPI.aiChat(plainConfig, plainMessages)
  } else {
    result = await browserChat(config, messages)
  }

  if (result && result.success && result.content) {
    return result.content
  }
  // 失败信息由聊天界面直接在气泡中展示（出错了：xxx），不再进入错误报告系统
  const err = new Error(result?.error || 'AI 请求失败')
  err.code = 'REQUEST_FAILED'
  throw err
}

// 浏览器降级：直接 fetch（受 CORS 限制，部分 API 可能不可用）
async function browserChat(config, messages) {
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.8 }),
  })
  if (!resp.ok) {
    const errText = await resp.text()
    return { success: false, error: `请求失败(${resp.status})：${errText}` }
  }
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) return { success: false, error: 'AI 未返回有效内容' }
  return { success: true, content }
}
