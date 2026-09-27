import { defineStore } from "pinia";

export const useUserStore = defineStore('user', {
  state: () => ({
    currentUser: '玩家',
    usernameSet: false,
  }),

  getters: {
    isUsernameSet: (state) => state.usernameSet,
  },

  actions: {
    loadMetaData() {
      const saved = localStorage.getItem('user_data');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          this.currentUser = parsed.currentUser || '玩家';
          this.usernameSet = parsed.usernameSet || false;
        } catch (e) {
          console.warn('加载用户数据失败', e);
        }
      }
      this.saveMetaData();
    },

    saveMetaData() {
      localStorage.setItem('user_data', JSON.stringify({
        currentUser: this.currentUser,
        usernameSet: this.usernameSet,
      }));
    },

    loadData() {
      this.loadMetaData();
    },

    setCurrentUser(username) {
      if (!username || !username.trim()) return;
      this.currentUser = username.trim();
      this.usernameSet = true;
      this.saveMetaData();
    },
  },
});
