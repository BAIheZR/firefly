import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '@/views/Home.vue'

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
    component: () => import('@/views/Music.vue')
  },
  {
    path: '/idle',
    name: 'Idle',
    component: () => import('@/views/Idle.vue')
  },
  {
    path: '/chess',
    name: 'Chess',
    component: () => import('@/views/Chess.vue')
  },
  {
    path: '/guess-word',
    name: 'GuessWord',
    component: () => import('@/views/GuessWord.vue')
  },
  {
    path: '/multiplayer',
    name: 'Multiplayer',
    component: () => import('@/views/Multiplayer.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router