// 开箱（抽卡箱子）引擎
//  基础概率 
export const BASE_RATES = {
  clothing: 3,   // 服装
  decoration: 7, // 装饰品
  item: 40,      // 一般物品
  gold: 50,      // 金币
}

// 额外开箱概率（每次结算后判定，可连爆）
export const EXTRA_CHEST_RATE = 5

//  金币分段 
export const GOLD_TIERS = [
  { min: 100,   max: 1000,  rate: 50 },
  { min: 1000,  max: 2000,  rate: 15 },
  { min: 2000,  max: 5000,  rate: 10 },
  { min: 5000,  max: 7000,  rate: 9 },
  { min: 7000,  max: 9000,  rate: 7 },
  { min: 9000,  max: 12000, rate: 5 },
  { min: 12000, max: 16000, rate: 3 },
  { min: 16000, max: 20000, rate: 1 },
]

// 金币上下限（由分段表推导，避免两处维护）
export const GOLD_MIN = GOLD_TIERS[0].min
export const GOLD_MAX = GOLD_TIERS[GOLD_TIERS.length - 1].max

// 分段概率合计（应恒为 100，供自测断言）
export const GOLD_TIER_RATE_TOTAL = GOLD_TIERS.reduce((s, t) => s + t.rate, 0)

// 按分段表抽一次金币金额
export function rollGold() {
  let r = Math.random() * GOLD_TIER_RATE_TOTAL
  for (const t of GOLD_TIERS) {
    if ((r -= t.rate) < 0) return randInt(t.min, t.max)
  }
  // 浮点兜底：落到最后一档
  const last = GOLD_TIERS[GOLD_TIERS.length - 1]
  return randInt(last.min, last.max)
}

// 运气值对稀有档的最大加成（100% 运气 → 稀有档概率翻倍上限）
export const LUCK_MAX_BONUS = 1

//  箱子定义 
// price：单价；name/icon：展示用
const CHESTS = [
  {
    id: 'wood',
    name: '神秘宝箱',
    icon: 'fa-solid fa-box-open',
    price: 3000,
  },
]

export function getChestById(id) {
  return CHESTS.find((c) => c.id === id) || null
}

export function getAllChests() {
  return CHESTS.slice()
}

//  概率计算 
// 读取运气值（0 起，无上限；这里按百分比口径，100 = +100%）
// 返回非负数字
export function normalizeLuck(luck) {
  const v = Number(luck)
  if (!Number.isFinite(v) || v <= 0) return 0
  return v
}

// 从永久加成里读取「运气值增加」的总百分比

export function getLuckPercent() {
  if (typeof window === 'undefined' || !window.localStorage) return 0
  const raw = localStorage.getItem('player_selected_buffs')
  if (!raw) return 0
  let list = []
  try { list = JSON.parse(raw) || [] } catch (e) { return 0 }
  let sum = 0
  for (const sb of list) {
    if (sb && sb.typeKey === 'luck' && typeof sb.value === 'number') sum += sb.value
  }
  return sum > 0 ? sum : 0
}

// 按运气值计算最终概率表（返回各项百分比，合计 100）
export function computeRates(luck = 0) {
  const base = { ...BASE_RATES }
  const rareBase = base.clothing + base.decoration
  const bonusRatio = normalizeLuck(luck) / 100 * LUCK_MAX_BONUS
  const rareTarget = Math.min(100, rareBase * (1 + bonusRatio))
  const extra = rareTarget - rareBase // 需要从其他档借来的概率

  // 服装 : 装饰品按基础比例放大
  const scale = rareTarget / rareBase
  const clothing = base.clothing * scale
  const decoration = base.decoration * scale

  // 从金币档扣，不够再扣物品档
  let remain = extra
  let gold = base.gold
  let item = base.item
  const takeGold = Math.min(gold, remain)
  gold -= takeGold
  remain -= takeGold
  if (remain > 0) {
    const takeItem = Math.min(item, remain)
    item -= takeItem
    remain -= takeItem
  }

  return { clothing, decoration, item, gold }
}

//  箱子库存（玩家拥有的箱子数量） 
const CHEST_INV_KEY = 'player_chest_inventory'

export function loadChestInventory() {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = localStorage.getItem(CHEST_INV_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj
    return {}
  } catch (e) {
    return {}
  }
}

export function saveChestInventory(inv) {
  if (typeof window === 'undefined' || !window.localStorage) return
  localStorage.setItem(CHEST_INV_KEY, JSON.stringify(inv || {}))
}

