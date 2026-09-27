import { defineStore } from "pinia";
import { getBuffMultiplier } from "./inventory";

const GOLD_KEY = 'game_gold';
const DEFAULT_GOLD = 0;

export const useGoldStore = defineStore('gold', {
  state: () => ({
    gold: DEFAULT_GOLD,
  }),

  getters: {
    currentGold: (state) => state.gold,
  },

  actions: {
    // 初始化（从 localStorage 恢复）
    loadData() {
      const saved = localStorage.getItem(GOLD_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          this.gold = parsed.gold ?? DEFAULT_GOLD;
        } catch (e) {
          console.warn('读取金币数据失败，使用默认值');
          this.gold = DEFAULT_GOLD;
        }
      }
      
      this.saveData();
    },

    // 保存到 localStorage
    saveData() {
      localStorage.setItem(GOLD_KEY, JSON.stringify({
        gold: this.gold,
      }));
    },

    // 增加金币
    // amount: 数量（正数）
    // reason: 可选，来源描述（预留，方便后续加流水）
    // 享受「金币获取」永久加成倍率
    addGold(amount, reason = '') {
      if (typeof amount !== 'number' || amount <= 0) return false;
      const actual = Math.round(amount * getBuffMultiplier('gold'));
      this.gold += actual;
      this.saveData();
      return true;
    },

    // 消费金币（自动检查余额）
    // amount: 数量（正数）
    // 返回: true=扣费成功，false=余额不足
    spendGold(amount, reason = '') {
      if (typeof amount !== 'number' || amount <= 0) return false;
      if (this.gold < amount) return false;
      this.gold -= amount;
      this.saveData();
      return true;
    },

    // 直接设置金币（用于存档导入等场景，不做正负校验）
    setGold(amount) {
      if (typeof amount !== 'number') return false;
      this.gold = Math.max(0, amount);
      this.saveData();
      return true;
    },
  },
});
