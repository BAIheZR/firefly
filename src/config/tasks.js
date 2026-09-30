import { defineStore } from "pinia";
import { useGoldStore } from "./gold";
// gacha.js 是纯逻辑模块（自身无任何 import），这里引用不会产生循环依赖
import { addChest, getAllChests } from "./gacha";

// 任务奖励发的宝箱：当前只有「木质宝箱」一种，取队伍里第一个作为默认
const DEFAULT_CHEST_ID = getAllChests()[0]?.id || 'wood'

// 进阶任务配置（任务系统）
const ADVANCED_TASKS = [
  //  签到类 
  {
    id: 'sign_1',
    name: '初次签到',
    desc: '完成第 1 次签到',
    category: 'sign',
    icon: 'fa-solid fa-calendar-check',
    target: 1,
    reward: 50,
    rewardExp: 10,
  },
  {
    id: 'sign_2',
    name: '我要加成',
    desc: '准备第一个加成',
    category: 'sign',
    icon: 'fa-solid fa-calendar-check',
    target: 1,
    reward: 500,
    rewardExp: 50,
  },
  {
    id: 'sign_3',
    name: '‘打半’',
    desc: '装备了5个加成',
    category: 'sign',
    icon: 'fa-solid fa-calendar-check',
    target: 5,
    reward: 2500,
    rewardExp: 500,
  },
  {
    id: 'sign_4',
    name: '加成不足恐惧症',
    desc: '装备栏所有加成全部准备',
    category: 'sign',
    icon: 'fa-solid fa-calendar-check',
    target: 10,
    reward: 5000,
    rewardExp: 1000,
  },
  {
    id: 'sign_7',
    name: '一周坚持',
    desc: '累计签到 7 天',
    category: 'sign',
    icon: 'fa-solid fa-calendar-week',
    target: 7,
    reward: 300,
    rewardExp: 50,
  },
  {
    id: 'sign_30',
    name: '月度达人',
    desc: '累计签到 30 天',
    category: 'sign',
    icon: 'fa-solid fa-calendar-days',
    target: 30,
    reward: 1500,
    rewardExp: 200,
  },
  {
    id: 'sign_100',
    name: '百日签到王',
    desc: '累计签到 100 天',
    category: 'sign',
    icon: 'fa-solid fa-crown',
    target: 100,
    reward: 10000,
    rewardExp: 1000,
  },

  //  消费类 
  {
    id: 'shop_1',
    name: '购物新手',
    desc: '在商店完成第 1 次购买',
    category: 'shop',
    icon: 'fa-solid fa-store',
    target: 1,
    reward: 30,
    rewardExp: 5,
  },
  {
    id: 'shop_10',
    name: '购物达人',
    desc: '累计购买 10 件物品',
    category: 'shop',
    icon: 'fa-solid fa-cart-shopping',
    target: 10,
    reward: 500,
    rewardExp: 80,
  },
  {
    id: 'shop_gold_5000',
    name: '挥金如土',
    desc: '累计消费满 5000 金币',
    category: 'shop',
    icon: 'fa-solid fa-sack-dollar',
    target: 5000,
    reward: 6000,
    rewardExp: 500,
  },

  //  收集类 
  {
    id: 'cloth_1',
    name: '第一套服装',
    desc: '拥有第 1 件服装',
    category: 'collect',
    icon: 'fa-solid fa-shirt',
    target: 1,
    reward: 100,
    rewardExp: 30,
  },
  {
    id: 'cloth_5',
    name: '衣柜满满',
    desc: '拥有 5 件不同的服装',
    category: 'collect',
    icon: 'fa-solid fa-vest',
    target: 5,
    reward: 1000,
    rewardExp: 200,
  },
  {
    id: 'item_20',
    name: '囤货王',
    desc: '仓库中累计拥有 20 件物品',
    category: 'collect',
    icon: 'fa-solid fa-boxes-stacked',
    target: 20,
    reward: 5000,
    rewardExp: 1000,
  },
  //  宝箱类 
  {
    id: 'chest_1',
    name: '第一次开箱',
    desc: '开启第 1 个宝箱',
    category: 'chest',
    icon: 'fa-solid fa-box-open',
    target: 1,
    reward: 500,
    rewardExp: 50,
    rewardChest: 1,
  },
  {
    id: 'chest_10',
    name: '第一次十连',
    desc: '一次性开启 10 个宝箱',
    category: 'chest',
    icon: 'fa-solid fa-layer-group',
    target: 10,
    reward: 3000,
    rewardExp: 300,
    rewardChest: 3,
  },
  {
    id: 'chest_legend',
    name: '珍贵的物品',
    desc: '首次从宝箱中开出服装（爆率最低）',
    category: 'chest',
    icon: 'fa-solid fa-shirt',
    target: 1,
    reward: 10000,
    rewardExp: 1000,
    rewardChest: 5,
  },

  // 音乐类
  {
    id: 'music_1',
    name: '这也能听歌？',
    desc: '首次导入音乐',
    category: 'music',
    icon: 'fa-solid fa-music',
    target: 1,
    reward: 500,
    rewardExp: 100,
  },
  {
    id: 'music_2',
    name: '忧郁的王',
    desc: '听歌超过100分钟',
    category: 'music',
    icon: 'fa-solid fa-music',
    target: 100,
    reward: 1000,
    rewardExp: 1000,
  },
  {
    id: 'music_3',
    name: '古希腊掌管抑郁的神',
    desc: '听歌超过1000分钟',
    category: 'music',
    icon: 'fa-solid fa-music',
    target: 1000,
    reward: 1000,
    rewardExp: 1000,
  },
];

