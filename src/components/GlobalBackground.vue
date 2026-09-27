<template>
  <!-- 全局背景层：除首页外所有页面可见 -->
  <div
    v-if="showBackground"
    class="global-background"
    :style="bgStyle"
  ></div>
</template>

<script setup>
import { computed, watchEffect } from "vue";
import { useRoute } from "vue-router";
import { useBackgroundStore } from "@/config/background";

const route = useRoute();
const bgStore = useBackgroundStore();

// 首页不显示全局背景
const showBackground = computed(() => {
  if (!bgStore.enabled || !bgStore.backgroundImage) return false;
  return route.path !== "/";
});

const bgStyle = computed(() => ({
  backgroundImage: `url(${bgStore.backgroundImage})`,
  opacity: bgStore.bgOpacity,
}));

// 把页面内容透明度写入全局 CSS 变量，供页面内容 div 使用
watchEffect(() => {
  if (typeof document === "undefined") return;
  const val = bgStore.enabled ? bgStore.contentBgOpacity : 1;
  document.documentElement.style.setProperty(
    "--page-content-opacity",
    String(val)
  );
});
</script>

<style scoped>
.global-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: -1;
  pointer-events: none;
  transition: opacity 0.4s ease;
}
</style>
