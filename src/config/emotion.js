// 情绪 → 表情（morph）映射表 —— 单一数据源。
// 猫耳流萤.pmx 共 66 个 morph（索引 0~65），表情语义见各条目注释。
// 用途：
//   1. AI 对话：system prompt 要求 AI 在回复【句首】输出 [emotion:情绪词]，
//      ChatDialog 用 EMOTION_WORDS 反查词→key，再经 window 事件广播给 Home → PMXCharacter.setEmotion(key)。
//   2. 每个 key 对应一组 morph 索引池，播放时「清空全部 → 池内随机取 1 → 置 1」。
//   3. 好感度 > 200 时，所有情绪叠加「脸红」（BLUSH_MORPH_INDEX = 65 照れ）。

// 情绪 key（稳定标识，勿改）→ 中文情绪词（AI 在句首标签里输出这个词）
export const EMOTION_WORDS = {
  happy: '开心',
  shy: '害羞',
  angry: '生气',
  sad: '伤心',
  troubled: '困扰',
  proud: '得意',
  surprised: '惊讶',
  serious: '认真',
  thinking: '思考',
}

// 情绪 key → morph 索引池（播放时随机取一个）
// 索引来自 PMX morphTargetDictionary（0-based），与 EmotionTest 页编号一致。
export const EMOTION_MORPHS = {
  happy: [2, 7, 8, 9, 10, 16],     // 微笑/眯眼笑/笑变体/抛媚眼左右/治愈眼
  shy: [65],                        // 照れ（害羞/脸红）
  angry: [3, 5, 23],                // 怒り/眉下压/死鱼眼
  sad: [1, 37, 55],                 // 困る/倒ω/口角下げ
  troubled: [1, 17, 23],            // 困る/はちゅ目/死鱼眼
  proud: [4, 5, 9, 19, 22],         // 眉上挑/眉下压/抛媚眼/ｷﾘｯ/ｷﾘｯ3
  surprised: [27],                  // びっくり2（惊讶）
  serious: [0],                     // 真面目（认真）
  thinking: [0, 1, 17],             // 真面目/困る/はちゅ目
}

// 脸红 morph 索引（照れ）。好感度 > 200 时叠加到任意情绪上。
export const BLUSH_MORPH_INDEX = 65

// 好感度超过多少时强制脸红
export const BLUSH_AFFECTION_THRESHOLD = 200

// 默认情绪（新会话 / AI 对玩家初始情绪）
export const DEFAULT_EMOTION = 'happy'

// 从 AI 回复里提取句首 [emotion:xxx] 标签，返回情绪 key；无则返回 null
// 形如「[emotion:开心] 正文…」（句首）或兼容旧的句尾形式。
export function extractEmotionKey(raw) {
  if (!raw) return null
  const head = raw.match(/^\s*\[emotion:\s*([^\]\s]+)\s*\]/)
  const word = head ? head[1] : null
  if (word) {
    const hit = Object.entries(EMOTION_WORDS).find(([, w]) => w === word)
    if (hit) return hit[0]
  }
  // 兼容旧句尾标签
  const tail = raw.match(/\[emotion:\s*([^\]\s]+)\s*\]\s*$/)
  if (tail) {
    const hit = Object.entries(EMOTION_WORDS).find(([, w]) => w === tail[1])
    if (hit) return hit[0]
  }
  return null
}

// 从 AI 回复里剥离句首/句尾的 [emotion:xxx] 标签，只留正文
export function stripEmotionTag(raw) {
  if (!raw) return ''
  return raw
    .replace(/^\s*\[emotion:[^\]]*\]\s*/, '') // 句首
    .replace(/\[emotion:[^\]]*\]\s*$/, '')     // 句尾
    .trim()
}
