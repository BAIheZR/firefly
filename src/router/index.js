import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '@/views/Home.vue'

// meta.landscape: true = 移动端进这个页面要横屏（横屏页面清单的唯一真源，新增游戏只在这里标一下）
const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },

  {
    path: '/set',
    name: 'Set',
    component: () => import('@/views/Set.vue')
  },
  {
    path: '/shop',
    name: 'Shop',
    component: () => import('@/views/Shop.vue')
  },
  {
    path: '/warehouse',
    name: 'Warehouse',
    component: () => import('@/views/Warehouse.vue')
  },
  {
    path: '/notify',
    name: 'Notify',
    component: () => import('@/views/notify.vue')
  },
  {
    path: '/music',
    name: 'Music',
    component: () => import('@/views/Music.vue'),
    meta: { landscape: true, landscapeTitle: '音乐' }
  },
  {
    path: '/idle',
    name: 'Idle',
    component: () => import('@/views/Idle.vue'),
    meta: { landscape: true, landscapeTitle: '挂机' }
  },
  {
    path: '/chess',
    name: 'Chess',
    component: () => import('@/views/Chess.vue'),
    meta: { landscape: true, landscapeTitle: '五子棋' }
  },
  {
    path: '/guess-word',
    name: 'GuessWord',
    component: () => import('@/views/GuessWord.vue'),
    meta: { landscape: true, landscapeTitle: '猜词' }
  },
  {
    path: '/werewolf',
    name: 'Werewolf',
    component: () => import('@/views/Werewolf.vue'),
    meta: { landscape: true, landscapeTitle: '萤火夜话' }
  },
  {
    path: '/multiplayer',
    name: 'Multiplayer',
    component: () => import('@/views/Multiplayer.vue'),
    meta: { landscape: true, landscapeTitle: '联机大厅' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router