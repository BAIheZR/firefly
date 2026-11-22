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
    component: () => import('@/views/set.vue')
  },
  // 背包：商店 / 仓库合并为同一页面的两个 tab（开箱下一步接入）
  {
    path: '/bag',
    component: () => import('@/views/Bag.vue'),
    redirect: '/bag/shop',
    children: [
      {
        path: 'shop',
        name: 'BagShop',
        component: () => import('@/views/shop.vue')
      },
      {
        path: 'warehouse',
        name: 'BagWarehouse',
        component: () => import('@/views/warehouse.vue')
      }
    ]
  },
  // 旧地址保持可用，统一重定向到背包
  { path: '/shop', redirect: '/bag/shop' },
  { path: '/warehouse', redirect: '/bag/warehouse' },
  {
    path: '/play',
    name: 'Play',
    component: () => import('@/views/Play.vue')
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