const TASKS_KEY = 'advanced_tasks_data';

// 统计字段 → 关联任务 的映射（addStat / setStat / recordMax 三个 action 共用）
// 注意：一个 statKey 更新时，会把**该字段的当前值**直接写进关联任务的 progress。
// 所以「累计型」用 addStat、「覆盖型」用 setStat、「取最大值型」用 recordMax。
const STAT_TASK_MAP = {
  totalSignDays: ['sign_1', 'sign_7', 'sign_30', 'sign_100'],
  totalShopBuys: ['shop_1', 'shop_10'],
  totalShopGold: ['shop_gold_5000'],
  totalClothCount: ['cloth_1', 'cloth_5'],
  totalItemCount: ['item_20'],
  totalMusicImports: ['music_1'],
  totalListenMinutes: ['music_2', 'music_3'],
  totalBuffsEquipped: ['sign_2', 'sign_3', 'sign_4'],
  //  宝箱 
  totalChestOpened: ['chest_1'],
  maxChestSingle: ['chest_10'],
  totalChestClothing: ['chest_legend'],
};

// 标记 store 是否已从 localStorage 加载，防止未初始化时 saveData 覆盖已领取记录
let _tasksLoaded = false;

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    // 任务进度记录 { taskId: currentProgress }
    progress: {},
    // 已领取奖励的任务ID列表
    claimed: [],
    // 统计数据
    stats: {
      totalSignDays: 0,      // 累计签到天数
      totalShopBuys: 0,      // 累计购买次数
      totalShopGold: 0,      // 累计消费金币
      totalClothCount: 0,    // 服装数量
      totalItemCount: 0,     // 物品数量
      totalMusicImports: 0,  // 音乐导入次数
      totalListenMinutes: 0, // 听歌时长（分钟）
      totalBuffsEquipped: 0, // 当前装备的加成数量
      //  宝箱 
      totalChestOpened: 0,   // 累计开箱数（含 5% 额外开出的）
      maxChestSingle: 0,     // 单次开箱的最大数量（用于「十连」判定）
      totalChestClothing: 0, // 从宝箱中累计开出的服装数（爆率最低档）
    },
  }),

  getters: {
    // 获取所有任务（附带状态）
    allTasks: (state) => {
      return ADVANCED_TASKS.map(task => {
        const current = state.progress[task.id] || 0;
        const isCompleted = current >= task.target;
        const isClaimed = state.claimed.includes(task.id);
        return {
          ...task,
          current: Math.min(current, task.target),
          isCompleted,
          isClaimed,
          canClaim: isCompleted && !isClaimed,
          percent: Math.min(100, Math.floor((current / task.target) * 100)),
        };
      });
    },

    // 按分类获取任务
    tasksByCategory: (state) => (category) => {
      return ADVANCED_TASKS
        .filter(t => t.category === category)
        .map(task => {
          const current = state.progress[task.id] || 0;
          const isCompleted = current >= task.target;
          const isClaimed = state.claimed.includes(task.id);
          return {
            ...task,
            current: Math.min(current, task.target),
            isCompleted,
            isClaimed,
            canClaim: isCompleted && !isClaimed,
            percent: Math.min(100, Math.floor((current / task.target) * 100)),
          };
        });
    },

    // 可领取的任务数量
    claimableCount(state) {
      return ADVANCED_TASKS.filter(task => {
        const current = state.progress[task.id] || 0;
        return current >= task.target && !state.claimed.includes(task.id);
      }).length;
    },

    // 已完成任务数
    completedCount(state) {
      return ADVANCED_TASKS.filter(task => {
        const current = state.progress[task.id] || 0;
        return current >= task.target;
      }).length;
    },

    // 总任务数
    totalCount() {
      return ADVANCED_TASKS.length;
    },

    // 分类元信息
    categoryMeta() {
      return [
        { key: 'sign', name: '任务', icon: 'fa-solid fa-calendar-check' },
        { key: 'shop', name: '消费任务', icon: 'fa-solid fa-store' },
        { key: 'collect', name: '收集任务', icon: 'fa-solid fa-trophy' },
        { key: 'chest', name: '宝箱任务', icon: 'fa-solid fa-box-open' },
        { key: 'music', name: '音乐任务', icon: 'fa-solid fa-music' },
      ];
    },
  },

  actions: {
    loadData() {
      const saved = localStorage.getItem(TASKS_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          this.progress = parsed.progress || {};
          this.claimed = parsed.claimed || [];
          this.stats = { ...this.stats, ...(parsed.stats || {}) };
        } catch (e) {
          console.warn('加载任务数据失败，使用默认值');
        }
      }
      _tasksLoaded = true;
      this.saveData();
    },

    saveData() {
      localStorage.setItem(TASKS_KEY, JSON.stringify({
        progress: this.progress,
        claimed: this.claimed,
        stats: this.stats,
      }));
    },

    // 内部：把某个统计字段的当前值同步到它关联的所有任务进度上
    _syncTasks(statKey) {
      const taskIds = STAT_TASK_MAP[statKey] || [];
      const value = this.stats[statKey];
      taskIds.forEach(tid => {
        this.progress[tid] = value;
      });
    },

    // 通用：给某个统计字段 +N，并自动更新对应任务进度
    addStat(statKey, amount = 1) {
      if (!_tasksLoaded) this.loadData();
      if (!(statKey in this.stats)) return;
      this.stats[statKey] = (this.stats[statKey] || 0) + amount;
      this._syncTasks(statKey);
      this.saveData();
    },

    // 直接设置某个统计值（覆盖而非累加，用于物品/服装数量类）
    setStat(statKey, value) {
      if (!_tasksLoaded) this.loadData();
      if (!(statKey in this.stats)) return;
      this.stats[statKey] = value;
      this._syncTasks(statKey);
      this.saveData();
    },

    // 记录「历史最大值」型统计（如单次开箱数量），只增不减
    recordMax(statKey, value) {
      if (!_tasksLoaded) this.loadData();
      if (!(statKey in this.stats)) return;
      const prev = Number(this.stats[statKey]) || 0;
      const next = Math.max(prev, Number(value) || 0);
      if (next === prev) return;   // 没超过就不写盘
      this.stats[statKey] = next;
      this._syncTasks(statKey);
      this.saveData();
    },

    // 领取任务奖励
    claimTask(taskId, inventoryStore /* 兼容旧调用，可忽略 */) {
      if (!_tasksLoaded) this.loadData();
      const goldStore = useGoldStore()
      const task = ADVANCED_TASKS.find(t => t.id === taskId);
      if (!task) return { success: false, msg: '任务不存在' };

      const current = this.progress[taskId] || 0;
      if (current < task.target) return { success: false, msg: '任务未完成' };
      if (this.claimed.includes(taskId)) return { success: false, msg: '奖励已领取' };

      this.claimed.push(taskId);

      // 发放金币奖励
      if (task.reward) {
        goldStore.addGold(task.reward, `任务奖励:${task.name}`);
      }

      // 发放宝箱奖励
      const chestCount = Number(task.rewardChest) || 0;
      if (chestCount > 0) {
        addChest(DEFAULT_CHEST_ID, chestCount);
      }

      this.saveData();
      return {
        success: true,
        reward: task.reward,
        rewardExp: task.rewardExp || 0,
        rewardChest: chestCount,
        msg: `领取成功！获得 ${task.reward} 金币`
          + (task.rewardExp ? ` + ${task.rewardExp} 经验` : '')
          + (chestCount > 0 ? ` + ${chestCount} 个宝箱` : ''),
      };
    },

    // 一键领取所有可领取的奖励
    claimAll(inventoryStore /* 兼容旧调用，可忽略 */) {
      if (!_tasksLoaded) this.loadData();
      const goldStore = useGoldStore()
      const results = [];
      let totalGold = 0;
      let totalExp = 0;
      let totalChest = 0;

      ADVANCED_TASKS.forEach(task => {
        const current = this.progress[task.id] || 0;
        if (current >= task.target && !this.claimed.includes(task.id)) {
          this.claimed.push(task.id);
          totalGold += task.reward;
          totalExp += task.rewardExp || 0;
          totalChest += Number(task.rewardChest) || 0;
          results.push(task.id);
        }
      });

      if (totalGold > 0) {
        goldStore.addGold(totalGold, '一键领取任务奖励');
      }
      if (totalChest > 0) {
        addChest(DEFAULT_CHEST_ID, totalChest);
      }

      this.saveData();
      return {
        success: results.length > 0,
        claimedIds: results,
        totalGold,
        totalExp,
        totalChest,
        msg: results.length > 0
          ? `已领取 ${results.length} 个奖励，共 ${totalGold} 金币`
            + (totalExp ? ` + ${totalExp} 经验` : '')
            + (totalChest > 0 ? ` + ${totalChest} 个宝箱` : '')
          : '暂无可领取的奖励',
      };
    },
  },
});
