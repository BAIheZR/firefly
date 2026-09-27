import { defineStore } from "pinia";
import { useGoldStore } from "./gold";
import { useTasksStore } from "./tasks";
import xmdgj from "@/images/xmdgj.png";
import trash from "@/images/trash.png";
import xq from "@/images/xq.png";
import spark_doll from "@/images/spark_doll.png";
import spark_dollTwo from "@/images/spark_dollTwo.png";
import Clock_Kid_Decoration from "@/images/Clock_Kid_Decoration.png";
import firefly_one from "@/images/firefly_one.png";
import zxyhzy from "@/images/zxyhzy.png";
import xbd from "@/images/xbd.png";
import Robin from "@/images/item/Robin.png";
import coffee from "@/images/item/coffee.png";
import suled from "@/images/item/suled.png";
import xy from "@/images/item/xy.png";
import concert_tickets from "@/images/item/concert_tickets.jpg";
// 新增一般商品图片
import item_icon from "@/images/item/icon.png";
import suledp from "@/images/item/suledp.png";
// 装饰品（model_ 前缀，含手误 medel_）
import model_1 from "@/images/item/model_1.png";
import model_2 from "@/images/item/model_2.png";
import model_3 from "@/images/item/model_3.png";
import model_4 from "@/images/item/medel_4.png";
import model_samu from "@/images/item/medel_samu.png";
// 主页人物立绘
import fireflySpring from "@/images/game/firefly_spring.png";
import smallBd from "@/images/game/small_bd.png";
import fireflyZx from "@/images/game/firefly_zx.png";
const ALL_ITEMS =[
    // 物品
    {id:1,name:'橡木蛋糕卷',desc:'爱吃',price:1000,icon: xmdgj, category: 'item',decs2:"+50好感度,+20行动点",affection:50,actionPoint:20},
    {id:2,name:'垃圾袋',desc:'有奇效',price:200,icon: trash, category: 'item',decs2:"-100好感度,+10行动点",affection:-100,actionPoint:10},
    {id:3,name:'星琼160',desc:'开拓者的最爱',price:1600,icon: xq, category: 'item',decs2:"+50好感度,+10行动点",affection:50,actionPoint:10},
    {id:4,name:'火花玩偶',desc:'啊？是主播？！',price:150,icon: spark_doll, category: 'item',decs2:"+10好感度,+10行动点",affection:10,actionPoint:10},
    {id:5,name:'花火玩偶',desc:'好像没有什么危险',price:600,icon: spark_dollTwo, category: 'item',decs2:"随机+—100好感度,随机+-20点行动点",affection:[-100,100],actionPoint:[-20,20]},
    {id:6,name:'钟表小子（装饰品）',desc:'据说，只有够纯真，直率，有童心的小朋友才能看见（芝士装饰品，非消耗品）',price:10000,icon: Clock_Kid_Decoration, category: 'item',decs2:"加成选择:好感度增长，行动点恢复，金币获取，运气值增加",tag:'decorations',affection:0,actionPoint:0},
    {id:7,name:'姬子的咖啡？',desc:'据说喝了之后有奇效,应该很好喝吧？',price:100,icon: coffee, category: 'item',decs2:"-100好感度,+10点行动点",affection:-100,actionPoint:10},
    {id:8,name:'知更鸟的吧唧?(不像)',desc:'这可是大名鼎鼎的歌手明星啊',price:1000,icon: Robin, category: 'item',decs2:"+100好感度,+40点行动点",affection:100,actionPoint:40},
    {id:9,name:'苏乐达',desc:'似乎味道和可乐一样呢（bushi）',price:50,icon: suled, category: 'item',decs2:"+10点行动点",affection:0,actionPoint:10},
    {id:10,name:'限定彩妆⌈夕颜⌋',desc:'在离开匹诺康尼前，给萤宝的小小纪念品，希望流萤会喜欢',price:50,icon: xy, category: 'item',decs2:"+50点好感度",affection:50,actionPoint:0},
    {id:11,name:'知更鸟的演唱会门票（bushi）',desc:'流萤想去看知更鸟的演唱会好久了呢，上一次看还是在上一次',price:580,icon: concert_tickets, category: 'item',decs2:"+150点好感度",affection:150,actionPoint:0},
    {id:13,name:'苏乐达Pro',desc:'苏乐达的升级版，气泡更足了',price:120,icon: suledp, category: 'item',decs2:"+25点行动点",affection:0,actionPoint:25},
    {id:14,name:'星穹列车模型',desc:'摆在桌上的精致小摆件',price:8000,icon: model_1, category: 'item',tag:'decorations',allowedBuffTypes:['ap'],affection:0,actionPoint:0},
    {id:15,name:'知更鸟‘周边’？',desc:'据说能带来好运的小物件',price:8000,icon: model_2, category: 'item',tag:'decorations',allowedBuffTypes:['affection'],affection:0,actionPoint:0},
    {id:16,name:'迷迷头套',desc:'复古风格的桌面装饰',price:8000,icon: model_3, category: 'item',tag:'decorations',allowedBuffTypes:['luck','affection'],affection:0,actionPoint:0},
    {id:17,name:'流萤猫猫糕',desc:'带着淡淡微光的装饰',price:10000,icon: model_4, category: 'item',tag:'decorations',allowedBuffTypes:['luck','ap'],affection:0,actionPoint:0},
    {id:18,name:'萨姆模型',desc:'一个看起来很温暖的摆件',price:12000,icon: model_samu, category: 'item',tag:'decorations',allowedBuffTypes:['ap','affection'],affection:0,actionPoint:0},

    // 服装
    {id:101,name:'流萤&春日手信',desc:'据说很多人都喜欢这个服装',price:15000,icon: firefly_one, category: 'clothing', gameImg: fireflySpring},
    {id:103,name:'流萤&小不点',desc:'萝莉控？死刑o((>ω< ))o!',price:15000,icon: xbd, category: 'clothing', gameImg: smallBd},
    {id:107,name:'流萤&仲夏萤火之约',desc:'与萤火虫共舞的约定',price:15000,icon: zxyhzy, category: 'clothing',gameImg: fireflyZx},
    {id:108,name:'流萤&战斗服',desc:'老兵烧烤？',price:15000,icon: 'fa-solid fa-bread-slice', category: 'clothing'},

]
export const useInventoryStore = defineStore('inventory', {
  state: () => ({
    inventory: {},
    // 当前穿戴的服装ID（null 表示未穿戴）
    equippedClothingId: null,
    // 玩家好感度（默认 100，无上限，下限 0）
    affection: 100,
    // 行动点加成（使用物品累计，显示时与等级基础值相加）
    actionBonus: 0,
    // 行动点恢复累计（每 3 分钟自动恢复，享受「行动点恢复」加成倍率）
    actionRecover: 0,
  }),

  getters: {
    // 获取某一类别的商品列表（用于商店展示）
    shopItems: (state) => (category) => {
      return ALL_ITEMS.filter(item => item.category === category)
    },

    // 获取仓库中某一类别的商品列表（附带数量）
    warehouseItems: (state) => (category) => {
      return ALL_ITEMS
        .filter(item => item.category === category && (state.inventory[item.id] || 0) > 0)
        .map(item => ({
          ...item,
          count: state.inventory[item.id] || 0,
        }))
    },
    // 获取仓库中所有物品（附带数量）
    allWarehouseItems: (state) => {
      return ALL_ITEMS
        .filter(item => (state.inventory[item.id] || 0) > 0)
        .map(item => ({
          ...item,
          count: state.inventory[item.id] || 0,
        }))
    },
    // 获取玩家拥有的装饰品（tag === 'decorations'，用于永久加成）
    ownedDecorations: (state) => {
      return ALL_ITEMS
        .filter(item => item.tag === 'decorations' && (state.inventory[item.id] || 0) > 0)
        .map(item => ({
          ...item,
          count: state.inventory[item.id] || 0,
        }))
    },
    // 当前穿戴的服装（校验拥有，未穿戴或已失去返回 null）
    equippedClothing: (state) => {
      const id = state.equippedClothingId
      if (!id || (state.inventory[id] || 0) <= 0) return null
      return ALL_ITEMS.find(item => item.id === id) || null
    },
    // 可穿戴的服装（拥有且带主页立绘 gameImg）
    equippableClothings: (state) => {
      return ALL_ITEMS
        .filter(item => item.category === 'clothing' && item.gameImg && (state.inventory[item.id] || 0) > 0)
        .map(item => ({
          ...item,
          count: state.inventory[item.id] || 0,
        }))
    },
    // 兼容模板：代理到 goldStore
    currentGold() {
      const goldStore = useGoldStore()
      return goldStore.currentGold
    },
    // 兼容直接访问 store.gold 的写法
    gold() {
      const goldStore = useGoldStore()
      return goldStore.gold
    },
  },

  actions: {
    // 初始化（从 localStorage 恢复）
    loadData() {
      const goldStore = useGoldStore()
      // 先确保 goldStore 也加载过（处理旧存档迁移依赖顺序问题）
      goldStore.loadData()

      const saved = localStorage.getItem('game_inventory')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          this.inventory = parsed.inventory ?? {}
          this.equippedClothingId = parsed.equippedClothingId ?? null
          // == 旧存档迁移：game_inventory 中可能还有 gold ==
          if (typeof parsed.gold === 'number' && !localStorage.getItem('game_gold_migrated')) {
            goldStore.setGold(parsed.gold)
            localStorage.setItem('game_gold_migrated', '1')
          }
        } catch (e) {
          console.warn('读取存档失败，使用默认值')
        }
      }
      // 校验穿戴的服装是否仍拥有，若失去则自动脱下
      if (this.equippedClothingId && (this.inventory[this.equippedClothingId] || 0) <= 0) {
        this.equippedClothingId = null
      }
      // 加载好感度（默认 100，无上限）
      const affRaw = localStorage.getItem('player_affection')
      if (affRaw) {
        try {
          const v = JSON.parse(affRaw)
          if (typeof v === 'number') this.affection = v
          else if (v && typeof v.affection === 'number') this.affection = v.affection
        } catch (e) {}
      } else {
        this.affection = 100
        localStorage.setItem('player_affection', '100')
      }
      // 加载行动点加成（默认 0）
      const apRaw = localStorage.getItem('player_action_bonus')
      if (apRaw) {
        try {
          const v = JSON.parse(apRaw)
          if (typeof v === 'number') this.actionBonus = v
        } catch (e) {}
      }
      // 加载行动点恢复累计（默认 0）
      const arRaw = localStorage.getItem('player_action_recover')
      if (arRaw) {
        try {
          const v = JSON.parse(arRaw)
          if (typeof v === 'number') this.actionRecover = v
        } catch (e) {}
      }
      // 首次运行或加载失败，会自动用 state 默认值，并保存一次
      this.saveData()
    },

    //保存到 localStorage
    saveData() {
      localStorage.setItem('game_inventory', JSON.stringify({
        inventory: this.inventory,
        equippedClothingId: this.equippedClothingId,
      }))
    },

    // 穿戴服装（仅允许已拥有且带主页立绘的服装）
    equipClothing(itemId) {
      const item = ALL_ITEMS.find(i => i.id === itemId)
      if (!item || item.category !== 'clothing' || !item.gameImg) {
        return { success: false, msg: '该服装无法穿戴' }
      }
      if ((this.inventory[itemId] || 0) <= 0) {
        return { success: false, msg: '尚未拥有该服装' }
      }
      this.equippedClothingId = itemId
      this.saveData()
      return { success: true, msg: `已穿戴「${item.name}」` }
    },

    // 脱下服装
    unequipClothing() {
      this.equippedClothingId = null
      this.saveData()
      return { success: true, msg: '已更换服装' }
    },

    //购买
    buyItem(itemId, quantity = 1) {
      const goldStore = useGoldStore()
      const tasksStore = useTasksStore()
      const item = ALL_ITEMS.find(i => i.id === itemId)
      if (!item) {
        alert('商品不存在')
        return false
      }
      // 服装只能购买一次
      if (item.category === 'clothing'){
        if(this.inventory[itemId]&&this.inventory[itemId]>0){
          alert("不可重复购买")
          return false
        }
        quantity = 1
      }
      const totalCost = item.price * quantity
      // 用 goldStore.spendGold 统一扣费（自动检查余额 + 持久化）
      if (!goldStore.spendGold(totalCost, `购买${item.name}`)) {
        alert('金币不足！')
        return false
      }
      this.inventory[itemId] = (this.inventory[itemId] || 0) + quantity
      this.saveData()
      // 同步任务统计
      tasksStore.loadData()
      tasksStore.addStat('totalShopBuys', quantity)
      tasksStore.addStat('totalShopGold', totalCost)
      this._syncCollectStats(tasksStore)
      return true
    },

    //使用（消耗一个）
    useItem(itemId) {
      const tasksStore = useTasksStore()
      const item = ALL_ITEMS.find(i => i.id === itemId)
      if (!item) {
        alert('商品不存在')
        return false
      }
      if (!this.inventory[itemId] || this.inventory[itemId] <= 0) {
        alert('库存不足')
        return false
      }
      // 减库存
      this.inventory[itemId] -= 1
      if (this.inventory[itemId] === 0) {
        delete this.inventory[itemId]
      }
      this.saveData()
      // 应用好感度 / 行动点变化到 localStorage（供 Home 页面读取）
      this._applyPlayerStats(item)
      // 同步收集类统计
      tasksStore.loadData()
      this._syncCollectStats(tasksStore)
      console.log(`使用了商品 ${itemId}`)
      return true
    },

    // 内部：根据物品的 affection / actionPoint 字段更新玩家状态
    // - 字段支持 数值（固定）或 [min,max] 数组（在该范围随机整数）
    // - 直接更新 store 响应式 state（Home 页面用 computed 自动响应）并持久化
    // - 好感度默认 100，无上限，下限 0；行动点加成累加
    _applyPlayerStats(item) {
      const aff = this._resolveStat(item.affection)
      const ap = this._resolveStat(item.actionPoint)
      if (aff === 0 && ap === 0) return
      // 好感度
      if (aff !== 0) {
        this.affection = Math.max(0, this.affection + aff)
        localStorage.setItem('player_affection', String(this.affection))
      }
      // 行动点加成
      if (ap !== 0) {
        this.actionBonus = this.actionBonus + ap
        localStorage.setItem('player_action_bonus', String(this.actionBonus))
      }
    },

    // 内部：解析字段，数值直接返回，数组在 [min,max] 范围内随机整数
    _resolveStat(field) {
      if (Array.isArray(field)) {
        const min = field[0]
        const max = field[1]
        if (typeof min !== 'number' || typeof max !== 'number') return 0
        const lo = Math.min(min, max)
        const hi = Math.max(min, max)
        return Math.floor(Math.random() * (hi - lo + 1)) + lo
      }
      return typeof field === 'number' ? field : 0
    },

    // 行动点恢复：累加到 actionRecover（响应式）并持久化
    // gain 已含「行动点恢复」加成倍率，由调用方计算
    recoverActionPoint(gain) {
      if (typeof gain !== 'number' || gain <= 0) return
      this.actionRecover = (this.actionRecover || 0) + gain
      localStorage.setItem('player_action_recover', String(this.actionRecover))
      this.saveData()
    },

    // 消耗行动点（用于开局等）：先扣恢复，再扣物品加成；若仍不够失败
    // 当前行动点 = 基础上限(cap) + actionBonus + actionRecover
    spendActionPoint(amount) {
      if (typeof amount !== 'number' || amount <= 0) return { success: false, msg: '消耗数量无效' }
      const cap = (() => {
        let level = 0
        try {
          const p = JSON.parse(localStorage.getItem('player_level_data') || '{}')
          if (typeof p.level === 'number') level = p.level
        } catch (e) {}
        return 50 + level * 10
      })()
      const bonus = this.actionBonus || 0
      const recover = this.actionRecover || 0
      const total = cap + bonus + recover
      if (total < amount) {
        return { success: false, msg: `行动点不足（需 ${amount}，当前 ${total}）` }
      }
      let remain = amount
      // 1) 扣恢复累计（可扣到负数，不会破显示基础部分）
      if (remain > 0 && recover > 0) {
        const take = Math.min(remain, recover)
        this.actionRecover -= take
        remain -= take
      }
      // 2) 扣物品加成（允许把 actionBonus 扣到 0 或负数，它本身就是相对基础的"加/减"）
      if (remain > 0) {
        const take = Math.min(remain, Math.max(0, bonus))
        this.actionBonus -= take
        remain -= take
      }
      // 3) 剩余部分用"恢复负数"记账（不会让显示跌破 0 只是 actionRecover 变负）
      if (remain > 0) {
        this.actionRecover = (this.actionRecover || 0) - remain
      }
      localStorage.setItem('player_action_recover', String(this.actionRecover || 0))
      localStorage.setItem('player_action_bonus', String(this.actionBonus || 0))
      this.saveData()
      return { success: true, msg: `消耗 ${amount} 行动点` }
    },

    // 出售（半价，消耗一个）
    sellItem(itemId) {
      const goldStore = useGoldStore()
      const tasksStore = useTasksStore()
      if (!this.inventory[itemId] || this.inventory[itemId] <= 0) {
        alert('库存不足')
        return false
      }
      const item = ALL_ITEMS.find(i => i.id === itemId)
      if (!item) return false
      const income = Math.floor(item.price * 0.5)
      goldStore.addGold(income, `出售${item.name}`)
      this.inventory[itemId] -= 1
      if (this.inventory[itemId] === 0) {
        delete this.inventory[itemId]
      }
      this.saveData()
      // 同步收集类统计
      tasksStore.loadData()
      this._syncCollectStats(tasksStore)
      return true
    },

    // 内部：同步服装/物品数量到任务收集类统计
    _syncCollectStats(tasksStore) {
      let clothCount = 0
      let itemCount = 0
      const inv = this.inventory || {}
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
    },
  },
})

