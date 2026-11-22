<template>
  <div class="bag-page">
    <header class="bag-head">
      <button class="bag-back" title="返回主页" @click="goBack">
        <i class="fa-solid fa-arrow-left"></i>
        <span>返回</span>
      </button>
      <div class="bag-title">背包</div>
      <div class="bag-gold">
        <i class="fa-solid fa-coins"></i>
        <span>{{ gold }}</span>
      </div>
    </header>

    <nav class="bag-tabs">
      <router-link to="/bag/shop" class="bag-tab">商店</router-link>
      <router-link to="/bag/warehouse" class="bag-tab">仓库</router-link>
    </nav>

    <router-view />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGoldStore } from '@/config/gold'
import { goBackOrHome } from '@/utils/nav'

const router = useRouter()
const goldStore = useGoldStore()
const gold = computed(() => goldStore.currentGold)
const goBack = () => goBackOrHome(router)
</script>

<style scoped>
.bag-page {
  min-height: 100vh;
  background: #f4efe4;
  color: #3a3126;
}

.bag-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 24px 10px;
  max-width: 1400px;
  margin: 0 auto;
}

.bag-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
}

.bag-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 10px;
  border: 1px solid rgba(176, 138, 74, 0.35);
  background: rgba(251, 247, 238, 0.86);
  color: #6b5a40;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.bag-back:hover {
  color: #8a6a2e;
  border-color: rgba(176, 138, 74, 0.68);
}

.bag-gold {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(176, 138, 74, 0.28);
  background: rgba(251, 247, 238, 0.9);
  color: #b08a4a;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.bag-tabs {
  display: flex;
  gap: 8px;
  padding: 0 24px 14px;
  max-width: 1400px;
  margin: 0 auto;
}

.bag-tab {
  padding: 8px 20px;
  border-radius: 10px;
  border: 1px solid rgba(120, 95, 60, 0.18);
  background: rgba(255, 253, 248, 0.6);
  color: #6b5a40;
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.18s ease;
}

.bag-tab:hover {
  border-color: rgba(176, 138, 74, 0.55);
  color: #8a6a2e;
}

.bag-tab.router-link-active {
  background: linear-gradient(145deg, #c79a55, #a5763c);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 6px 16px rgba(176, 138, 74, 0.3);
}

.bag-tab.is-off {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 子页（shop / warehouse）在背包里不再占满整屏，也不重复 padding */
.bag-page :deep(.warehouse) {
  min-height: 0;
  background: transparent;
}

.bag-page :deep(.warehouse-body) {
  padding-top: 0;
  max-width: 1400px;
}

@media (max-width: 768px) {
  .bag-head {
    padding: calc(var(--safe-top, 0px) + 12px) 14px 8px;
  }
  .bag-tabs {
    padding: 0 14px 10px;
    overflow-x: auto;
  }
  .bag-tab {
    white-space: nowrap;
    padding: 7px 16px;
    font-size: 12.5px;
  }
  .bag-page :deep(.warehouse-body) {
    padding: 0 12px calc(var(--tabbar-h, 56px) + 12px);
  }
}
</style>
