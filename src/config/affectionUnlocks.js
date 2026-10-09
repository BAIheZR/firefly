// 好感度阶段解锁表：每个阶段「解锁了什么」。
//
// ★ 原则：只写**真正能拿到手**的东西。
//   需要美术 / 动画才能成立的（专属立绘、互动动作）暂时不写进来 ——
//   玩家在界面上看到却拿不到，比没有更伤。
//   等图/动画到位了，往对应档位的字段里加一项即可，前台会自动显示。
import { AFFECTION_STAGES, getAffectionStageIndex } from './affectionStages'

// key 与 AFFECTION_STAGES 一一对应。字段含义：
//   title    称号（显示在个人页 / 记事本）
//   discount 商店折扣（1 = 不打折，0.9 = 9 折）
//   topics   对话里解锁的话题（喂给 AI 的 system prompt 用，让她能聊到这些）
//  折扣的分档逻辑（按好感度上限 2000 这把尺子配）
//   好感度 0→2000 走过来大约 2~3 周，所以：
//   ① 折扣**从「熟悉」档就开始**（200 好感，大约第 4-8 天）——
//      前两档全价的话，玩家前一周看不到任何好处，容易以为"涨好感没用"。
//   ② 每档**递减 0.5 折、且不重复**，四档拉开 0.95 → 0.8，梯度明显。
//   ③ 挚爱档给到 **8 折**（原来 8.5）—— 上限只有 2000，到顶本来就比"数值无上限"的
//      设定更难，折扣给猛一点才对得起这条路。
export const AFFECTION_UNLOCKS = {
  distant: {
    title: '冷眼旁观',
    discount: 1,
    topics: [],
  },
  stranger: {
    title: '初来乍到',
    discount: 1,
    topics: [],
  },
  familiar: {
    title: '并肩同行',
    discount: 0.95, // 9.5 折 —— 第一次拿到折扣，给个明确的"开始有回报"信号
    topics: ['匹诺康尼的见闻', '列车上的日常'],
  },
  close: {
    title: '可以依靠',
    discount: 0.9, // 9 折
    topics: ['匹诺康尼的见闻', '列车上的日常', '她的过去'],
  },
  intimate: {
    title: '心之所向',
    discount: 0.85, // 8.5 折
    topics: ['匹诺康尼的见闻', '列车上的日常', '她的过去', '关于以后'],
  },
  beloved: {
    title: '唯一归处',
    discount: 0.8, // 8 折 —— 满好感的天花板待遇
    topics: ['匹诺康尼的见闻', '列车上的日常', '她的过去', '关于以后', '只对你说的话'],
  },
}

// 按好感度取解锁信息：当前档 + 下一档（用来显示「再涨 N 就解锁 X」）
export function getAffectionUnlocks(affection) {
  const idx = getAffectionStageIndex(affection)
  const stage = AFFECTION_STAGES[idx]
  const unlock = AFFECTION_UNLOCKS[stage.key] || AFFECTION_UNLOCKS.stranger
  const nextStage = AFFECTION_STAGES[idx + 1] || null
  return {
    stage,
    unlock,
    nextStage,
    nextUnlock: nextStage ? AFFECTION_UNLOCKS[nextStage.key] || null : null,
  }
}

// 商店折扣系数（1 = 原价）
export function getShopDiscount(affection) {
  return getAffectionUnlocks(affection).unlock.discount
}

// 把折扣折算成实际价格（向上取整，避免出现 0 元）
export function applyShopDiscount(price, affection) {
  const p = Math.max(0, Number(price) || 0)
  return Math.max(1, Math.ceil(p * getShopDiscount(affection)))
}