// 读取某类永久加成的总倍率（1 + sum(value)/100），typeKey: 'affection' | 'ap' | 'gold' | 'luck'
// 从 localStorage 的 player_selected_buffs 累加同类加成数值
export const getBuffMultiplier = (typeKey) => {
  if (typeof window === 'undefined' || !window.localStorage) return 1
  const raw = localStorage.getItem('player_selected_buffs')
  if (!raw) return 1
  let list = []
  try { list = JSON.parse(raw) || [] } catch (e) { return 1 }
  let sum = 0
  for (const sb of list) {
    if (sb && sb.typeKey === typeKey && typeof sb.value === 'number') sum += sb.value
  }
  return 1 + sum / 100
}

// 修改玩家好感度（默认 100，无上限，下限 0）
// 通过 store 响应式 state 更新（Home 页面 computed 自动响应）并持久化
// 正向增长享受「好感度增长」加成倍率，负向减少不放大
// 供签到 / 每日上线等场景调用，返回最新好感度
export const changeAffection = (amount) => {
  const store = useInventoryStore()
  if (typeof amount !== 'number' || amount === 0) return store.affection
  let delta = amount
  if (amount > 0) delta = Math.round(amount * getBuffMultiplier('affection'))
  store.affection = Math.max(0, store.affection + delta)
  localStorage.setItem('player_affection', String(store.affection))
  return store.affection
}

// 读取当前好感度（默认 100）
export const getCurrentAffection = () => useInventoryStore().affection