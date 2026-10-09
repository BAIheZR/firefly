import { defineStore } from "pinia";
// 导入预设背景图
import bgAlt from "@/images/bg2.png";
import bgNew2 from "@/images/bg_new2.jpg";

const BG_KEY = "user_background_data";

// 预设背景列表
export const PRESET_BACKGROUNDS = [
  { id: "alt", name: "默认背景", value: bgAlt },
  { id: "night", name: "夜间背景", value: bgNew2 },
];

export const useBackgroundStore = defineStore("background", {
  state: () => ({
    // 当前背景类型：'preset' | 'custom' | 'none'
    type: "none",
    // 预设背景 id
    presetId: "",
    // 自定义背景数据（base64 dataURL 或图片路径）
    customData: "",
    // 背景透明度 (0-100)
    opacity: 100,
    // 页面内容 div 透明度 (0-100)
    contentOpacity: 100,
    // 是否启用全局背景
    enabled: false,

    // = 首页专属背景（独立于全局背景，仅作用于 Home 页面） =
    // 首页背景类型：'preset' | 'custom' | 'none'
    homeType: "none",
    // 首页预设背景 id
    homePresetId: "",
    // 首页自定义背景数据（base64 dataURL 或图片路径）
    homeCustomData: "",
    // 首页背景透明度 (0-100)
    homeOpacity: 100,
    // 是否启用首页专属背景（关闭则使用 Home 默认背景）
    homeEnabled: false,

    // 夜间自动切换时，进入夜间前保存的「白天首页背景」配置（恢复用）
    homeDaySnapshot: null,
  }),

  getters: {
    // 当前背景的实际 image URL
    backgroundImage: (state) => {
      if (!state.enabled) return "";
      if (state.type === "preset") {
        const preset = PRESET_BACKGROUNDS.find((p) => p.id === state.presetId);
        return preset ? preset.value : "";
      }
      if (state.type === "custom") {
        return state.customData || "";
      }
      return "";
    },
    // 当前透明度（0-1）
    bgOpacity: (state) => state.opacity / 100,
    // 页面内容透明度（0-1）
    contentBgOpacity: (state) => state.contentOpacity / 100,

    // = 首页专属背景 getter =
    // 首页背景的实际 image URL（未启用或未设置时返回空字符串）
    homeBackgroundImage: (state) => {
      if (!state.homeEnabled) return "";
      if (state.homeType === "preset") {
        const preset = PRESET_BACKGROUNDS.find((p) => p.id === state.homePresetId);
        return preset ? preset.value : "";
      }
      if (state.homeType === "custom") {
        return state.homeCustomData || "";
      }
      return "";
    },
    // 首页背景透明度（0-1）
    homeBgOpacity: (state) => state.homeOpacity / 100,
  },

  actions: {
    loadData() {
      const saved = localStorage.getItem(BG_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          this.type = parsed.type || "none";
          this.presetId = parsed.presetId || "";
          this.customData = parsed.customData || "";
          this.opacity = parsed.opacity ?? 100;
          this.contentOpacity = parsed.contentOpacity ?? 100;
          this.enabled = parsed.enabled || false;

          // 首页专属背景
          this.homeType = parsed.homeType || "none";
          this.homePresetId = parsed.homePresetId || "";
          this.homeCustomData = parsed.homeCustomData || "";
          this.homeOpacity = parsed.homeOpacity ?? 100;
          this.homeEnabled = parsed.homeEnabled || false;
          this.homeDaySnapshot = parsed.homeDaySnapshot || null;
        } catch (e) {
          console.warn("加载背景数据失败，使用默认值");
        }
      }
    },

    saveData() {
      localStorage.setItem(
        BG_KEY,
        JSON.stringify({
          type: this.type,
          presetId: this.presetId,
          customData: this.customData,
          opacity: this.opacity,
        contentOpacity: this.contentOpacity,
        enabled: this.enabled,
        // 首页专属背景
        homeType: this.homeType,
        homePresetId: this.homePresetId,
        homeCustomData: this.homeCustomData,
        homeOpacity: this.homeOpacity,
        homeEnabled: this.homeEnabled,
        // 夜间自动切换快照
        homeDaySnapshot: this.homeDaySnapshot,
        })
      );
    },

    // 使用预设背景
    setPreset(presetId) {
      const preset = PRESET_BACKGROUNDS.find((p) => p.id === presetId);
      if (!preset) return;
      this.type = "preset";
      this.presetId = presetId;
      this.customData = "";
      this.enabled = true;
      this.saveData();
    },

    // 使用自定义背景（dataURL）
    setCustom(dataUrl) {
      this.type = "custom";
      this.customData = dataUrl;
      this.presetId = "";
      this.enabled = true;
      this.saveData();
    },

    // 关闭全局背景
    disable() {
      this.enabled = false;
      this.saveData();
    },

    // 设置透明度
    setOpacity(value) {
      this.opacity = Math.max(0, Math.min(100, Number(value) || 100));
      this.saveData();
    },

    // 设置页面内容透明度
    setContentOpacity(value) {
      this.contentOpacity = Math.max(0, Math.min(100, Number(value) || 100));
      this.saveData();
    },

    // 首页专属背景
    // 首页使用预设背景
    setHomePreset(presetId) {
      const preset = PRESET_BACKGROUNDS.find((p) => p.id === presetId);
      if (!preset) return;
      this.homeType = "preset";
      this.homePresetId = presetId;
      this.homeCustomData = "";
      this.homeEnabled = true;
      this.saveData();
    },

    // 首页使用自定义背景（dataURL）
    setHomeCustom(dataUrl) {
      this.homeType = "custom";
      this.homeCustomData = dataUrl;
      this.homePresetId = "";
      this.homeEnabled = true;
      this.saveData();
    },

    // 关闭首页专属背景（回退到 Home 默认背景）
    disableHome() {
      this.homeEnabled = false;
      this.saveData();
    },

    // 设置首页背景透明度
    setHomeOpacity(value) {
      this.homeOpacity = Math.max(0, Math.min(100, Number(value) || 100));
      this.saveData();
    },

    // 首页背景昼夜自动切换：
    // 19:00 ~ 次日 06:00 为夜间，自动切到「夜间背景」(bg_new2.jpg)；
    // 白天则恢复原「白天首页背景」配置（进夜间前会快照一次，做到无侵入、可还原）。
    applyHomeDayNight() {
      const h = new Date().getHours();
      const isNight = h >= 19 || h < 6;
      if (isNight) {
        if (this.homePresetId !== "night") {
          // 仅在从非夜间切过来时，快照一次当前白天配置
          this.homeDaySnapshot = {
            homeType: this.homeType,
            homePresetId: this.homePresetId,
            homeCustomData: this.homeCustomData,
            homeEnabled: this.homeEnabled,
          };
          this.setHomePreset("night");
        }
      } else if (this.homeDaySnapshot) {
        // 回到白天：还原快照并清除
        const s = this.homeDaySnapshot;
        this.homeType = s.homeType;
        this.homePresetId = s.homePresetId;
        this.homeCustomData = s.homeCustomData;
        this.homeEnabled = s.homeEnabled;
        this.homeDaySnapshot = null;
        this.saveData();
      }
    },
  },
});
