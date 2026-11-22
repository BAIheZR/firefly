<template>
  <div class="play-page">
    <!-- 图标精灵：24 网格 / 1.75 描边 -->
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <symbol id="pg-chess" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><circle cx="7.6" cy="7.6" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.4" cy="16.4" r="1.6" fill="currentColor" stroke="none"/></symbol>
      <symbol id="pg-riddle" viewBox="0 0 24 24"><path d="M20.5 11.3a8.3 8.3 0 0 1-8.3 8.3H8.4L4.5 22v-4A8.3 8.3 0 1 1 20.5 11.3Z"/><path d="M9.9 9.5a2.25 2.25 0 1 1 3.2 2.1c-.7.34-1.1.85-1.1 1.55"/><circle cx="12" cy="15.4" r=".8" fill="currentColor" stroke="none"/></symbol>
      <symbol id="pg-moon" viewBox="0 0 24 24"><path d="M20.4 14.6A8.6 8.6 0 1 1 9.4 3.6a7 7 0 0 0 11 11Z"/></symbol>
      <symbol id="pg-signal" viewBox="0 0 24 24"><path d="M4 20v-5M9.3 20V9.5M14.7 20V6M20 20V3.5"/></symbol>
      <symbol id="pg-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/></symbol>
      <symbol id="pg-music" viewBox="0 0 24 24"><path d="M9.2 17.6V5.4l10.4-1.9v12"/><circle cx="6.6" cy="18" r="2.6"/><circle cx="17" cy="16" r="2.6"/></symbol>
    </svg>

    <header class="play-head">
      <button class="back" title="返回主页" @click="goBack">
        <i class="fa-solid fa-arrow-left"></i>
        <span>返回</span>
      </button>
      <div class="play-title">游乐场</div>
      <div class="play-sub">六种玩法，随时进来</div>
    </header>

    <div class="play-grid">
      <button
        v-for="g in games"
        :key="g.key"
        type="button"
        class="game"
        :class="{ off: g.off }"
        :disabled="g.off"
        @click="enter(g)"
      >
        <span class="gi">
          <svg class="ic" aria-hidden="true"><use :href="'#' + g.icon" /></svg>
        </span>
        <span class="gt">{{ g.name }}</span>
        <span class="gd">{{ g.desc }}</span>
        <span class="badge">{{ g.badge }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { goBackOrHome } from '@/utils/nav'

const router = useRouter()

const games = [
  { key: 'chess', name: '五子棋', desc: '胜 +500 金币 · 消耗行动点', badge: '可玩', icon: 'pg-chess', path: '/chess' },
  { key: 'guess', name: '猜字谜', desc: '80 金币/题 · 越早猜中越多', badge: '可玩', icon: 'pg-riddle', path: '/guess-word' },
  { key: 'werewolf', name: '萤火夜话', desc: '狼人杀 · 暂时维护中', badge: '维护中', icon: 'pg-moon', off: true },
  { key: 'mp', name: '联机大厅', desc: '联机功能暂时关闭', badge: '已禁用', icon: 'pg-signal', off: true },
  { key: 'idle', name: '挂机', desc: '离线也在赚金币', badge: '可玩', icon: 'pg-clock', path: '/idle' },
]

const enter = (g) => {
  if (g.off || !g.path) return
  router.push(g.path)
}
const goBack = () => goBackOrHome(router)
</script>

<style scoped>
.play-page {
  min-height: 100vh;
  background:
    radial-gradient(620px 340px at 78% 8%, rgba(255, 238, 205, 0.75), transparent 72%),
    #f4efe4;
  color: #3a3126;
  padding: 18px 24px 40px;
}

.play-head {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 1120px;
  margin: 0 auto 18px;
  flex-wrap: wrap;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(176, 138, 74, 0.35);
  background: rgba(251, 247, 238, 0.86);
  color: #6b5a40;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.back:hover {
  color: #8a6a2e;
  border-color: rgba(176, 138, 74, 0.68);
}

.play-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
}

.play-sub {
  font-size: 12px;
  color: #9a8a74;
}

.play-grid {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.game {
  position: relative;
  overflow: hidden;
  text-align: left;
  padding: 18px;
  border-radius: 16px;
  border: 1px solid rgba(120, 95, 60, 0.16);
  background: #fbf7ee;
  box-shadow: 0 8px 22px rgba(90, 70, 40, 0.12);
  cursor: pointer;
  font: inherit;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.game::after {
  content: '';
  position: absolute;
  right: -26px;
  bottom: -30px;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: rgba(176, 138, 74, 0.08);
}

.game:hover:not(.off) {
  transform: translateY(-3px);
  border-color: rgba(176, 138, 74, 0.55);
  box-shadow: 0 14px 30px rgba(90, 70, 40, 0.18);
}

.game.off {
  opacity: 0.45;
  cursor: not-allowed;
}

.gi {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(176, 138, 74, 0.12);
  color: #b08a4a;
}

.ic {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.gt {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
  margin-top: 4px;
}

.gd {
  font-size: 11.5px;
  color: #8a7a64;
}

.badge {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(63, 169, 138, 0.12);
  color: #3f8f78;
}

.game.off .badge {
  background: rgba(120, 95, 60, 0.1);
  color: #9a8a74;
}

@media (max-width: 900px) {
  .play-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}

@media (max-width: 768px) {
  .play-page {
    padding: calc(var(--safe-top, 0px) + 12px) 14px calc(var(--tabbar-h, 56px) + 20px);
  }
  .game {
    padding: 14px;
  }
  .gi {
    width: 34px;
    height: 34px;
  }
  .gt {
    font-size: 13.5px;
  }
  .gd {
    font-size: 10.5px;
  }
}
</style>