// 增加箱子（购买 / 活动赠送）
export function addChest(chestId, quantity = 1) {
  const inv = loadChestInventory()
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty <= 0) return inv
  inv[chestId] = (inv[chestId] || 0) + qty
  saveChestInventory(inv)
  return inv
}

// 消耗箱子（开箱）
export function consumeChest(chestId, quantity = 1) {
  const inv = loadChestInventory()
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  const have = inv[chestId] || 0
  if (qty <= 0 || have < qty) return { ok: false, inv }
  const left = have - qty
  if (left > 0) inv[chestId] = left
  else delete inv[chestId]
  saveChestInventory(inv)
  return { ok: true, inv }
}

//  抽取 
function randInt(min, max) {
  const lo = Math.ceil(min)
  const hi = Math.floor(max)
  return Math.floor(Math.random() * (hi - lo + 1)) + lo
}

// 从数组随机取一个
function pick(arr) {
  if (!arr || !arr.length) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

// 抽一次结果（不含额外开箱判定）
export function rollOnce(luck = 0, pools = {}) {
  const rates = computeRates(luck)
  const total = rates.clothing + rates.decoration + rates.item + rates.gold
  let r = Math.random() * total

  if ((r -= rates.clothing) < 0) {
    const it = pick(pools.clothings)
    if (it) return { type: 'clothing', item: it }
    // 池子为空则退化为金币，保证不空转
    return { type: 'gold', amount: rollGold() }
  }
  if ((r -= rates.decoration) < 0) {
    const it = pick(pools.decorations)
    if (it) return { type: 'decoration', item: it }
    return { type: 'gold', amount: rollGold() }
  }
  if ((r -= rates.item) < 0) {
    const it = pick(pools.items)
    if (it) return { type: 'item', item: it }
    return { type: 'gold', amount: rollGold() }
  }
  return { type: 'gold', amount: rollGold() }
}

// 开 n 个箱子：内部处理 5% 额外开箱（可连爆）
// 返回 { draws: [...], extraCount: n }，extraCount 为额外开出的箱子数
export function openChests(count = 1, luck = 0, pools = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  const draws = []
  let extraCount = 0

  const drawOne = () => {
    draws.push(rollOnce(luck, pools))
    // 额外开箱：每次开完判定一次，命中则再开一个（递归处理连爆）
    if (Math.random() * 100 < EXTRA_CHEST_RATE) {
      extraCount += 1
      drawOne()
    }
  }

  for (let i = 0; i < n; i++) drawOne()
  return { draws, extraCount }
}

//  结果汇总（供 UI 一次性列出物资） 
// 把 draws 聚合成展示列表
export function summarizeDraws(draws = []) {
  const itemMap = new Map() // key: type + ':' + id -> entry
  let totalGold = 0
  let goldCount = 0

  for (const d of draws) {
    if (!d) continue
    if (d.type === 'gold') {
      totalGold += d.amount || 0
      goldCount += 1
      continue
    }
    const it = d.item
    if (!it) continue
    const key = `${d.type}:${it.id}`
    const exist = itemMap.get(key)
    if (exist) {
      exist.count += 1
    } else {
      itemMap.set(key, {
        kind: d.type,
        id: it.id,
        label: it.name,
        icon: it.icon,
        count: 1,
        rarity: d.type === 'clothing' ? 'legend' : d.type === 'decoration' ? 'rare' : 'normal',
      })
    }
  }

  const list = Array.from(itemMap.values())
  // 稀有度排序：传说(服装) > 稀有(装饰品) > 普通(物品)
  const rank = { legend: 0, rare: 1, normal: 2 }
  list.sort((a, b) => (rank[a.rarity] - rank[b.rarity]) || (b.count - a.count))

  if (goldCount > 0) {
    list.push({
      kind: 'gold',
      id: '__gold__',
      label: '金币',
      icon: 'fa-solid fa-coins',
      count: goldCount,
      gold: totalGold,
      rarity: 'gold',
    })
  }

  return { list, totalGold, goldCount, totalDraws: draws.length }
}

// 期望值估算（供定价参考，不改动即可用于自测）
// pools 传价格数组，便于算出平均价值
export function estimateValue(rates, avgClothing, avgDecoration, avgItem, goldAvg) {
  return (
    rates.clothing / 100 * avgClothing +
    rates.decoration / 100 * avgDecoration +
    rates.item / 100 * avgItem +
    rates.gold / 100 * goldAvg
  )
}
